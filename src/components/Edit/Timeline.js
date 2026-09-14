import { useEffect, useRef, useState } from "react";
import { layout, anchorAt } from "./model";
import { Btn, Icon, fmtTime } from "./ui";

/**
 * The timeline, for a mouse.
 *
 * Four tracks: the lines, B-roll, text and music. Drag a line's edges to trim
 * it, drag B-roll, text or music to move it and their right edge to change how
 * long they last. Click empty track to move the playhead.
 *
 * Trims ripple, because that is what the edit is: the lines play one after
 * another with nothing between them, so shortening line 3 pulls line 4 in.
 * B-roll rides with the line it was dropped on.
 *
 * Desktop only. On a phone the same edits are the buttons in the Script, B-roll,
 * Text and Music panels; a 12-pixel drag handle is not a touch control.
 */
const ROW = 36;
const LABEL = 64;
const snap = (v) => Math.round(v * 20) / 20;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function Timeline({ tl, lay, mediaById, time, playing, selection, onSelect, onSeek, onChange }) {
  const [pps, setPps] = useState(36);
  const scroller = useRef(null);
  const drag = useRef(null);

  const width = Math.max(560, LABEL + lay.duration * pps + 60);
  const clips = lay.clips.filter((c) => c.start !== null);
  const broll = lay.broll.filter((b) => b.start !== null);
  const texts = tl.texts || [];
  const audio = tl.audio || [];

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = LABEL + time * pps;
    if (x < el.scrollLeft + LABEL || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - LABEL - 40;
  }, [time, pps, playing]);

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
        if (d.kind === "clip-in") c.in = clamp(snap(d.orig.in + dt), 0, c.out - 0.1);
        else c.out = clamp(snap(d.orig.out + dt), c.in + 0.1, mediaById.get(c.media)?.duration || c.out + 30);
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

  const isSel = (kind, id) => selection.kind === kind && selection.id === id;

  const block = ({ key, left, w, label, kind, id, selectKind, color, handles, orig, sub }) => (
    <div
      key={key}
      onPointerDown={handles.move ? (e) => start(e, { kind: handles.move, id, select: selectKind, orig }) : (e) => { e.stopPropagation(); onSelect(selectKind, id); }}
      title={label}
      style={{
        position: "absolute", top: 4, height: ROW - 8, left, width: Math.max(4, w),
        borderRadius: 6, background: color, overflow: "hidden", cursor: handles.move ? "grab" : "pointer",
        border: `1.5px solid ${isSel(selectKind, id) ? "var(--ink)" : "rgba(0,0,0,.08)"}`,
        boxShadow: isSel(selectKind, id) ? "0 0 0 1px var(--ink)" : "none",
        display: "flex", alignItems: "center", padding: "0 8px", fontSize: 11.5, fontWeight: 600, color: "var(--ink)",
        whiteSpace: "nowrap", userSelect: "none", touchAction: "none",
      }}
    >
      {handles.left && <Handle side="left" onPointerDown={(e) => start(e, { kind: handles.left, id, select: selectKind, orig })} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {sub && <span style={{ marginLeft: 6, fontWeight: 500, color: "var(--ink-mute)" }}>{sub}</span>}
      {handles.right && <Handle side="right" onPointerDown={(e) => start(e, { kind: handles.right, id, select: selectKind, orig })} />}
    </div>
  );

  const ticks = [];
  const every = pps >= 80 ? 1 : pps >= 30 ? 5 : pps >= 12 ? 10 : 30;
  for (let s = 0; s <= lay.duration + 0.001; s += every) ticks.push(s);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontSize: 11.5, fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-mute)" }}>Timeline</span>
        <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>Drag a line's edges to trim it. Drag B-roll, text and music to move them.</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <Btn size="s" kind="quiet" aria-label="Zoom out" onClick={() => setPps((p) => Math.max(8, Math.round(p / 1.5)))} style={{ padding: "4px 9px", minHeight: 28 }}>−</Btn>
          <Btn size="s" kind="quiet" aria-label="Zoom in" onClick={() => setPps((p) => Math.min(240, Math.round(p * 1.5)))} style={{ padding: "4px 9px", minHeight: 28 }}>+</Btn>
        </span>
      </div>

      <div
        ref={scroller}
        className="hg-scroll"
        style={{ overflowX: "auto", overflowY: "hidden" }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div style={{ position: "relative", width }} onPointerDown={seekFrom}>
          <div style={{ position: "relative", height: 22, borderBottom: "1px solid var(--line)" }}>
            {ticks.map((s) => (
              <span key={s} style={{ position: "absolute", left: LABEL + s * pps, top: 3, fontSize: 10.5, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums", transform: "translateX(-50%)" }}>
                {fmtTime(s, false)}
              </span>
            ))}
          </div>

          <Track label="Lines" icon={<Icon.Script size={12} />}>
            {clips.map((c) =>
              block({
                key: c.id, id: c.id, selectKind: "clip", left: LABEL + c.start * pps, w: (c.end - c.start) * pps,
                label: c.line ? `${c.line}` : "+", sub: (c.roman || c.said_roman || c.text || "").slice(0, 40),
                color: c.line ? "#E7E2DA" : "#EFE6D2",
                handles: { left: "clip-in", right: "clip-out" }, orig: { in: c.in, out: c.out },
              })
            )}
          </Track>

          <Track label="B-roll" icon={<Icon.Camera size={12} />}>
            {broll.map((b) =>
              block({
                key: b.id, id: b.id, selectKind: "broll", left: LABEL + b.start * pps, w: (b.end - b.start) * pps,
                label: b.media ? b.label || "B-roll" : `Empty: ${b.label || "B-roll"}`,
                color: b.media ? "#D9E6EF" : "repeating-linear-gradient(45deg,#F2F1EE,#F2F1EE 6px,#E8E6E1 6px,#E8E6E1 12px)",
                handles: { move: "broll-move", right: "broll-len" }, orig: { start: b.start, duration: b.duration },
              })
            )}
          </Track>

          <Track label="Text" icon={<Icon.Text size={12} />}>
            {texts.map((t) =>
              block({
                key: t.id, id: t.id, selectKind: "text", left: LABEL + t.start * pps, w: t.duration * pps,
                label: t.text || "Text", color: "#E9E1F0",
                handles: { move: "text-move", right: "text-len" }, orig: { start: t.start, duration: t.duration },
              })
            )}
          </Track>

          <Track label="Music" icon={<Icon.Music size={12} />}>
            {audio.map((a) =>
              block({
                key: a.id, id: a.id, selectKind: "audio", left: LABEL + a.start * pps, w: a.duration * pps,
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
    </div>
  );
}

function Track({ label, icon, children }) {
  return (
    <div style={{ position: "relative", height: ROW, borderBottom: "1px solid var(--line)" }}>
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
      onPointerDown={onPointerDown}
      style={{
        position: "absolute", top: 0, bottom: 0, [side]: 0, width: 9, cursor: "ew-resize", touchAction: "none",
        background: "rgba(0,0,0,.14)", borderRadius: side === "left" ? "5px 0 0 5px" : "0 5px 5px 0",
      }}
    />
  );
}
