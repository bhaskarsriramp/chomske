import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Icon, Switch, fmtTime } from "./ui";
import { moveClip, removeClip } from "./model";

const GAP = 8;

/**
 * The video, as parts: what a video uploaded on its own is cut into.
 *
 * Captions written for a video cut it into a part per sentence; on the timeline
 * a part is split at the playhead and trimmed by its edges. Here parts are put
 * in order by dragging, turned off, played and deleted. Everything after a
 * change closes up, and a part's captions and B-roll go where it goes.
 *
 * A phone has no timeline, so there this list also splits at the playhead.
 */
export default function CutsPanel({ tl, lay, mediaById, time, selectedId, isNarrow, onSelect, onChange, onPlayRange, onSplit, onRecordings }) {
  const refs = useRef({});
  const placed = useMemo(() => new Map(lay.clips.map((c) => [c.id, c])), [lay]);
  const multi = useMemo(() => new Set(tl.clips.map((c) => c.media).filter(Boolean)).size > 1, [tl.clips]);
  const sort = useSortable(tl.clips, refs, (id, beforeId) => onChange((d) => { moveClip(d, id, beforeId); }));

  useEffect(() => {
    refs.current[selectedId]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const update = (id, fn, key) =>
    onChange((d) => {
      const c = d.clips.find((x) => x.id === id);
      if (c) fn(c, d);
    }, key);

  const remove = (id) => onChange((d) => { removeClip(d, id); });

  // Arrow keys on a part's handle move it, for anyone not dragging.
  const nudge = (id, index, dir) => {
    const others = tl.clips.filter((x) => x.id !== id);
    const to = index + dir;
    if (to < 0 || to > others.length) return;
    onChange((d) => { moveClip(d, id, others[to]?.id ?? null); });
  };

  const underPlayhead = lay.clips.find((c) => c.start !== null && time > c.start + 0.2 && time < c.end - 0.2);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
          <strong style={{ color: "var(--ink)" }}>{tl.clips.length} part{tl.clips.length === 1 ? "" : "s"}</strong> · {fmtTime(lay.duration, false)} in the edit
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          {isNarrow && (
            <Btn size="s" kind="primary" icon={<Icon.Scissors size={14} />} disabled={!underPlayhead} onClick={onSplit} title="Split at the playhead (S)">
              Split at {fmtTime(time)}
            </Btn>
          )}
          <Btn size="s" icon={<Icon.Plus size={14} />} onClick={onRecordings}>Add video</Btn>
        </span>
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: GAP }}>
        {tl.clips.map((c, index) => {
          const on = c.id === selectedId;
          const held = sort.state?.id === c.id;
          const shift = sort.offset(index);
          const pos = placed.get(c.id);
          const media = mediaById.get(c.media);
          return (
            <li
              key={c.id}
              ref={(el) => { refs.current[c.id] = el; }}
              style={{
                position: "relative", zIndex: held ? 2 : undefined,
                transform: shift ? `translateY(${shift}px)` : undefined,
                transition: sort.state && !held ? "transform .15s ease" : "none",
              }}
            >
              <div
                onClick={() => onSelect(c.id)}
                style={{
                  borderRadius: 12, cursor: "pointer", background: "var(--card)",
                  border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
                  opacity: !c.enabled && !on && !held ? 0.62 : 1,
                  boxShadow: held ? "0 16px 34px -16px rgba(15,15,15,.5)" : "none",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px 10px 4px" }}>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Move part ${index + 1}. Drag, or use the arrow keys.`}
                    title="Drag to move"
                    onPointerDown={(e) => sort.press(e, c.id)}
                    onPointerMove={sort.move}
                    onPointerUp={sort.release}
                    onPointerCancel={sort.release}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                      e.preventDefault();
                      e.stopPropagation();
                      nudge(c.id, index, e.key === "ArrowUp" ? -1 : 1);
                    }}
                    style={{ alignSelf: "stretch", display: "grid", placeItems: "center", width: 22, borderRadius: 6, color: "var(--ink-mute)", cursor: held ? "grabbing" : "grab", touchAction: "none" }}
                  >
                    <Icon.Grip size={16} />
                  </span>
                  <span style={{ width: 40, height: 52, borderRadius: 7, overflow: "hidden", flexShrink: 0, background: "#ECEAE6", display: "grid", placeItems: "center", color: "var(--ink-mute)" }}>
                    {media?.thumb_url ? <img src={media.thumb_url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon.Film size={16} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--ink)" }}>
                      Part {index + 1}
                      <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}>
                        {" "}· {fmtTime(c.out - c.in)}{pos?.start !== null && pos?.start !== undefined ? ` · at ${fmtTime(pos.start, false)}` : " · turned off"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {multi && media ? `${media.filename} · ` : ""}{fmtTime(c.in)}–{fmtTime(c.out)} of the video
                    </div>
                  </div>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Switch on={!!c.enabled} label={`Include part ${index + 1}`} onChange={(v) => update(c.id, (x) => { x.enabled = v; })} />
                  </span>
                </div>

                {on && (
                  <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid var(--line)", padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 6, cursor: "default" }}>
                    <Btn size="s" icon={<Icon.Play size={12} />} disabled={!c.enabled || !pos || pos.start === null} onClick={() => onPlayRange(pos.start, pos.end)}>Play part</Btn>
                    <Btn size="s" kind="danger" icon={<Icon.Trash />} disabled={tl.clips.length < 2} onClick={() => remove(c.id)}>Delete</Btn>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Drag to reorder a vertical list by a handle, with a mouse or a finger.
 *
 * Pointer events, not HTML drag and drop, which phones do not do. Rows are
 * measured once, at the press, in the scrolling panel's own coordinates, so the
 * panel can scroll under a held row (it does by itself near its edges) and the
 * drop still lands where the row is shown.
 */
function useSortable(items, refs, onMove) {
  const [state, setState] = useState(null);
  const drag = useRef(null);

  useEffect(() => () => cancelAnimationFrame(drag.current?.raf), []);

  const locate = (d) => {
    const dy = d.lastY - d.origin() - d.y0;
    const center = d.rows[d.from].mid + dy;
    d.to = d.rows.filter((r, k) => k !== d.from && r.mid < center).length;
    setState({ id: d.id, from: d.from, to: d.to, dy, size: d.rows[d.from].size });
  };

  const press = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const scroller = e.currentTarget.closest(".hg-scroll");
    const origin = () => (scroller ? scroller.getBoundingClientRect().top - scroller.scrollTop : -window.scrollY);
    const o = origin();
    const rows = items.map((c) => {
      const r = refs.current[c.id]?.getBoundingClientRect();
      return r ? { mid: r.top - o + r.height / 2, size: r.height } : { mid: 0, size: 0 };
    });
    const from = items.findIndex((c) => c.id === id);
    if (from < 0) return;
    const d = { id, from, to: from, rows, scroller, origin, y0: e.clientY - o, lastY: e.clientY };
    drag.current = d;
    setState({ id, from, to: from, dy: 0, size: rows[from].size });

    const tick = () => {
      if (drag.current !== d) return;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const v = d.lastY < r.top + 56 ? d.lastY - (r.top + 56) : d.lastY > r.bottom - 56 ? d.lastY - (r.bottom - 56) : 0;
        if (v) {
          scroller.scrollTop += Math.max(-18, Math.min(18, v * 0.35));
          locate(d);
        }
      }
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
  };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    d.lastY = e.clientY;
    locate(d);
  };

  const release = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    setState(null);
    if (d.to !== d.from) onMove(d.id, items.filter((c) => c.id !== d.id)[d.to]?.id ?? null);
  };

  // Where each row sits while one is held: the held one under the finger, the
  // ones it has passed stepped aside to open its new place.
  const offset = (index) => {
    if (!state) return 0;
    const { from, to, dy, size } = state;
    if (index === from) return dy;
    if (from < to && index > from && index <= to) return -(size + GAP);
    if (to < from && index >= to && index < from) return size + GAP;
    return 0;
  };

  return { state, press, move, release, offset };
}
