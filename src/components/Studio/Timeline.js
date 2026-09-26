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
 * ── THE VIDEO LANE ───────────────────────────────────────────────────────────
 * The recording itself, above the others. Pointing at it offers "Cut here":
 * the hatched outline is the two seconds a click removes. The cuts already
 * made are drawn on it too, as the marks where time was taken out, and a click
 * on one puts that time back.
 *
 * ── THE WHEEL ZOOMS ──────────────────────────────────────────────────────────
 * Up zooms in and down zooms out, around the moment under the pointer: a mouse
 * wheel, a two-finger swipe on a trackpad and a pinch all do it. A sideways
 * swipe, or Shift with the wheel, is left alone, so it still pans.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layout, placedSpans, activeZooms, toSource, mergedCuts, clamp, fmtTime } from "./model";
import { DEFAULT_LENGTH, MIN_LENGTH } from "./create";
import { Icon } from "./ui";

const LANES = [
  { key: "zooms", label: "Zoom", color: "#918DFF", icon: "zoom" },
  { key: "blurs", label: "Blur", color: "#FF9482", icon: "blur" },
  { key: "cues", label: "Captions", color: "#F09BE5", icon: "caption" },
];

// Every row, top to bottom: the recording, then the things laid over it.
const VIDEO = { key: "video", label: "Video", color: "#C5221F", icon: "film" };
const ROWS = [VIDEO, ...LANES];

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
  onAddCut,
  height = 30,
}) {
  const railRef = useRef(null);
  const viewRef = useRef(null);
  const [drag, setDrag] = useState(null);
  // What a click on the empty lane under the pointer would add: { lane, t, end }
  // in output time, or null.
  const [ghost, setGhost] = useState(null);
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

  const items = useMemo(() => {
    const out = {};
    for (const lane of LANES) {
      const source = lane.key === "zooms" ? activeZooms(tl) : tl[lane.key] || [];
      out[lane.key] = placedSpans(source, lay, { min: 0.03 });
    }
    return out;
  }, [tl, lay]);

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
      setDrag({ lane, id: item.id, mode, x0: e.clientX, moved: false, src: { start: item.src_start, end: item.src_end } });
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
    [drag, lay, onChange, tl, total]
  );

  const endDrag = useCallback(() => setDrag(null), []);

  /* ── Adding by pointing ───────────────────────────────────────────────── */
  /**
   * Where a new item would go if `lane` were clicked here, or null where there
   * is no room: on an existing item, or with too little time before the next.
   */
  const ghostAt = useCallback(
    (laneKey, clientX) => {
      const kind = laneKey === "video" ? "cut" : SINGULAR[laneKey];
      const t = fractionAt(clientX) * total;
      let gapEnd = total;
      // A cut may go anywhere on the video; the other kinds only in a gap.
      for (const it of items[laneKey] || []) {
        if (t >= it.start && t <= it.end) return null;
        if (it.start > t && it.start < gapEnd) gapEnd = it.start;
      }
      const end = Math.min(gapEnd, t + DEFAULT_LENGTH[kind]);
      if (end - t < MIN_LENGTH[kind]) return null;
      // The label goes to the pointer's left when there is not room for it
      // on the right before the visible edge of the timeline.
      const edge = viewRef.current?.getBoundingClientRect().right ?? Infinity;
      return { lane: laneKey, t, end, flip: edge - clientX < TAG_ROOM };
    },
    [fractionAt, items, total]
  );

  const addGhost = useCallback(
    (g) => {
      if (g.lane === "video") {
        // The editor's addCut takes output time and removes DEFAULT_LENGTH.cut
        // from there. Landing on the cut point shows what now follows it.
        onAddCut(g.t);
        onSeek(g.t);
      } else {
        // Stored in recording time. Both ends are mapped rather than adding a
        // length to the start, so an item that crosses a cut covers what plays.
        onAdd(SINGULAR[g.lane], round3(toSource(g.t, lay)), round3(toSource(g.end, lay)));
        onSeek(g.t + 0.05);
      }
      setGhost(null);
    },
    [lay, onAdd, onAddCut, onSeek]
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
            onPointerMove={(e) => { moveDrag(e); dragHead(e); }}
            onPointerUp={() => { endDrag(); dropHead(); }}
            onPointerCancel={() => { endDrag(); dropHead(); }}
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
              const canAdd = isVideo ? !!onAddCut : !!onAdd;
              return (
              <div
                key={lane.key}
                className="st-lane"
                style={{ height, marginBottom: 6, marginTop: 0, cursor: ghost?.lane === lane.key ? (isVideo ? "pointer" : "copy") : undefined }}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const g = canAdd && e.pointerType !== "touch" ? ghostAt(lane.key, e.clientX) : null;
                  if (g) addGhost(g);
                  else onSeek(fractionAt(e.clientX) * total);
                }}
                onPointerMove={(e) => {
                  // Nothing is offered mid-drag, mid-scrub, to a finger, or over
                  // a chip or a cut (the event's target is then that, not the lane).
                  const off = !canAdd || e.pointerType === "touch" || e.buttons || drag || scrubbing || e.target !== e.currentTarget;
                  const next = off ? null : ghostAt(lane.key, e.clientX);
                  setGhost((g) => (g === next || (g && next && g.lane === next.lane && g.t === next.t) ? g : next));
                }}
                onPointerLeave={() => setGhost(null)}
              >
                {/* The recording, as one strip the length of the edit. It never
                    takes the pointer, so pointing at it reaches the lane. */}
                {isVideo && <span className="st-clip" aria-hidden="true" />}

                {ghost?.lane === lane.key && (
                  <div
                    className={`st-ghost${isVideo ? " is-cut" : ""}`}
                    aria-hidden="true"
                    style={{
                      left: `${(ghost.t / total) * 100}%`,
                      width: `${((ghost.end - ghost.t) / total) * 100}%`,
                      ...(isVideo ? null : { borderColor: lane.color, background: `${lane.color}1F` }),
                    }}
                  >
                    {/* The label is its own tag rather than text inside the
                        outline: a 2.5 second zoom or a 1.8 second caption is
                        often narrower than "Add caption", and the outline's
                        width is the promise, so it is not stretched to fit. */}
                    <span className={`st-ghost-tag${ghost.flip ? " is-left" : ""}`} style={{ borderColor: lane.color }}>
                      <Icon name={isVideo ? "scissors" : "plus"} size={11} />
                      {isVideo ? "Cut here" : `Add ${NOUN[lane.key]}`}
                    </span>
                  </div>
                )}

                {(items[lane.key] || []).map((item, i) => {
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

/** How far the timeline zooms in. 12x on a minute-long demo is five seconds across. */
const ZOOM_MAX = 12;

const zoomBtn = (off) => ({
  width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: "1px solid var(--line)", background: "var(--card)", color: off ? "var(--ink-mute)" : "var(--ink-body)",
  borderRadius: 7, cursor: off ? "default" : "pointer", opacity: off ? 0.5 : 1, fontFamily: "inherit", fontWeight: 650,
});

const LABEL_W = 74;

const SINGULAR = { zooms: "zoom", blurs: "blur", cues: "cue" };
const NOUN = { zooms: "zoom", blurs: "blur", cues: "caption" };

/** Pixels the add label needs to the right of the pointer, or it flips left. */
const TAG_ROOM = 118;

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
