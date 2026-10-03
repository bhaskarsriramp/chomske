/**
 * Timeline.js: the edit, as time.
 *
 * ── LANES, NOT ONE MIXED TRACK ───────────────────────────────────────────────
 * A creator looks for "the zooms" or "the blurs", never for "everything at
 * fourteen seconds". So each kind of thing gets its own lane, always in the
 * same order, and an empty lane stays visible rather than collapsing — a demo
 * with no blur should show that it has no blur.
 *
 * ── IT IS DRAWN IN OUTPUT TIME ───────────────────────────────────────────────
 * The ruler is the finished video, not the recording. That is the only honest
 * way to show it: a zoom two thirds of the way through the export should be two
 * thirds of the way along the ruler, whatever was cut before it. Everything
 * stored is in RECORDING time, so each chip is mapped through the cuts
 * (placedSpans in model.js) and one zoom straddling a cut is drawn as the two
 * pieces it will actually play as.
 *
 * Cuts themselves are drawn as hatched gaps rather than as blocks on a lane,
 * because they are time that will not exist. Showing removed seconds as an
 * object on a track suggests it is something that plays.
 *
 * ── DRAGGING EDITS RECORDING TIME ────────────────────────────────────────────
 * A chip dragged along the ruler is moving through output time, and what gets
 * written is the recording time it maps back to. Without that, dragging a zoom
 * across a cut would silently change its length by however long the cut was.
 *
 * ── AN EMPTY STRETCH OF A LANE IS AN ADD BUTTON ──────────────────────────────
 * Hovering a gap in the Zoom, Blur or Captions lane draws the item a click
 * would make there, as a dashed outline, at its real length, with the time on
 * the ruler above it. Clicking makes it, selects it and opens its tab. Over an
 * existing item nothing is offered: that item is what a click there selects.
 * The outline is the promise, so it is sized by the same rules as the result:
 * the kind's usual length, cut short where the next item in the lane begins,
 * and not offered at all where there is no room.
 *
 * Mouse and pen only. A finger has no hover to preview with, and a tap that
 * silently created things would be worse than the panel's Add button.
 *
 * ── IT TAKES Ctrl + CLICK (⌘ + CLICK ON A MAC) ───────────────────────────────
 * A plain click on a lane only moves the playhead, as it always did. Adding,
 * and cutting the video, need the modifier held, because a stray click while
 * reaching for the playhead should never leave a zoom or a cut behind. The
 * outline still appears on hover, faint and naming the shortcut, and turns
 * solid while the key is down, so what a click would do is visible before it
 * is done. On a Mac only ⌘ counts: Ctrl + click there is the right-click menu.
 *
 * ── THE VIDEO LANE ───────────────────────────────────────────────────────────
 * The recording itself, above the others, drawn as its clips (clips.js).
 * Pointing at a clip offers "Cut here" on a dashed line: a click splits the
 * clip in two there and takes nothing out. A plain click on a clip selects it
 * (and moves the playhead there), which opens the Video tab, where it can be
 * deleted, and shows its edges for trimming. The red marks between clips are
 * where time was taken out; a click on one puts it back.
 *
 * ── THE BLUR LANE: A BLUR IS WHERE ITS SECRET IS ─────────────────────────────
 * A blur is not a stretch of time. It is put over one thing on the screen, at
 * one moment, and once applied it covers that thing wherever and whenever it
 * is on screen (follow.mjs, "Applying a blur"). So a blur here has no ends to
 * drag: it is a tag at the moment it was placed, saying where it is with being
 * applied (Apply, Applying… 40%, a tick), and once applied, the stretches it
 * actually covers, drawn faint along the lane. Ctrl/⌘ + click on the lane places a new one at
 * that moment, on one line rather than an outline, because it has no length.
 *
 * ── TRIMMING A CLIP BY ITS EDGES ─────────────────────────────────────────────
 * A selected clip grows a handle at each end. Dragging one inward shades what
 * will come off, in red, and shows on the preview the frame the clip will now
 * start or end on; dragging outward (only over footage taken out beside it,
 * see clips.js trimBounds) shades what comes back, in green. Nothing changes
 * until the handle is let go, so the lanes hold still under the pointer
 * instead of rippling on every pixel, and the whole drag is one undo step.
 *
 * ── THE MUSIC LANE IS IN OUTPUT TIME ─────────────────────────────────────────
 * The one lane stored the way it is drawn: music sits on the finished video
 * (musicTimeline.mjs), so its chips are placed, dragged and trimmed in output
 * time with no mapping through the cuts. Each chip draws its track's waveform,
 * repeating where the track loops. Ctrl/⌘ + click on an empty stretch does not
 * make anything by itself: there is no one right song, so it marks the moment
 * and opens the Music tab's library, where the track is chosen.
 *
 * ── THE WHEEL ZOOMS ──────────────────────────────────────────────────────────
 * Up zooms in and down zooms out, around the moment under the pointer: a mouse
 * wheel, a two-finger swipe on a trackpad and a pinch all do it. A sideways
 * swipe, or Shift with the wheel, is left alone, so it still pans.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layout, placedSpans, activeZooms, toSource, mergedCuts, clamp, fmtTime } from "./model";
import { applyState, coverage, blurNames } from "./follow.mjs";
import { DEFAULT_LENGTH, MIN_LENGTH } from "./create";
import { clipsOf, trimBounds, MIN_CLIP } from "./clips";
import { Icon } from "./ui";
import { musicItems, MUSIC_MIN } from "./musicTimeline.mjs";
import { LANE_COLOR as MUSIC_COLOR } from "./MusicPanel";

const LANES = [
  { key: "zooms", label: "Zoom", color: "#918DFF", icon: "zoom" },
  { key: "blurs", label: "Blur", color: "#FF9482", icon: "blur" },
  { key: "cues", label: "Captions", color: "#F09BE5", icon: "caption" },
];

// Every row, top to bottom: the recording, then the things laid over it.
const VIDEO = { key: "video", label: "Video", color: "#C5221F", icon: "film" };
// Last: the sound under it all (musicTimeline.mjs).
const MUSIC = { key: "music", label: "Music", color: MUSIC_COLOR, icon: "music" };
const ROWS = [VIDEO, ...LANES, MUSIC];

/** Smallest drag that counts, so a click on a chip is not read as a nudge. */
const SLOP = 3;

export default function Timeline({
  tl,
  time,
  onSeek,
  selection,
  onSelect,
  onChange,
  onRemoveCut,
  onAdd,
  onSplit,
  onTrim,
  // Each blur's follow and what is being applied (follow.mjs applyState), and
  // how to apply one from its tag.
  follows = null,
  following = null,
  onApplyBlur,
  // The music library by id ({ title, duration, peaks }), and what a Ctrl/⌘ +
  // click on the music lane does: mark that moment for the Music tab.
  musicTracks = null,
  onAddMusic,
  // Caption ids the voiceover doesn't say yet (voices.mjs voiceDiff): marked.
  voiceMissing = null,
  height = 30,
}) {
  const railRef = useRef(null);
  const viewRef = useRef(null);
  const [drag, setDrag] = useState(null);
  // What a click on the empty lane under the pointer would add: { lane, t, end }
  // in output time, or null.
  const [ghost, setGhost] = useState(null);
  // Whether the add modifier (Ctrl, or ⌘ on a Mac) is held right now, so the
  // outline can show that a click would act. Read from pointer moves, and from
  // the key itself so pressing it without moving the mouse arms it too.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Control" || e.key === "Meta") setArmed(e.type === "keydown" && addHeld(e));
    };
    const off = () => setArmed(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", off);
    };
  }, []);
  /**
   * ── ZOOM IS WIDTH ──────────────────────────────────────────────────────────
   * 1 fits the whole edit in the space there is. Past that the time area gets
   * wider than its window and scrolls, and everything drawn in it is placed in
   * percentages of that wider area — so nothing below needed to change to be
   * zoomable, only the thing it is measured against.
   */
  const [zoom, setZoom] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);

  const lay = useMemo(() => layout(tl), [tl]);
  const total = Math.max(0.1, lay.duration);
  const cuts = useMemo(() => mergedCuts(tl), [tl]);
  const clips = useMemo(() => clipsOf(tl, lay), [tl, lay]);

  const items = useMemo(() => {
    const out = {};
    for (const lane of LANES) {
      const source = lane.key === "zooms" ? activeZooms(tl) : tl[lane.key] || [];
      out[lane.key] = placedSpans(source, lay, { min: 0.03 });
    }
    // Already in output time: drawn where it is stored.
    out.music = musicItems(tl).map((m) => ({ ...m, end: m.start + m.duration }));
    return out;
  }, [tl, lay]);

  // The blur lane: each blur's tag, where it was placed, and once applied the
  // stretches it covers, in output time.
  const blurMarks = useMemo(() => {
    const names = blurNames(tl.blurs);
    const spans = (list) => placedSpans(list.map(([s, e]) => ({ start: s, end: e })), lay, { min: 0.005 });
    return (tl.blurs || []).map((b) => {
      const st = applyState(b, follows, following);
      const f = st.kind === "applied" ? follows?.[b.id] : null;
      return {
        b,
        st,
        name: names.get(b.id),
        at: outOf(b.at ?? b.start, lay),
        cover: spans(f ? coverage(f, b.end) : st.kind === "still" ? [[b.start, b.end]] : []),
      };
    });
  }, [tl, lay, follows, following]);

  /** Where along the rail, as a fraction, a pointer event landed. */
  const fractionAt = useCallback((clientX) => {
    // The rail's rectangle is the full zoomed width, scrolled or not, so a
    // pointer's offset into it is a fraction of the edit at any zoom.
    const r = railRef.current?.getBoundingClientRect();
    if (!r?.width) return 0;
    return clamp((clientX - r.left) / r.width, 0, 1);
  }, []);

  /* ── Zoom ─────────────────────────────────────────────────────────────── */
  // Where the view is about to be scrolled, between a zoom and the frame that
  // applies it. A trackpad sends wheel events faster than frames; anchoring
  // each one on the scroll the last one has not applied yet made it drift.
  const pendingScroll = useRef(null);
  const zoomBy = useCallback((factor, anchorClientX = null) => {
    const view = viewRef.current;
    setZoom((z) => {
      // Three decimals, not two: a trackpad's small steps each move the zoom
      // by less than a hundredth, and rounding them away stalled it at 100%.
      const next = clamp(Math.round(z * factor * 1000) / 1000, 1, ZOOM_MAX);
      if (view && next !== z) {
        // Keep the moment under the pointer (or the playhead) where it is on
        // screen, which is what makes zooming feel like zooming and not like
        // being thrown somewhere else in the edit.
        const vr = view.getBoundingClientRect();
        const x = anchorClientX == null ? null : anchorClientX - vr.left;
        const left = pendingScroll.current ?? view.scrollLeft;
        const focusFrac = x == null
          ? clamp(time / Math.max(0.1, total), 0, 1)
          : clamp((left + x) / (vr.width * z), 0, 1);
        const px = x == null ? vr.width / 2 : x;
        const target = Math.max(0, focusFrac * vr.width * next - px);
        pendingScroll.current = target;
        requestAnimationFrame(() => {
          view.scrollLeft = target;
          pendingScroll.current = null;
        });
      }
      return next;
    });
  }, [time, total]);

  // The wheel handler reads the latest zoomBy through a ref, so it is attached
  // once rather than again on every frame the playhead moves.
  const zoomByRef = useRef(zoomBy);
  zoomByRef.current = zoomBy;
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return undefined;
    const onWheel = (e) => {
      // Sideways is a pan: a horizontal swipe, or Shift with a wheel.
      if (e.shiftKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      // Lines and pages into pixels, so a mouse notch (about 100px) and a
      // trackpad's stream of small deltas land on one scale.
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      // A pinch arrives as a wheel with Ctrl held, in small deltas, and should
      // feel direct; a wheel notch should be one clear step, about a quarter.
      const k = e.ctrlKey || e.metaKey ? 0.01 : 0.0025;
      zoomByRef.current(Math.exp(-clamp(px, -240, 240) * k), e.clientX);
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => view.removeEventListener("wheel", onWheel);
  }, []);

  // While playing zoomed in, the view follows the playhead instead of letting
  // it run off the edge.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || zoom <= 1 || scrubbing) return;
    const w = view.clientWidth;
    const x = (time / Math.max(0.1, total)) * w * zoom;
    if (x < view.scrollLeft + w * 0.08 || x > view.scrollLeft + w * 0.92) view.scrollLeft = Math.max(0, x - w * 0.3);
  }, [time, total, zoom, scrubbing]);

  /* ── Scrubbing ────────────────────────────────────────────────────────── */
  const scrub = useCallback(
    (e) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onSeek(fractionAt(e.clientX) * total);
    },
    [fractionAt, onSeek, total]
  );

  const scrubMove = useCallback(
    (e) => {
      if (e.buttons !== 1) return;
      onSeek(fractionAt(e.clientX) * total);
    },
    [fractionAt, onSeek, total]
  );

  /* ── Moving and resizing a chip ───────────────────────────────────────── */
  const beginDrag = useCallback(
    (lane, item, mode) => (e) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onSelect({ kind: SINGULAR[lane], id: item.id });
      const src = lane === "music" ? { start: item.start, end: item.end, in: item.in || 0 } : { start: item.src_start, end: item.src_end };
      setDrag({ lane, id: item.id, mode, x0: e.clientX, moved: false, src });
    },
    [onSelect]
  );

  const moveDrag = useCallback(
    (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) < SLOP) return;
      if (!drag.moved) setDrag((d) => ({ ...d, moved: true }));

      const r = railRef.current?.getBoundingClientRect();
      if (!r?.width) return;

      // Both edges are converted through the cuts, so a chip pushed across a
      // removed stretch keeps the length it looks like it has on screen.
      const shift = (dx / r.width) * total;
      const from = drag.src;
      const kind = SINGULAR[drag.lane];

      // Music: output time, as stored. Its head trim moves where in the track
      // it starts too, so the song itself stays put under the trimmed edge.
      if (drag.lane === "music") {
        const m = musicItems(tl).find((x) => x.id === drag.id);
        if (!m) return;
        const L = musicTracks?.get(m.media)?.duration || 0;
        const loops = m.loop !== false && L > 0.5;
        const len = from.end - from.start;
        let start = from.start;
        let end = from.end;
        let inn = from.in;
        if (drag.mode === "move") {
          start = clamp(from.start + shift, 0, Math.max(0, total - len));
          end = start + len;
        } else if (drag.mode === "start") {
          // Not before the track's own first second unless it loops.
          start = clamp(from.start + shift, loops ? 0 : Math.max(0, from.start - from.in), from.end - MUSIC_MIN);
          inn = from.in + (start - from.start);
          if (loops) inn = ((inn % L) + L) % L;
        } else {
          // Not past the track's end unless it loops, nor past the video's.
          const most = loops || !L ? total : Math.min(total, from.start + (L - from.in));
          end = clamp(from.end + shift, from.start + MUSIC_MIN, most);
        }
        onChange({ kind, id: drag.id, patch: { start: round3(start), duration: round3(end - start), in: round3(inn) } });
        return;
      }
      const list = drag.lane === "zooms" ? tl.zooms : tl[drag.lane];
      const item = list?.find((x) => x.id === drag.id);
      if (!item) return;

      // The chip's own recording-time span, not the drawn piece's: a zoom split
      // across a cut is one object and must move as one.
      const len = item.end - item.start;
      let start = item.start;
      let end = item.end;

      if (drag.mode === "move") {
        const anchor = toSource(clamp(outOf(from.start, lay) + shift, 0, total), lay);
        start = clamp(anchor - (from.start - item.start), 0, (tl.duration || 0) - len);
        end = start + len;
      } else if (drag.mode === "start") {
        start = clamp(toSource(clamp(outOf(from.start, lay) + shift, 0, total), lay), 0, item.end - 0.15);
      } else {
        end = clamp(toSource(clamp(outOf(from.end, lay) + shift, 0, total), lay), item.start + 0.15, tl.duration || item.end);
      }

      onChange({ kind, id: drag.id, patch: { start: round3(start), end: round3(end) } });
    },
    [drag, lay, onChange, tl, total, musicTracks]
  );

  const endDrag = useCallback(() => setDrag(null), []);

  /* ── Trimming a clip by its edges ─────────────────────────────────────── */
  // While an edge is held: { clip, side, x0, from, lo, hi, to }, with `from`
  // the edge when the drag began and `to` where it is now, in recording time,
  // and [lo, hi] how far it may go (clips.js trimBounds).
  const [trim, setTrim] = useState(null);

  const beginTrim = useCallback(
    (clip, side) => (e) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const [lo, hi] = trimBounds(tl, clip)[side];
      const from = side === "start" ? clip.src_start : clip.src_end;
      setGhost(null);
      setTrim({ clip, side, x0: e.clientX, from, lo, hi, to: from });
    },
    [tl]
  );

  const moveTrim = useCallback(
    (e) => {
      if (!trim) return;
      const r = railRef.current?.getBoundingClientRect();
      if (!r?.width) return;
      const to = clamp(trim.from + ((e.clientX - trim.x0) / r.width) * total, trim.lo, trim.hi);
      setTrim((t) => (t ? { ...t, to } : t));
      // Trimming inward, the preview shows the frame the clip will now start
      // on, or the last one it will end on. Footage being brought back has no
      // place on the finished video yet, so there is nothing to show for it.
      const { clip, side } = trim;
      if (side === "start" ? to >= clip.src_start : to <= clip.src_end) {
        onSeek(Math.max(0, clip.out_start + (to - clip.src_start) - (side === "end" ? 0.03 : 0)));
      }
    },
    [trim, total, onSeek]
  );

  const endTrim = useCallback(() => {
    if (!trim) return;
    if (Math.abs(trim.to - trim.from) >= 0.01) onTrim?.(trim.clip, trim.side, trim.to);
    setTrim(null);
  }, [trim, onTrim]);

  /* ── Adding by pointing ───────────────────────────────────────────────── */
  /**
   * Where a new item would go if `lane` were clicked here, or null where there
   * is no room: on an existing item, or with too little time before the next.
   */
  const ghostAt = useCallback(
    (laneKey, clientX) => {
      const t = fractionAt(clientX) * total;
      // The label goes to the pointer's left when there is not room for it
      // on the right before the visible edge of the timeline.
      const edge = viewRef.current?.getBoundingClientRect().right ?? Infinity;
      const flip = edge - clientX < TAG_ROOM;

      // On the video, a split: anywhere inside a clip, not hard against its
      // ends, where it would leave a sliver too short to be a clip.
      if (laneKey === "video") {
        const inClip = clips.some((c) => t - c.out_start >= MIN_CLIP && c.out_end - t >= MIN_CLIP);
        return inClip ? { lane: laneKey, t, end: t, flip } : null;
      }

      // On the blur lane, a moment: a blur has no length of its own (see THE
      // BLUR LANE above), so there is no gap to fit and nothing is in the way.
      if (laneKey === "blurs") return { lane: laneKey, t, end: total, flip, point: true };

      // On the music lane, the free stretch: up to the next track or the end.
      if (laneKey === "music") {
        let gapEnd = total;
        for (const it of items.music) {
          if (t >= it.start && t <= it.end) return null;
          if (it.start > t && it.start < gapEnd) gapEnd = it.start;
        }
        return gapEnd - t >= MUSIC_MIN ? { lane: laneKey, t, end: gapEnd, flip } : null;
      }

      const kind = SINGULAR[laneKey];
      let gapEnd = total;
      for (const it of items[laneKey]) {
        if (t >= it.start && t <= it.end) return null;
        if (it.start > t && it.start < gapEnd) gapEnd = it.start;
      }
      const end = Math.min(gapEnd, t + DEFAULT_LENGTH[kind]);
      if (end - t < MIN_LENGTH[kind]) return null;
      return { lane: laneKey, t, end, flip };
    },
    [clips, fractionAt, items, total]
  );

  const addGhost = useCallback(
    (g) => {
      if (g.lane === "video") {
        // Stored in recording time, like everything else.
        onSplit(round3(toSource(g.t, lay)));
        onSeek(g.t);
      } else if (g.lane === "music") {
        // Output time; the track is chosen in the Music tab.
        onAddMusic?.(round3(g.t));
        onSeek(g.t + 0.05);
      } else {
        // Stored in recording time. Both ends are mapped rather than adding a
        // length to the start, so an item that crosses a cut covers what plays.
        onAdd(SINGULAR[g.lane], round3(toSource(g.t, lay)), round3(toSource(g.end, lay)));
        onSeek(g.t + 0.05);
      }
      setGhost(null);
    },
    [lay, onAdd, onSplit, onSeek, onAddMusic]
  );

  /* ── The ruler's tick marks ───────────────────────────────────────────── */
  const ticks = useMemo(() => {
    const span = total / zoom;
    const step = span <= 6 ? 0.5 : span <= 12 ? 1 : span <= 20 ? 2 : span <= 60 ? 5 : span <= 180 ? 15 : span <= 600 ? 60 : 120;
    const out = [];
    for (let t = 0; t <= total; t += step) out.push(t);
    return out;
  }, [total, zoom]);

  const playPct = (time / total) * 100;

  // The selected clip, and where its held edge is on the ruler during a trim.
  const selClip = selection?.kind === "clip" ? clips.find((c) => c.id === selection.id) || null : null;
  const trimLive = trim && selClip && trim.clip.id === selClip.id;
  const trimOrigin = trimLive ? (trim.side === "start" ? selClip.out_start : selClip.out_end) : null;
  const trimEdge = trimLive ? trimOrigin + (trim.to - trim.from) : null;
  // Inward makes the clip shorter: a later start, or an earlier end.
  const trimInward = trimLive ? (trim.side === "start" ? trim.to > trim.from : trim.to < trim.from) : false;

  /* ── The playhead can be grabbed ──────────────────────────────────────── */
  const grabHead = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setScrubbing(true);
      onSeek(fractionAt(e.clientX) * total);
    },
    [fractionAt, onSeek, total]
  );
  const dragHead = useCallback(
    (e) => {
      if (!scrubbing) return;
      onSeek(fractionAt(e.clientX) * total);
    },
    [scrubbing, fractionAt, onSeek, total]
  );
  const dropHead = useCallback(() => setScrubbing(false), []);

  const RULER = 25;

  return (
    <div className="st-timeline" style={{ userSelect: "none" }}>
      <div style={{ display: "flex", gap: 10 }}>
        {/* ── Lane names, which do not scroll ─────────────────────────── */}
        <div style={{ width: LABEL_W, flexShrink: 0, paddingTop: RULER }}>
          {ROWS.map((lane) => {
            // The video is always there; the other lanes read as empty until
            // something is on them.
            const full = lane.key === "video" || items[lane.key].length > 0;
            return (
              <div
                key={lane.key}
                style={{
                  height, marginBottom: 6, display: "flex", alignItems: "center", gap: 6,
                  fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
                  color: full ? "var(--ink-body)" : "var(--ink-mute)",
                  opacity: full ? 1 : 0.55,
                }}
              >
                <span style={{ color: full && lane.key !== "video" ? lane.color : "inherit" }}>
                  <Icon name={lane.icon} size={12} />
                </span>
                {lane.label}
              </div>
            );
          })}
        </div>

        {/* ── The time area, which zooms and scrolls ──────────────────── */}
        <div ref={viewRef} className="st-scroll" style={{ flex: 1, minWidth: 0, overflowX: zoom > 1 ? "auto" : "hidden", overflowY: "hidden", paddingBottom: zoom > 1 ? 4 : 0 }}>
          <div
            ref={railRef}
            style={{ position: "relative", width: `${zoom * 100}%`, minWidth: "100%" }}
            onPointerMove={(e) => { moveDrag(e); dragHead(e); moveTrim(e); }}
            onPointerUp={() => { endDrag(); dropHead(); endTrim(); }}
            onPointerCancel={() => { endDrag(); dropHead(); setTrim(null); }}
          >
            {/* Ruler */}
            <div
              style={{ position: "relative", height: 18, marginBottom: 7, cursor: "pointer" }}
              onPointerDown={scrub}
              onPointerMove={scrubMove}
            >
              {ticks.map((t) => (
                <span
                  key={t}
                  style={{
                    position: "absolute",
                    left: `${(t / total) * 100}%`,
                    fontSize: 9.5,
                    fontWeight: 650,
                    color: "var(--ink-mute)",
                    transform: t === 0 ? "none" : "translateX(-50%)",
                    fontVariantNumeric: "tabular-nums",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtTime(t)}
                </span>
              ))}
            </div>

            {/* A trim in progress: where the edge is going, and by how much. */}
            {trimEdge != null && (
              <span
                className="st-hover-time"
                style={{
                  left: `${(trimEdge / total) * 100}%`,
                  transform: `translateX(${trimEdge / total < 0.04 ? 0 : trimEdge / total > 0.96 ? -100 : -50}%)`,
                }}
              >
                {fmtTime(clamp(trimEdge, 0, total), true)} · {trimInward ? "−" : "+"}
                {Math.abs(trim.to - trim.from).toFixed(1)}s
              </span>
            )}

            {/* Where the pointer is, while it is offering to add something. */}
            {ghost && (
              <>
                <span
                  className="st-hover-time"
                  style={{
                    left: `${(ghost.t / total) * 100}%`,
                    // Kept inside the rail at either end rather than clipped.
                    transform: `translateX(${ghost.t / total < 0.04 ? 0 : ghost.t / total > 0.96 ? -100 : -50}%)`,
                  }}
                >
                  {fmtTime(ghost.t, true)}
                </span>
                <span className="st-hover-line" style={{ left: `${(ghost.t / total) * 100}%`, top: RULER - 6 }} />
              </>
            )}

            {/* Lanes: the video first, then the things laid over it. */}
            {ROWS.map((lane) => {
              const isVideo = lane.key === "video";
              const isMusic = lane.key === "music";
              const canAdd = isVideo ? !!onSplit : isMusic ? !!onAddMusic : !!onAdd;
              return (
              <div
                key={lane.key}
                className="st-lane"
                style={{
                  height, marginBottom: 6, marginTop: 0,
                  cursor: ghost?.lane === lane.key && armed ? (isVideo ? "pointer" : "copy") : isVideo ? "pointer" : undefined,
                }}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  // Only with the modifier held; a plain click moves the playhead.
                  const g = canAdd && e.pointerType !== "touch" && addHeld(e) ? ghostAt(lane.key, e.clientX) : null;
                  if (g) {
                    e.preventDefault();
                    addGhost(g);
                    return;
                  }
                  const t = fractionAt(e.clientX) * total;
                  // On the video, a plain click also selects the clip under it:
                  // cutting has its own key now, so a click is free to mean this.
                  if (isVideo) {
                    const c = clips.find((k) => t >= k.out_start && t <= k.out_end);
                    if (c) onSelect({ kind: "clip", id: c.id });
                  }
                  onSeek(t);
                }}
                onPointerMove={(e) => {
                  if (e.pointerType !== "touch") setArmed(addHeld(e));
                  // Nothing is offered mid-drag, mid-scrub, to a finger, or over
                  // a chip or a cut (the event's target is then that, not the lane).
                  const off = !canAdd || e.pointerType === "touch" || e.buttons || drag || scrubbing || trim || e.target !== e.currentTarget;
                  const next = off ? null : ghostAt(lane.key, e.clientX);
                  setGhost((g) => (g === next || (g && next && g.lane === next.lane && g.t === next.t) ? g : next));
                }}
                onPointerLeave={() => setGhost(null)}
              >
                {/* The clips. Nothing on a clip takes the pointer, its number
                    included: pointing at one reaches the lane, which offers
                    "Cut here" to Ctrl/⌘ + click and selects the clip on a
                    plain click. Only the selected clip's edge handles take it. */}
                {isVideo &&
                  clips.map((c) => {
                    const on = selection?.kind === "clip" && selection.id === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`st-clip${on ? " is-on" : ""}`}
                        style={{
                          left: `calc(${(c.out_start / total) * 100}% + 1px)`,
                          width: `calc(${((c.out_end - c.out_start) / total) * 100}% - 2px)`,
                        }}
                      >
                        <span className="st-clip-tag" aria-hidden="true">
                          {c.n}
                        </span>
                      </div>
                    );
                  })}

                {/* The selected clip's edges, to drag; and while one is held,
                    the stretch it will take off (red) or bring back (green). */}
                {isVideo && selClip && onTrim && (
                  <>
                    {trimEdge != null && Math.abs(trim.to - trim.from) >= 0.01 && (
                      <span
                        className={`st-trim-zone ${trimInward ? "is-cut" : "is-add"}`}
                        style={{
                          left: `${(Math.min(trimEdge, trimOrigin) / total) * 100}%`,
                          width: `${(Math.abs(trimEdge - trimOrigin) / total) * 100}%`,
                        }}
                      />
                    )}
                    {["start", "end"].map((side) => {
                      const held = trimEdge != null && trim.side === side;
                      const at = held ? trimEdge : side === "start" ? selClip.out_start : selClip.out_end;
                      return (
                        <span
                          key={side}
                          role="slider"
                          aria-label={`${side === "start" ? "Start" : "End"} of clip ${selClip.n}`}
                          aria-valuemin={0}
                          aria-valuemax={Math.round(total * 10) / 10}
                          aria-valuenow={Math.round(at * 10) / 10}
                          title="Drag to trim"
                          className={`st-trim is-${side}${held ? " is-active" : ""}`}
                          style={{ left: `${(at / total) * 100}%` }}
                          onPointerDown={beginTrim(selClip, side)}
                        />
                      );
                    })}
                  </>
                )}

                {ghost?.lane === lane.key && (
                  <div
                    className={`st-ghost${isVideo ? " is-cut" : ghost.point ? " is-point" : ""}${armed ? " is-armed" : ""}`}
                    aria-hidden="true"
                    style={{
                      left: `${(ghost.t / total) * 100}%`,
                      ...(isVideo
                        ? null
                        : ghost.point
                          ? { borderColor: lane.color }
                          : { width: `${((ghost.end - ghost.t) / total) * 100}%`, borderColor: lane.color, background: `${lane.color}1F` }),
                    }}
                  >
                    {/* The label is its own tag rather than text inside the
                        outline: a 2.5 second zoom or a 1.8 second caption is
                        often narrower than "Add caption", and the outline's
                        width is the promise, so it is not stretched to fit. */}
                    <span className={`st-ghost-tag${ghost.flip ? " is-left" : ""}`} style={{ borderColor: lane.color }}>
                      <kbd className="st-kbd">{ADD_KEY}</kbd>
                      <span style={{ color: "var(--ink-mute)", fontWeight: 600 }}>+ click</span>
                      <Icon name={isVideo ? "scissors" : isMusic ? "music" : "plus"} size={11} />
                      {isVideo ? "Cut here" : isMusic ? "Add music" : `Add ${NOUN[lane.key]}`}
                    </span>
                  </div>
                )}

                {/* Blurs: what each covers, then the tags above all of them. */}
                {lane.key === "blurs" &&
                  blurMarks.map((m) => {
                    const on = selection?.kind === "blur" && selection.id === m.b.id;
                    const pick = (e) => {
                      e.stopPropagation();
                      onSelect({ kind: "blur", id: m.b.id });
                      onSeek(fractionAt(e.clientX) * total);
                    };
                    return (
                      <Fragment key={m.b.id}>
                        {m.cover.map((s, k) => (
                          <span
                            key={`c${k}`}
                            className={`st-cover${on ? " is-on" : ""}`}
                            title={`${m.name} covers it here`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={pick}
                            style={{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%`, background: lane.color }}
                          />
                        ))}
                      </Fragment>
                    );
                  })}
                {lane.key === "blurs" &&
                  blurMarks.map((m) => (
                    <BlurTag
                      key={m.b.id}
                      mark={m}
                      color={lane.color}
                      left={(m.at / total) * 100}
                      on={selection?.kind === "blur" && selection.id === m.b.id}
                      onPick={() => {
                        onSelect({ kind: "blur", id: m.b.id });
                        onSeek(m.at + 0.02);
                      }}
                      onApply={onApplyBlur ? () => onApplyBlur(m.b) : null}
                    />
                  ))}

                {/* Music: each track with its waveform, in output time. */}
                {isMusic &&
                  items.music.map((item) => {
                    const on = selection?.kind === "music" && selection.id === item.id;
                    const track = musicTracks?.get(item.media);
                    return (
                      <div
                        key={item.id}
                        className={`st-chip st-mchip${on ? " is-on" : ""}${item.muted ? " is-muted" : ""}`}
                        title={`${track?.title || "Music"} · ${fmtTime(item.start, true)} – ${fmtTime(item.end, true)}${item.muted ? " · muted" : ""}`}
                        onPointerDown={beginDrag("music", item, "move")}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!drag?.moved) {
                            onSelect({ kind: "music", id: item.id });
                            onSeek(item.start + 0.05);
                          }
                        }}
                        style={{
                          left: `${(item.start / total) * 100}%`,
                          width: `${Math.max(0.6 / zoom, ((item.end - item.start) / total) * 100)}%`,
                          background: on ? lane.color : `${lane.color}40`,
                          borderColor: lane.color,
                          color: on ? "#fff" : "var(--ink-body)",
                        }}
                      >
                        <MusicWave item={item} track={track} on={on} />
                        <span className="st-grip is-start" onPointerDown={beginDrag("music", item, "start")} />
                        <span className="st-mchip-name">
                          <Icon name={item.muted ? "soundOff" : "music"} size={11} />
                          {track?.title || "Music"}
                        </span>
                        <span className="st-grip is-end" onPointerDown={beginDrag("music", item, "end")} />
                      </div>
                    );
                  })}

                {lane.key !== "blurs" && !isMusic && (items[lane.key] || []).map((item, i) => {
                  const left = (item.start / total) * 100;
                  const width = Math.max(0.6 / zoom, ((item.end - item.start) / total) * 100);
                  const on = selection?.kind === SINGULAR[lane.key] && selection.id === item.id;
                  return (
                    <div
                      key={`${item.id}_${i}`}
                      className={`st-chip${on ? " is-on" : ""}`}
                      title={chipTitle(lane.key, item)}
                      onPointerDown={beginDrag(lane.key, item, "move")}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!drag?.moved) {
                          onSelect({ kind: SINGULAR[lane.key], id: item.id });
                          onSeek(item.start + 0.05);
                        }
                      }}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: on ? lane.color : `${lane.color}55`,
                        borderColor: lane.color,
                        color: on ? "#fff" : "var(--ink-body)",
                      }}
                    >
                      <span className="st-grip is-start" onPointerDown={beginDrag(lane.key, item, "start")} />
                      {lane.key === "cues" && voiceMissing?.has(item.id) && (
                        <span className="st-chip-flag" title="Not in the voice-over yet" aria-label="Not in the voice-over yet" />
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
                        {chipLabel(lane.key, item)}
                      </span>
                      <span className="st-grip is-end" onPointerDown={beginDrag(lane.key, item, "end")} />
                    </div>
                  );
                })}

                {/* Cuts, on the video: each mark is where time was taken out. */}
                {isVideo &&
                  cuts.map((c) => {
                    const at = outOf(c.start, lay);
                    return (
                      <span
                        key={c.id || `${c.start}`}
                        className="st-cut"
                        title={`Cut ${fmtTime(c.end - c.start, true)} — click to restore`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveCut?.(c);
                        }}
                        style={{ left: `${(at / total) * 100}%`, width: 6, marginLeft: -3 }}
                      />
                    );
                  })}
              </div>
              );
            })}

            {/* The playhead: a line to see, and a handle to hold. The handle
                is wider than the line so it can be caught with a mouse. */}
            <div
              className="st-playhead"
              style={{ left: `${playPct}%`, top: RULER - 6, bottom: 0 }}
            />
            <div
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={Math.round(total * 10) / 10}
              aria-valuenow={Math.round(time * 10) / 10}
              title="Drag to scrub"
              onPointerDown={grabHead}
              style={{
                position: "absolute", top: 0, bottom: 0, left: `${playPct}%`, width: 16, marginLeft: -8,
                cursor: scrubbing ? "grabbing" : "grab", zIndex: 6, touchAction: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── What the ruler is showing ──────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 11, paddingLeft: LABEL_W + 10, fontSize: 11.5, color: "var(--ink-mute)", flexWrap: "wrap" }}>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-body)", fontWeight: 650 }}>
          {fmtTime(time, true)} / {fmtTime(total, true)}
        </span>
        {lay.removed > 0.05 && (
          <span>
            {fmtTime(lay.removed, true)} cut from {fmtTime(tl.duration || 0, true)}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={zoom <= 1} title="Zoom out (Ctrl + wheel)" aria-label="Zoom timeline out" style={zoomBtn(zoom <= 1)}>
            <Icon name="minus" size={12} />
          </button>
          <span style={{ minWidth: 38, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650, color: "var(--ink-body)" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" onClick={() => zoomBy(1.5)} disabled={zoom >= ZOOM_MAX} title="Zoom in (Ctrl + wheel)" aria-label="Zoom timeline in" style={zoomBtn(zoom >= ZOOM_MAX)}>
            <Icon name="plus" size={12} />
          </button>
          {zoom > 1 && (
            <button type="button" onClick={() => setZoom(1)} title="Fit the whole edit" style={{ ...zoomBtn(false), width: "auto", padding: "0 8px", fontSize: 11 }}>
              Fit
            </button>
          )}
        </span>
        {/* "Cut here" lives with the play controls under the preview now
            (StudioEditor.js transport), beside full screen. */}
      </div>
    </div>
  );
}

/**
 * A blur on its lane: a tag at the moment it was placed, saying where it is
 * with being applied (follow.mjs applyState), with the Apply button on it
 * while it needs one. It starts at the moment and runs right, or ends at the
 * moment and runs left when that is near the end of the timeline.
 */
function BlurTag({ mark, color, left, on, onPick, onApply }) {
  const { st, name } = mark;
  const pct = st.kind === "applying" && st.progress > 0 ? ` ${Math.round(st.progress * 100)}%` : "";
  const needs = st.kind === "unapplied" || st.kind === "failed";
  const title = {
    unapplied: `${name}: not applied yet. It stays where you put it until you apply it.`,
    applying: `${name}: applying. Finding it through the whole recording.`,
    applied: `${name}: applied. It covers this wherever it is on screen.`,
    still: `${name}: applied. Nothing under it to recognise, so it stays where you put it.`,
    failed: `${name}: couldn't be applied. Try again.`,
  }[st.kind];
  return (
    <div
      className={`st-btag is-${st.kind}${on ? " is-on" : ""}${left > 78 ? " is-flip" : ""}`}
      role="button"
      tabIndex={0}
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      style={{ left: `${left}%`, "--lane": color }}
    >
      {st.kind === "applying" ? (
        <span className="st-spin" aria-hidden="true" />
      ) : st.kind === "applied" ? (
        <Icon name="check" size={11} />
      ) : st.kind === "failed" ? (
        <Icon name="alert" size={11} />
      ) : (
        <Icon name="blur" size={11} />
      )}
      <span className="st-btag-name">{st.kind === "applying" ? `Applying…${pct}` : name}</span>
      {needs && onApply && (
        <button
          type="button"
          className="st-btag-apply"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
        >
          {st.kind === "failed" ? "Try again" : "Apply"}
        </button>
      )}
    </div>
  );
}

/** How far the timeline zooms in. 12x on a minute-long demo is five seconds across. */
const ZOOM_MAX = 12;

const zoomBtn = (off) => ({
  width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: "1px solid var(--line)", background: "var(--card)", color: off ? "var(--ink-mute)" : "var(--ink-body)",
  borderRadius: 7, cursor: off ? "default" : "pointer", opacity: off ? 0.5 : 1, fontFamily: "inherit", fontWeight: 650,
});

const LABEL_W = 74;

const SINGULAR = { zooms: "zoom", blurs: "blur", cues: "cue", music: "music" };
const NOUN = { zooms: "zoom", blurs: "blur", cues: "caption", music: "music" };

/**
 * A music chip's waveform: the track's loudest moments across the stretch it
 * plays, from where it starts in the track, repeating where it loops. Drawn as
 * bars in a viewBox that stretches with the chip.
 */
function MusicWave({ item, track, on }) {
  const peaks = track?.peaks;
  const L = track?.duration || 0;
  if (!peaks?.length || !(L > 0)) return null;
  const bars = 64;
  const vals = [];
  for (let i = 0; i < bars; i++) {
    let at = (item.in || 0) + (item.duration * (i + 0.5)) / bars;
    if (item.loop !== false) at %= L;
    else if (at > L) {
      vals.push(0);
      continue;
    }
    vals.push(peaks[Math.min(peaks.length - 1, Math.floor((at / L) * peaks.length))] || 0);
  }
  return (
    <svg className="st-mchip-wave" viewBox={`0 0 ${bars} 100`} preserveAspectRatio="none" aria-hidden="true">
      {vals.map((v, i) => (
        <rect key={i} x={i + 0.18} width={0.64} y={50 - Math.max(4, v) / 2.4} height={Math.max(4, v) / 1.2} rx={0.3} fill={on ? "rgba(255,255,255,.55)" : "currentColor"} />
      ))}
    </svg>
  );
}

/** Pixels the add label needs to the right of the pointer, or it flips left. */
const TAG_ROOM = 190;

/**
 * The key held to add or cut from the timeline. ⌘ on a Mac, because Ctrl +
 * click there opens the right-click menu; Ctrl everywhere else.
 */
const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "");
const ADD_KEY = IS_MAC ? "⌘" : "Ctrl";
const addHeld = (e) => (IS_MAC ? !!e.metaKey : !!e.ctrlKey);

/** Recording time → output time, snapping a moment inside a cut forward. */
function outOf(srcT, lay) {
  for (const s of lay.segments) {
    if (srcT <= s.src_start) return s.out_start;
    if (srcT <= s.src_end) return s.out_start + (srcT - s.src_start);
  }
  return lay.duration;
}

function chipLabel(lane, item) {
  if (lane === "zooms") return `${Number(item.level || 1).toFixed(1)}×`;
  if (lane === "blurs") return item.label || "Blur";
  return item.text || "";
}

function chipTitle(lane, item) {
  const when = `${fmtTime(item.start, true)} – ${fmtTime(item.end, true)}`;
  if (lane === "zooms") return `${item.label || "Zoom"} ${Number(item.level || 1).toFixed(2)}× · ${when}`;
  if (lane === "blurs") return `${item.label || "Blur"} · ${when}`;
  return `${item.text} · ${when}`;
}

const round3 = (v) => Math.round(v * 1000) / 1000;
