import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { layout, anchorAt, placedSegments, captionText, segmentsOf } from "./model";
import { Btn, Icon, fmtTime } from "./ui";

/**
 * The timeline, for a mouse.
 *
 * Five tracks: the video (script lines, or the parts of a video uploaded on its
 * own), captions, B-roll, text and music. Drag a clip's edges to trim it, drag
 * B-roll, text or music to move it and their right edge to change how long they
 * last, drag a caption's edges to change when it shows. Click empty track to
 * move the playhead.
 *
 * Ctrl (⌘ on a Mac, or Alt) with the wheel zooms around the pointer, and so does
 * a trackpad pinch; the wheel alone scrolls along the edit. + and − zoom around
 * the playhead, Fit shows the whole edit.
 *
 * Clicking the empty B-roll row also offers to put something there: upload a
 * photo or clip, or pick one already uploaded. That is the moment a creator
 * decides it: they hear themselves say "this table" and click under it.
 *
 * Trims ripple, because that is what the edit is: the clips play one after
 * another with nothing between them, so shortening one pulls the next in.
 * B-roll rides with the clip it was dropped on.
 *
 * ── PARTS OF ONE VIDEO BUTT UP AGAINST EACH OTHER ────────────────────────────
 * A video cut at its captions is a row of parts that play straight on from one
 * another. Dragging an edge inward cuts that bit out. Dragging it outward takes
 * back what was cut and, past that, moves the cut into the neighbouring part, so
 * the same moment of the recording is never played twice.
 *
 * Desktop only. On a phone the same edits are the buttons in the panels; a
 * 12-pixel drag handle is not a touch control.
 */
const ROW = 36;
const LABEL = 64;
const POPOVER_W = 264;
const MIN_PPS = 0.5;
const MAX_PPS = 400;
const snap = (v) => Math.round(v * 20) / 20;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function Timeline({
  tl, lay, mediaById, mode = "script", term = "B-roll", time, playing, selection, assets = [], waiting = {},
  onSelect, onSeek, onChange, onSplit, onAutoCut = () => {}, onJoin = () => {}, onAddBrollAt, onUploadBrollAt,
}) {
  const free = mode === "free";
  const [pps, setPps] = useState(36);
  const ppsRef = useRef(36);
  const zoomAnchor = useRef(null);
  const [adding, setAdding] = useState(null);
  const [cutMenu, setCutMenu] = useState(false);
  const root = useRef(null);
  const scroller = useRef(null);
  const drag = useRef(null);

  const width = Math.max(560, LABEL + lay.duration * pps + 60);
  const clips = lay.clips.filter((c) => c.start !== null);
  const broll = lay.broll.filter((b) => b.start !== null);
  const texts = tl.texts || [];
  const audio = tl.audio || [];

  // One block per caption section, where it plays. A section a cut runs through
  // shows once on each side of the cut.
  const captionBlocks = useMemo(() => {
    const seen = new Set();
    return placedSegments(tl, lay).filter((p) => {
      const key = `${p.seg.id}:${p.clip.id}`;
      if (seen.has(key) || !(p.seg.text || p.seg.roman)) return false;
      seen.add(key);
      return true;
    });
  }, [tl, lay]);

  // How far each caption section's edges can go: up to its neighbours in the same recording.
  const captionRoom = useMemo(() => {
    const byMedia = new Map();
    for (const s of segmentsOf(tl)) {
      if (!byMedia.has(s.media)) byMedia.set(s.media, []);
      byMedia.get(s.media).push(s);
    }
    const room = new Map();
    for (const [media, list] of byMedia) {
      list.sort((a, b) => a.start - b.start);
      const end = mediaById.get(media)?.duration || Infinity;
      list.forEach((s, i) => room.set(s.id, { min: i > 0 ? list[i - 1].end : 0, max: i < list.length - 1 ? list[i + 1].start : end }));
    }
    return room;
  }, [tl, mediaById]);

  // Every part's own words, so a row of parts reads as the sentences they are.
  const words = useMemo(() => {
    if (!free) return new Map();
    const out = new Map();
    for (const { seg, clip } of placedSegments(tl, lay)) {
      const prev = out.get(clip.id) || "";
      if (prev.length < 90) out.set(clip.id, `${prev} ${captionText(seg, tl.captions)}`.trim());
    }
    return out;
  }, [free, tl, lay]);

  const joinable = useMemo(
    () => tl.clips.some((c, i) => {
      const p = tl.clips[i - 1];
      return p && p.media && p.media === c.media && p.enabled && c.enabled && Math.abs(p.out - c.in) < 0.002;
    }),
    [tl.clips]
  );

  // ── Zoom ────────────────────────────────────────────────────────────────
  // The moment under the pointer (or the playhead) stays put on screen while
  // the scale changes around it, which is what makes zooming feel like zooming.
  const zoomTo = useCallback((next, at = null, t = null) => {
    const el = scroller.current;
    const p = ppsRef.current;
    const target = clamp(next, MIN_PPS, MAX_PPS);
    if (!el || Math.abs(target - p) < 1e-3) return;
    const x = at ?? el.clientWidth / 2;
    zoomAnchor.current = { t: t ?? Math.max(0, (el.scrollLeft + x - LABEL) / p), x };
    ppsRef.current = target;
    setPps(target);
  }, []);

  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = scroller.current;
    if (!a || !el) return;
    zoomAnchor.current = null;
    el.scrollLeft = Math.max(0, LABEL + a.t * pps - a.x);
  }, [pps]);

  // A wheel listener React cannot attach: it has to be non-passive to stop the
  // browser zooming the whole page on Ctrl + wheel.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        zoomTo(ppsRef.current * Math.exp(-e.deltaY * unit * 0.0025), e.clientX - el.getBoundingClientRect().left);
      } else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * unit;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const zoomAtPlayhead = (factor) => {
    const el = scroller.current;
    if (!el) return;
    const x = LABEL + Math.min(time, lay.duration) * ppsRef.current - el.scrollLeft;
    zoomTo(ppsRef.current * factor, x >= LABEL && x <= el.clientWidth ? x : null);
  };
  const zoomKeys = useRef(zoomAtPlayhead);
  zoomKeys.current = zoomAtPlayhead;

  const fit = () => {
    const el = scroller.current;
    if (!el || !(lay.duration > 0)) return;
    // The track is LABEL + duration × pps + 60 wide (see `width`); this fills the view exactly.
    zoomTo((el.clientWidth - LABEL - 62) / lay.duration, LABEL, 0);
    el.scrollLeft = 0;
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = String(e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "=" || e.key === "+") zoomKeys.current(1.5);
      else if (e.key === "-" || e.key === "_") zoomKeys.current(1 / 1.5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = LABEL + time * pps;
    if (x < el.scrollLeft + LABEL || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - LABEL - 40;
  }, [time, pps, playing]);

  // The add and auto-cut menus close on a press anywhere else, Escape, or scrolling away.
  useEffect(() => {
    if (!adding && !cutMenu) return undefined;
    const away = (e) => {
      if (adding && !e.target.closest?.("[data-broll-add]")) setAdding(null);
      if (cutMenu && !e.target.closest?.("[data-cut-menu]")) setCutMenu(false);
    };
    const key = (e) => {
      if (e.key !== "Escape") return;
      setAdding(null);
      setCutMenu(false);
    };
    const el = scroller.current;
    const scrolled = () => setAdding(null);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    el?.addEventListener("scroll", scrolled);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      el?.removeEventListener("scroll", scrolled);
    };
  }, [adding, cutMenu]);

  const start = (e, info) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { ...info, x0: e.clientX, key: `drag:${info.kind}:${info.id}:${e.timeStamp}` };
    onSelect(info.select, info.id);
  };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.x0) / pps;
    onChange((t) => {
      if (d.kind === "clip-in" || d.kind === "clip-out") {
        const c = t.clips.find((x) => x.id === d.id);
        if (!c) return;
        const o = d.orig;
        if (d.kind === "clip-in") {
          let v = Math.min(r3(o.in + snap(dt)), c.out - 0.1);
          const p = o.prev && t.clips.find((x) => x.id === o.prev.id);
          if (p) {
            v = Math.max(v, o.prev.in + 0.1);
            p.out = r3(Math.min(o.prev.out, v));
          } else v = Math.max(0, v);
          c.in = r3(v);
        } else {
          let v = Math.max(r3(o.out + snap(dt)), c.in + 0.1);
          const n = o.next && t.clips.find((x) => x.id === o.next.id);
          if (n) {
            v = Math.min(v, o.next.out - 0.1);
            n.in = r3(Math.max(o.next.in, v));
          } else v = Math.min(v, mediaById.get(c.media)?.duration || c.out + 30);
          c.out = r3(v);
        }
      } else if (d.kind === "cap-in" || d.kind === "cap-out") {
        if (!Array.isArray(t.segments)) t.segments = segmentsOf(t);
        const s = t.segments.find((x) => x.id === d.id);
        if (!s) return;
        const o = d.orig;
        if (d.kind === "cap-in") s.start = r3(clamp(o.start + snap(dt), o.min, s.end - 0.2));
        else s.end = r3(clamp(o.end + snap(dt), s.start + 0.2, o.max));
      } else if (d.kind === "broll-move") {
        const b = t.broll.find((x) => x.id === d.id);
        if (!b) return;
        const L = layout(t);
        const at = anchorAt(L, clamp(d.orig.start + dt, 0, Math.max(0, L.duration - 0.2)));
        if (at) {
          b.clip = at.clip.id;
          b.offset = snap(at.offset);
        }
      } else if (d.kind === "broll-len") {
        const b = t.broll.find((x) => x.id === d.id);
        if (b) b.duration = clamp(snap(d.orig.duration + dt), 0.3, 120);
      } else if (d.kind === "text-move" || d.kind === "text-len") {
        const x = t.texts.find((y) => y.id === d.id);
        if (!x) return;
        if (d.kind === "text-move") x.start = clamp(snap(d.orig.start + dt), 0, Math.max(0, lay.duration - 0.2));
        else x.duration = clamp(snap(d.orig.duration + dt), 0.3, 120);
      } else if (d.kind === "audio-move" || d.kind === "audio-len") {
        const a = t.audio.find((y) => y.id === d.id);
        if (!a) return;
        if (d.kind === "audio-move") a.start = clamp(snap(d.orig.start + dt), 0, Math.max(0, lay.duration - 0.5));
        else a.duration = clamp(snap(d.orig.duration + dt), 0.5, Math.max(0.5, (mediaById.get(a.media)?.duration || 600) - (a.in || 0)));
      }
    }, d.key);
  };

  const end = () => { drag.current = null; };

  const seekFrom = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - LABEL;
    if (x < 0) return;
    onSeek(clamp(x / pps, 0, lay.duration));
  };

  const openAdd = (e) => {
    if (!lay.duration || !root.current) return;
    const track = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - track.left - LABEL;
    if (x < 0) return;
    const box = root.current.getBoundingClientRect();
    setAdding({
      t: clamp(x / pps, 0, Math.max(0, lay.duration - 0.05)),
      left: clamp(e.clientX - box.left, POPOVER_W / 2 + 8, box.width - POPOVER_W / 2 - 8),
      top: track.top - box.top,
    });
  };

  const isSel = (kind, id) => selection.kind === kind && selection.id === id;

  const block = ({ key, left, w, label, kind, id, selectKind, color, handles, orig, sub, swatch }) => (
    <div
      key={key}
      data-kind={kind}
      onPointerDown={handles.move ? (e) => start(e, { kind: handles.move, id, select: selectKind, orig }) : (e) => { e.stopPropagation(); onSelect(selectKind, id); }}
      title={label}
      style={{
        position: "absolute", top: 4, height: ROW - 8, left, width: Math.max(4, w),
        borderRadius: 6, background: color, overflow: "hidden", cursor: handles.move ? "grab" : "pointer",
        border: `1.5px solid ${isSel(selectKind, id) ? "var(--ink)" : "rgba(0,0,0,.08)"}`,
        boxShadow: isSel(selectKind, id) ? "0 0 0 1px var(--ink)" : "none",
        display: "flex", alignItems: "center", padding: "0 10px", fontSize: 11.5, fontWeight: 600, color: "var(--ink)",
        whiteSpace: "nowrap", userSelect: "none", touchAction: "none", boxSizing: "border-box",
      }}
    >
      {handles.left && <Handle side="left" onPointerDown={(e) => start(e, { kind: handles.left, id, select: selectKind, orig })} />}
      {swatch && <span style={{ width: 9, height: 9, borderRadius: 2, background: swatch, border: "1px solid rgba(0,0,0,.35)", marginRight: 5, flexShrink: 0 }} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {sub && <span style={{ marginLeft: 6, fontWeight: 500, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
      {handles.right && <Handle side="right" onPointerDown={(e) => start(e, { kind: handles.right, id, select: selectKind, orig })} />}
    </div>
  );

  const every = pps >= 200 ? 0.5 : pps >= 80 ? 1 : pps >= 30 ? 5 : pps >= 12 ? 10 : pps >= 4 ? 30 : pps >= 1.5 ? 60 : 300;
  const ticks = [];
  for (let k = 0; k * every <= lay.duration + 0.001; k++) ticks.push(k * every);

  const layoutWord = (b) => (b.layout === "split" ? "Split · " : b.layout === "pip" ? "Overlay · " : "");
  const hasCaptions = captionBlocks.length > 0;
  const tool = { padding: "4px 10px", minHeight: 28 };

  return (
    <div ref={root} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderBottom: "1px solid var(--line)", minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-mute)" }}>Timeline</span>
        <span style={{ fontSize: 12, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {`Drag edges to trim. Ctrl + scroll to zoom. Click the ${term} row to add a photo or clip.`}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {free && (
            <span data-cut-menu style={{ position: "relative" }}>
              <Btn size="s" icon={<Icon.Scissors size={13} />} aria-haspopup="menu" aria-expanded={cutMenu} onClick={() => setCutMenu((v) => !v)} style={tool}>
                Auto-cut
              </Btn>
              {cutMenu && (
                <div
                  role="menu"
                  aria-label="Auto-cut"
                  className="hg-fade"
                  style={{
                    position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, width: 290, padding: 6,
                    background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 18px 44px -18px rgba(15,15,15,.45)",
                  }}
                >
                  {hasCaptions ? (
                    <>
                      <MenuItem title="At every caption" sub="A part per sentence. Nothing is taken out." onClick={() => { setCutMenu(false); onAutoCut(false); }} />
                      <MenuItem title="At every caption, without the pauses" sub="Also cuts out the silence between sentences." onClick={() => { setCutMenu(false); onAutoCut(true); }} />
                    </>
                  ) : (
                    <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: 8, lineHeight: 1.5 }}>Write captions first: the video is cut where each sentence ends.</p>
                  )}
                  {joinable && <MenuItem title="Join the parts back" sub="Parts that play straight on become one again." onClick={() => { setCutMenu(false); onJoin(); }} />}
                </div>
              )}
            </span>
          )}
          {free && (
            <Btn size="s" icon={<Icon.Scissors size={13} />} onClick={onSplit} title="Split the part under the playhead (S)" style={tool}>Split</Btn>
          )}
          <Btn size="s" kind="quiet" aria-label="Zoom to fit" title="Show the whole edit" onClick={fit} style={tool}>Fit</Btn>
          <Btn size="s" kind="quiet" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomAtPlayhead(1 / 1.5)} style={{ padding: "4px 9px", minHeight: 28 }}>−</Btn>
          <Btn size="s" kind="quiet" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomAtPlayhead(1.5)} style={{ padding: "4px 9px", minHeight: 28 }}>+</Btn>
        </span>
      </div>

      <div
        ref={scroller}
        className="hg-scroll"
        data-timeline-scroll
        style={{ overflowX: "auto", overflowY: "hidden" }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div style={{ position: "relative", width }} onPointerDown={seekFrom}>
          <div style={{ position: "relative", height: 22, borderBottom: "1px solid var(--line)" }}>
            {ticks.map((s) => (
              <span key={s} style={{ position: "absolute", left: LABEL + s * pps, top: 3, fontSize: 10.5, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums", transform: "translateX(-50%)" }}>
                {fmtTime(s, every < 1)}
              </span>
            ))}
          </div>

          <Track label={free ? "Video" : "Lines"} icon={free ? <Icon.Film size={12} /> : <Icon.Script size={12} />}>
            {clips.map((c, i) => {
              const prev = clips[i - 1];
              const next = clips[i + 1];
              return block({
                key: c.id, id: c.id, kind: "clip", selectKind: "clip", left: LABEL + c.start * pps, w: (c.end - c.start) * pps,
                label: free ? `${i + 1}` : c.line ? `${c.line}` : "+",
                sub: free ? (words.get(c.id) || "").slice(0, 80) : (c.roman || c.said_roman || c.text || "").slice(0, 40),
                color: free || c.line ? (i % 2 ? "#DCD6CC" : "#E7E2DA") : "#EFE6D2",
                handles: { left: "clip-in", right: "clip-out" },
                orig: {
                  in: c.in,
                  out: c.out,
                  prev: free && prev && prev.media === c.media && prev.out <= c.in + 0.002 ? { id: prev.id, in: prev.in, out: prev.out } : null,
                  next: free && next && next.media === c.media && next.in >= c.out - 0.002 ? { id: next.id, in: next.in, out: next.out } : null,
                },
              });
            })}
          </Track>

          <Track label="Captions" icon={<Icon.Captions size={12} />}>
            {captionBlocks.map((p) => {
              const w = (p.end - p.start) * pps;
              const room = captionRoom.get(p.seg.id) || { min: 0, max: Infinity };
              return block({
                key: `${p.seg.id}:${p.clip.id}`, id: p.seg.id, kind: "caption", selectKind: "caption",
                left: LABEL + p.start * pps, w,
                label: captionText(p.seg, tl.captions).slice(0, 60) || "…",
                color: tl.captions?.mode === "off" ? "#F2F1EE" : "#FFF3CC",
                swatch: p.seg.custom ? p.seg.custom.color || "#FFFFFF" : null,
                handles: w >= 28 ? { left: "cap-in", right: "cap-out" } : {},
                orig: { start: p.seg.start, end: p.seg.end, min: room.min, max: room.max },
              });
            })}
          </Track>

          <Track label={term} icon={term === "Media" ? <Icon.Image size={12} /> : <Icon.Camera size={12} />} onPointerDown={openAdd} hint>
            {broll.map((b) =>
              block({
                key: b.id, id: b.id, kind: "broll", selectKind: "broll", left: LABEL + b.start * pps, w: (b.end - b.start) * pps,
                label: b.media ? `${layoutWord(b)}${b.label || term}` : waiting[b.id] ? "Uploading…" : `Empty: ${b.label || term}`,
                color: b.media ? "#D9E6EF" : "repeating-linear-gradient(45deg,#F2F1EE,#F2F1EE 6px,#E8E6E1 6px,#E8E6E1 12px)",
                handles: { move: "broll-move", right: "broll-len" }, orig: { start: b.start, duration: b.duration },
              })
            )}
          </Track>

          <Track label="Text" icon={<Icon.Text size={12} />}>
            {texts.map((t) =>
              block({
                key: t.id, id: t.id, kind: "text", selectKind: "text", left: LABEL + t.start * pps, w: t.duration * pps,
                label: t.text || "Text", color: "#E9E1F0",
                handles: { move: "text-move", right: "text-len" }, orig: { start: t.start, duration: t.duration },
              })
            )}
          </Track>

          <Track label="Music" icon={<Icon.Music size={12} />}>
            {audio.map((a) =>
              block({
                key: a.id, id: a.id, kind: "audio", selectKind: "audio", left: LABEL + a.start * pps, w: a.duration * pps,
                label: mediaById.get(a.media)?.filename || "Music", color: "#DDEBDD",
                handles: { move: "audio-move", right: "audio-len" }, orig: { start: a.start, duration: a.duration },
              })
            )}
          </Track>

          <div
            aria-hidden="true"
            style={{ position: "absolute", top: 0, bottom: 0, left: LABEL + Math.min(time, lay.duration) * pps, width: 2, marginLeft: -1, background: "var(--accent)", pointerEvents: "none" }}
          />
        </div>
      </div>

      {adding && (
        <div
          data-broll-add
          role="dialog"
          aria-label="Add media"
          className="hg-fade"
          style={{
            position: "absolute", left: adding.left, top: adding.top - 8, transform: "translate(-50%, -100%)", zIndex: 30,
            width: POPOVER_W, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12,
            boxShadow: "0 18px 44px -18px rgba(15,15,15,.45)", padding: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>{term === "Media" ? "Add media" : "B-roll"} at {fmtTime(adding.t)}</span>
            <Btn size="s" kind="quiet" aria-label="Close" icon={<Icon.Close size={13} />} onClick={() => setAdding(null)} style={{ padding: 4, minHeight: 0 }} />
          </div>
          <Btn
            kind="primary"
            size="s"
            icon={<Icon.Upload size={14} />}
            style={{ width: "100%" }}
            onClick={() => { const t = adding.t; setAdding(null); onUploadBrollAt(t); }}
          >
            Upload a photo or clip
          </Btn>
          {assets.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "var(--ink-mute)", margin: "10px 0 6px" }}>Or use one you uploaded</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6, maxHeight: 132, overflowY: "auto" }} className="hg-scroll">
                {assets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    title={a.filename}
                    onClick={() => { const t = adding.t; setAdding(null); onAddBrollAt(t, a.id); }}
                    style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 7, overflow: "hidden", border: "1px solid var(--line)", padding: 0, cursor: "pointer", background: "#ECEAE6" }}
                  >
                    {(a.thumb_url || a.image_url) && <img src={a.thumb_url || a.image_url} alt={a.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    {a.type === "video" && (
                      <span style={{ position: "absolute", left: 3, bottom: 3, color: "#fff", background: "rgba(0,0,0,.6)", borderRadius: 4, padding: "0 3px", fontSize: 9.5 }}>{fmtTime(a.duration, false)}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Track({ label, icon, children, onPointerDown, hint = false }) {
  return (
    <div
      onPointerDown={onPointerDown}
      title={hint ? "Click to add a photo or clip here" : undefined}
      style={{ position: "relative", height: ROW, borderBottom: "1px solid var(--line)", cursor: hint ? "copy" : undefined }}
    >
      <span
        style={{
          position: "sticky", left: 0, zIndex: 2, width: LABEL, height: "100%",
          display: "inline-flex", alignItems: "center", gap: 4, paddingLeft: 10,
          fontSize: 11, fontWeight: 600, color: "var(--ink-mute)", background: "var(--card)", borderRight: "1px solid var(--line)",
        }}
      >
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function Handle({ side, onPointerDown }) {
  return (
    <span
      data-handle={side}
      onPointerDown={onPointerDown}
      style={{
        position: "absolute", top: 0, bottom: 0, [side]: 0, width: 9, cursor: "ew-resize", touchAction: "none",
        background: "rgba(0,0,0,.14)", borderRadius: side === "left" ? "5px 0 0 5px" : "0 5px 5px 0",
      }}
    />
  );
}

function MenuItem({ title, sub, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
    >
      <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 1 }}>{sub}</div>
    </button>
  );
}
