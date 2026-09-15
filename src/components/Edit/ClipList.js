import { useEffect, useRef } from "react";
import { Btn, Icon, Nudge, Section, Switch, fmtTime } from "./ui";
import { hasIndic, newId, removeClip } from "./model";

/**
 * The script, as the edit: one card per line.
 *
 * ── THE LIST IS THE EDITOR ON A PHONE ────────────────────────────────────────
 * A timeline with drag handles is the desktop's way in (Timeline.js). On a
 * phone the same edit is this list, because the thing a creator reasons about is
 * "line 4 starts a bit late", not "the third block on track one". Every edit
 * the timeline can make to a line, trim, swap a take, turn it off, move it, is
 * here as a button sized for a thumb.
 *
 * ── WHAT THE MATCHING COULD NOT DO IS SAID, NOT HIDDEN ───────────────────────
 * A line nobody said is a card saying so, with the two ways out: record it and
 * add the file, or use something else that was said. Speech that matched no
 * line sits at the bottom, playable, because sometimes the ad-lib was the best
 * part.
 */
export default function ClipList({ tl, lay, mediaById, selectedId, onSelect, onChange, onPlayRange, onAudition, showRoman = true }) {
  const refs = useRef({});
  const placed = new Map(lay.clips.map((c) => [c.id, c]));
  const lines = tl.clips.filter((c) => c.line !== null && c.line !== undefined);
  const found = lines.filter((c) => !c.missing).length;
  const retaken = lines.filter((c) => (c.takes || []).length > 1).length;

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

  const removeExtra = (id) => onChange((d) => { removeClip(d, id, { toUnused: true }); });

  const chooseTake = (id, t) =>
    update(id, (c) => Object.assign(c, {
      media: t.media, in: t.in, out: t.out, said: t.said, said_roman: t.said_roman,
      take_id: t.id, enabled: true, missing: false,
    }));

  const placeUnused = (u) =>
    onChange((d) => {
      const sel = d.clips.find((x) => x.id === selectedId);
      if (sel && sel.missing) {
        Object.assign(sel, { media: u.media, in: u.in, out: u.out, said: u.said, said_roman: u.said_roman, enabled: true, missing: false, take_id: null });
      } else {
        const at = sel ? d.clips.indexOf(sel) + 1 : d.clips.length;
        d.clips.splice(at, 0, {
          id: newId("cl"), line: null, text: u.said, roman: u.said_roman, media: u.media, in: u.in, out: u.out,
          enabled: true, missing: false, take_id: null, said: u.said, said_roman: u.said_roman, takes: [],
        });
      }
      d.unused = (d.unused || []).filter((x) => x.id !== u.id);
    });

  const selected = tl.clips.find((c) => c.id === selectedId);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12.5, color: "var(--ink-mute)", marginBottom: 12, lineHeight: 1.5 }}>
        <span><strong style={{ color: "var(--ink)" }}>{found} of {lines.length}</strong> lines found</span>
        {retaken > 0 && <span>{retaken} with retakes (we used your last good one)</span>}
        {lines.length - found > 0 && <span style={{ color: "var(--bad)" }}>{lines.length - found} not found</span>}
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {tl.clips.map((c, index) => {
          const on = c.id === selectedId;
          const pos = placed.get(c.id);
          const media = mediaById.get(c.media);
          const text = (showRoman && c.roman) || c.text || c.said_roman || c.said;
          const takeIndex = (c.takes || []).findIndex((t) => t.id === c.take_id);
          const status = c.missing
            ? "Not found in your recording"
            : c.line === null || c.line === undefined
            ? "Extra: something else you said"
            : !c.enabled
            ? "Turned off"
            : (c.takes || []).length > 1
            ? `Take ${takeIndex + 1} of ${c.takes.length}`
            : "Found";

          return (
            <li key={c.id} ref={(el) => { refs.current[c.id] = el; }}>
              <div
                onClick={() => onSelect(c.id)}
                style={{
                  borderRadius: 12, cursor: "pointer",
                  border: `1px solid ${on ? "var(--ink)" : c.missing ? "#EEDCB6" : "var(--line)"}`,
                  background: c.missing ? "#FBF5E8" : "var(--card)",
                  opacity: !c.enabled && !c.missing && !on ? 0.62 : 1,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px" }}>
                  <span
                    style={{
                      minWidth: 24, height: 22, padding: "0 6px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                      display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1,
                      background: c.missing ? "#E9D29C" : "var(--made-tint)", color: "var(--ink-body)",
                    }}
                  >
                    {c.line ?? "+"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className={hasIndic(text) ? "indic" : undefined}
                      style={{
                        fontSize: 14, lineHeight: 1.5, color: "var(--ink)",
                        ...(on ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
                      }}
                    >
                      {text}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 3, color: c.missing ? "#8A5A0F" : "var(--ink-mute)" }}>
                      {status}
                      {!c.missing && ` · ${fmtTime(c.out - c.in)}`}
                      {pos?.start !== null && pos?.start !== undefined && ` · at ${fmtTime(pos.start, false)}`}
                    </div>
                  </div>
                  <span onClick={(e) => e.stopPropagation()} style={{ paddingTop: 1 }}>
                    <Switch
                      on={!!c.enabled}
                      label={`Include line ${c.line ?? ""}`}
                      onChange={(v) => { if (!c.missing) update(c.id, (x) => { x.enabled = v; }); }}
                    />
                  </span>
                </div>

                {on && !c.missing && (
                  <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid var(--line)", padding: "10px 12px 12px", display: "grid", gap: 10, cursor: "default" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
                      <Nudge label="Start" value={c.in} min={0} max={c.out - 0.1} onChange={(v) => update(c.id, (x) => { x.in = v; }, `in:${c.id}`)} />
                      <Nudge label="End" value={c.out} min={c.in + 0.1} max={media?.duration || c.out + 5} onChange={(v) => update(c.id, (x) => { x.out = v; }, `out:${c.id}`)} />
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <Btn size="s" icon={<Icon.Play size={12} />} disabled={!c.enabled || !pos || pos.start === null} onClick={() => onPlayRange(pos.start, pos.end)}>
                        Play line
                      </Btn>
                      <Btn size="s" icon={<Icon.Up />} disabled={index === 0} onClick={() => move(c.id, -1)} aria-label="Move line earlier">Earlier</Btn>
                      <Btn size="s" icon={<Icon.Down />} disabled={index === tl.clips.length - 1} onClick={() => move(c.id, 1)} aria-label="Move line later">Later</Btn>
                      {(c.line === null || c.line === undefined) && (
                        <Btn size="s" kind="danger" icon={<Icon.Trash />} onClick={() => removeExtra(c.id)}>Remove</Btn>
                      )}
                    </div>

                    {(c.takes || []).length > 1 && (
                      <div>
                        <div style={{ fontSize: 12, color: "var(--ink-mute)", marginBottom: 6 }}>Takes of this line</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {c.takes.map((t, i) => {
                            const chosen = t.id === c.take_id;
                            return (
                              <span key={t.id} style={{ display: "inline-flex", border: `1px solid ${chosen ? "var(--ink)" : "var(--line)"}`, borderRadius: 9, overflow: "hidden", background: chosen ? "var(--made-tint)" : "var(--card)" }}>
                                <button
                                  type="button"
                                  onClick={() => chooseTake(c.id, t)}
                                  aria-pressed={chosen}
                                  style={{ border: "none", background: "none", padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", minHeight: 32 }}
                                >
                                  {chosen && "✓ "}Take {i + 1} · {fmtTime(t.in, false)}
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Hear take ${i + 1}`}
                                  onClick={() => onAudition({ media: t.media, in: t.in, out: t.out })}
                                  style={{ border: "none", borderLeft: "1px solid var(--line)", background: "none", padding: "0 9px", cursor: "pointer", color: "var(--ink-body)" }}
                                >
                                  <Icon.Play size={11} />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(c.said_roman || c.said) && (
                      <div className={hasIndic(c.said) && !(showRoman && c.said_roman) ? "indic" : undefined} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)" }}>
                        You said: “{(showRoman && c.said_roman) || c.said}”
                      </div>
                    )}
                  </div>
                )}

                {on && c.missing && (
                  <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid #EEDCB6", padding: "10px 12px 12px", fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-body)", cursor: "default" }}>
                    We couldn't find this line. Record it and add the file under <strong>Recordings</strong> (then match again),
                    or pick something you said from the list below to use in its place.
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(tl.unused || []).length > 0 && (
        <Section title={`Other things you said · ${tl.unused.length}`} style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", margin: "0 0 8px" }}>
            {selected?.missing
              ? `Pick one to use for line ${selected.line}.`
              : selected
              ? `Add one after line ${selected.line ?? "the selected clip"}, or play it first.`
              : "Speech that didn't match a line. Select a line, then add one after it."}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {tl.unused.map((u) => {
              const said = (showRoman && u.said_roman) || u.said || "…";
              return (
                <li key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)" }}>
                  <Btn size="s" kind="quiet" aria-label="Hear this" onClick={() => onAudition({ media: u.media, in: u.in, out: u.out })} icon={<Icon.Play size={12} />} style={{ padding: 6 }} />
                  <span className={hasIndic(said) ? "indic" : undefined} style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45, color: "var(--ink-body)" }}>
                    “{said}” <span style={{ color: "var(--ink-mute)", fontSize: 12 }}>· {fmtTime(u.out - u.in)}</span>
                  </span>
                  <Btn size="s" onClick={() => placeUnused(u)}>{selected?.missing ? "Use" : "Add"}</Btn>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
