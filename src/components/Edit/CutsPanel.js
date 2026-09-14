import { useEffect, useMemo, useRef } from "react";
import { Btn, Icon, Nudge, Switch, fmtTime } from "./ui";
import { hasIndic, placedSegments } from "./model";

/**
 * The video, as parts: what a video uploaded on its own is cut into.
 *
 * It starts as one part per uploaded video, whole. Cutting is two moves a
 * creator already knows from every phone editor: split where the playhead is,
 * then turn off (or delete) the piece that should not be there. Everything after
 * it closes up. On a desk the timeline does the same with drag handles; this
 * list is the whole editor on a phone.
 */
export default function CutsPanel({ tl, lay, mediaById, time, selectedId, onSelect, onChange, onPlayRange, onSplit, onRecordings }) {
  const refs = useRef({});
  const placed = useMemo(() => new Map(lay.clips.map((c) => [c.id, c])), [lay]);
  const words = useMemo(() => {
    const out = new Map();
    for (const { seg, clip } of placedSegments(tl, lay)) {
      const prev = out.get(clip.id) || "";
      if (prev.length < 140) out.set(clip.id, `${prev} ${seg.text || seg.roman}`.trim());
    }
    return out;
  }, [tl, lay]);
  const recordings = useMemo(() => {
    const ids = [];
    for (const c of tl.clips) if (c.media && !ids.includes(c.media)) ids.push(c.media);
    return ids;
  }, [tl.clips]);

  useEffect(() => {
    refs.current[selectedId]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const update = (id, fn, key) =>
    onChange((d) => {
      const c = d.clips.find((x) => x.id === id);
      if (c) fn(c, d);
    }, key);

  const move = (id, dir) =>
    onChange((d) => {
      const i = d.clips.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.clips.length) return;
      [d.clips[i], d.clips[j]] = [d.clips[j], d.clips[i]];
    });

  const remove = (id) =>
    onChange((d) => {
      d.clips = d.clips.filter((x) => x.id !== id);
      d.broll = (d.broll || []).filter((b) => b.clip !== id);
    });

  const underPlayhead = lay.clips.find((c) => c.start !== null && time > c.start + 0.2 && time < c.end - 0.2);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
          <strong style={{ color: "var(--ink)" }}>{tl.clips.length} part{tl.clips.length === 1 ? "" : "s"}</strong> · {fmtTime(lay.duration, false)} in the edit
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <Btn size="s" kind="primary" icon={<Icon.Scissors size={14} />} disabled={!underPlayhead} onClick={onSplit} title="Split at the playhead (S)">
            Split at {fmtTime(time)}
          </Btn>
          <Btn size="s" icon={<Icon.Plus size={14} />} onClick={onRecordings}>Add video</Btn>
        </span>
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", margin: "0 0 12px" }}>
        To cut something out, split before and after it, then turn that part off. Everything after it moves up.
      </p>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {tl.clips.map((c, index) => {
          const on = c.id === selectedId;
          const pos = placed.get(c.id);
          const media = mediaById.get(c.media);
          const said = words.get(c.id) || "";
          const multi = recordings.length > 1;
          return (
            <li key={c.id} ref={(el) => { refs.current[c.id] = el; }}>
              <div
                onClick={() => onSelect(c.id)}
                style={{
                  borderRadius: 12, cursor: "pointer", background: "var(--card)",
                  border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
                  opacity: !c.enabled && !on ? 0.62 : 1,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px" }}>
                  <span style={{ width: 40, height: 52, borderRadius: 7, overflow: "hidden", flexShrink: 0, background: "#ECEAE6", display: "grid", placeItems: "center", color: "var(--ink-mute)" }}>
                    {media?.thumb_url ? <img src={media.thumb_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon.Film size={16} />}
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
                    {said && (
                      <div
                        className={hasIndic(said) ? "indic" : undefined}
                        style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-body)", marginTop: 3, ...(on ? {} : { display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}
                      >
                        “{said}”
                      </div>
                    )}
                  </div>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Switch on={!!c.enabled} label={`Include part ${index + 1}`} onChange={(v) => update(c.id, (x) => { x.enabled = v; })} />
                  </span>
                </div>

                {on && (
                  <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid var(--line)", padding: "10px 12px 12px", display: "grid", gap: 10, cursor: "default" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
                      <Nudge label="Start" value={c.in} min={0} max={c.out - 0.1} onChange={(v) => update(c.id, (x) => { x.in = v; }, `in:${c.id}`)} />
                      <Nudge label="End" value={c.out} min={c.in + 0.1} max={media?.duration || c.out} onChange={(v) => update(c.id, (x) => { x.out = v; }, `out:${c.id}`)} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <Btn size="s" icon={<Icon.Play size={12} />} disabled={!c.enabled || !pos || pos.start === null} onClick={() => onPlayRange(pos.start, pos.end)}>Play part</Btn>
                      <Btn size="s" icon={<Icon.Up />} disabled={index === 0} onClick={() => move(c.id, -1)} aria-label="Move part earlier">Earlier</Btn>
                      <Btn size="s" icon={<Icon.Down />} disabled={index === tl.clips.length - 1} onClick={() => move(c.id, 1)} aria-label="Move part later">Later</Btn>
                      <Btn size="s" kind="danger" icon={<Icon.Trash />} disabled={tl.clips.length < 2} onClick={() => remove(c.id)}>Delete</Btn>
                    </div>
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
