import { useEffect, useRef } from "react";
import { Btn, Icon, Nudge, Section, Segmented, fmtTime } from "./ui";
import { hasIndic, newId } from "./model";

/**
 * Text on screen: a price, a date, a "link in bio". Placed at the playhead,
 * because the moment a creator decides a number needs to be on screen is the
 * moment they hear themselves say it.
 */
export default function TextPanel({ tl, lay, time, selectedId, onSelect, onChange, onSeek }) {
  const inputs = useRef({});

  useEffect(() => {
    const el = inputs.current[selectedId];
    if (el && !el.value) el.focus();
  }, [selectedId]);

  const add = () => {
    const id = newId("tx");
    const start = Math.min(Math.max(0, time), Math.max(0, lay.duration - 0.5));
    onChange((d) => {
      d.texts = [...(d.texts || []), { id, text: "", start: Math.round(start * 10) / 10, duration: 3, position: "top", size: "m" }];
    });
    onSelect(id);
  };

  const update = (id, fn, key) => onChange((d) => {
    const t = d.texts.find((x) => x.id === id);
    if (t) fn(t);
  }, key);

  const texts = [...(tl.texts || [])].sort((a, b) => a.start - b.start);

  return (
    <Section title={`Text on screen · ${texts.length}`} right={<Btn size="s" icon={<Icon.Plus />} onClick={add} disabled={!lay.duration}>Add at {fmtTime(time)}</Btn>}>
      {!texts.length && (
        <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0, lineHeight: 1.6 }}>
          Move the playhead to where you say a price, a date or a name, and add it as text.
        </p>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {texts.map((t) => {
          const on = t.id === selectedId;
          return (
            <li
              key={t.id}
              onClick={() => { onSelect(t.id); onSeek(t.start); }}
              style={{ borderRadius: 12, border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`, background: "var(--card)", padding: "10px 12px", display: "grid", gap: 10, cursor: "pointer" }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  ref={(el) => { inputs.current[t.id] = el; }}
                  value={t.text}
                  maxLength={200}
                  placeholder="Type the text"
                  aria-label="Text"
                  onClick={(e) => e.stopPropagation()}
                  onFocus={() => onSelect(t.id)}
                  onChange={(e) => { const v = e.target.value; update(t.id, (x) => { x.text = v; }, `txt:${t.id}`); }}
                  className={hasIndic(t.text) ? "indic" : undefined}
                  style={{ flex: 1, minWidth: 0, fontSize: 14, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", outline: "none", fontFamily: hasIndic(t.text) ? undefined : "inherit" }}
                />
                <Btn size="s" kind="quiet" aria-label="Delete text" icon={<Icon.Trash />} onClick={(e) => { e.stopPropagation(); onChange((d) => { d.texts = d.texts.filter((x) => x.id !== t.id); }); }} style={{ padding: 6 }} />
              </div>
              {on && (
                <div onClick={(e) => e.stopPropagation()} style={{ display: "grid", gap: 10, cursor: "default" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
                    <Nudge label="Starts" value={t.start} step={0.5} min={0} max={Math.max(0, lay.duration - 0.3)} onChange={(v) => update(t.id, (x) => { x.start = v; }, `st:${t.id}`)} />
                    <Nudge label="Lasts" value={t.duration} step={0.5} min={0.5} max={60} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => update(t.id, (x) => { x.duration = v; }, `du:${t.id}`)} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Segmented size="s" label="Position" value={t.position} onChange={(v) => update(t.id, (x) => { x.position = v; })} options={[{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }]} />
                    <Segmented size="s" label="Size" value={t.size} onChange={(v) => update(t.id, (x) => { x.size = v; })} options={[{ value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }]} />
                    <Btn size="s" onClick={() => update(t.id, (x) => { x.start = Math.round(time * 10) / 10; })}>Start at playhead</Btn>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
