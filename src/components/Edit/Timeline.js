import { useEffect, useMemo, useRef, useState } from "react";
import { layout, anchorAt, placedSegments, captionText } from "./model";
import { Btn, Icon, fmtTime } from "./ui";

/**
 * The timeline, for a mouse.
 *
 * Four tracks: the video (script lines, or the parts of a video uploaded on its
 * own), B-roll, text and music. Drag a clip's edges to trim it, drag B-roll,
 * text or music to move it and their right edge to change how long they last.
 * Click empty track to move the playhead.
 *
 * Clicking the empty B-roll row also offers to put something there: upload a
 * photo or clip, or pick one already uploaded. That is the moment a creator
 * decides it: they hear themselves say "this table" and click under it.
 *
 * Trims ripple, because that is what the edit is: the clips play one after
 * another with nothing between them, so shortening one pulls the next in.
 * B-roll rides with the clip it was dropped on.
 *
 * Desktop only. On a phone the same edits are the buttons in the panels; a
 * 12-pixel drag handle is not a touch control.
 */
const ROW = 36;
const LABEL = 64;
const POPOVER_W = 264;
const snap = (v) => Math.round(v * 20) / 20;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function Timeline({
  tl, lay, mediaById, mode = "script", term = "B-roll", time, playing, selection, assets = [], waiting = {},
  onSelect, onSeek, onChange, onSplit, onAddBrollAt, onUploadBrollAt,
}) {
  const free = mode === "free";
  const [pps, setPps] = useState(36);
  const [adding, setAdding] = useState(null);
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

  const words = useMemo(() => {
    if (!free) return new Map();
    const out = new Map();
    for (const { seg, clip } of placedSegments(tl, lay)) {
      if (!out.has(clip.id)) out.set(clip.id, seg.text || seg.roman || "");
    }
    return out;
  }, [free, tl, lay]);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = LABEL + time * pps;
    if (x < el.scrollLeft + LABEL || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - LABEL - 40;
  }, [time, pps, playing]);

  // The add menu closes on a press anywhere else, Escape, or scrolling away.
  useEffect(() => {
    if (!adding) return undefined;
    const away = (e) => { if (!e.target.closest?.("[data-broll-add]")) setAdding(null); };
    const key = (e) => { if (e.key === "Escape") setAdding(null); };
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
  }, [adding]);

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
      {swatch && <span style={{ width: 9, height: 9, borderRadius: 2, background: swatch, border: "1px solid rgba(0,0,0,.35)", marginRight: 5, flexShrink: 0 }} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {sub && <span style={{ marginLeft: 6, fontWeight: 500, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
      {handles.right && <Handle side="right" onPointerDown={(e) => start(e, { kind: handles.right, id, select: selectKind, orig })} />}
    </div>
  );

  const ticks = [];
  const every = pps >= 80 ? 1 : pps >= 30 ? 5 : pps >= 12 ? 10 : 30;
  for (let s = 0; s <= lay.duration + 0.001; s += every) ticks.push(s);

  const layoutWord = (b) => (b.layout === "split" ? "Split · " : b.layout === "pip" ? "Overlay · " : "");

  return (
    <div ref={root} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderBottom: "1px solid var(--line)", minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-mute)" }}>Timeline</span>
        <span style={{ fontSize: 12, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {`Drag edges to trim. Click a caption to pick it. Click the ${term} row to add a photo or clip there.`}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {free && (
            <Btn size="s" icon={<Icon.Scissors size={13} />} onClick={onSplit} title="Split the part under the playhead (S)" style={{ padding: "4px 10px", minHeight: 28 }}>Split</Btn>
          )}
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

          <Track label={free ? "Video" : "Lines"} icon={free ? <Icon.Film size={12} /> : <Icon.Script size={12} />}>
            {clips.map((c, i) =>
              block({
                key: c.id, id: c.id, selectKind: "clip", left: LABEL + c.start * pps, w: (c.end - c.start) * pps,
                label: free ? `${i + 1}` : c.line ? `${c.line}` : "+",
                sub: free ? (words.get(c.id) || "").slice(0, 40) : (c.roman || c.said_roman || c.text || "").slice(0, 40),
                color: free || c.line ? "#E7E2DA" : "#EFE6D2",
                handles: { left: "clip-in", right: "clip-out" }, orig: { in: c.in, out: c.out },
              })
            )}
          </Track>

          <Track label="Captions" icon={<Icon.Captions size={12} />}>
            {captionBlocks.map((p) =>
              block({
                key: `${p.seg.id}:${p.clip.id}`, id: p.seg.id, selectKind: "caption",
                left: LABEL + p.start * pps, w: (p.end - p.start) * pps,
                label: captionText(p.seg, tl.captions).slice(0, 60) || "…",
                color: tl.captions?.mode === "off" ? "#F2F1EE" : "#FFF3CC",
                swatch: p.seg.custom ? p.seg.custom.color || "#FFFFFF" : null,
                handles: {},
              })
            )}
          </Track>

          <Track label={term} icon={term === "Media" ? <Icon.Image size={12} /> : <Icon.Camera size={12} />} onPointerDown={openAdd} hint>
            {broll.map((b) =>
              block({
                key: b.id, id: b.id, selectKind: "broll", left: LABEL + b.start * pps, w: (b.end - b.start) * pps,
                label: b.media ? `${layoutWord(b)}${b.label || term}` : waiting[b.id] ? "Uploading…" : `Empty: ${b.label || term}`,
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
      onPointerDown={onPointerDown}
      style={{
        position: "absolute", top: 0, bottom: 0, [side]: 0, width: 9, cursor: "ew-resize", touchAction: "none",
        background: "rgba(0,0,0,.14)", borderRadius: side === "left" ? "5px 0 0 5px" : "0 5px 5px 0",
      }}
    />
  );
}
