import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../api";
import { useCredits } from "../../state/CreditsContext";
import { startAnalysis, startTranslation, translationQuote, ackTranslation } from "./editApi";
import {
  ASPECTS, captionCues, captionText, captionLook, captionPresetY, placedSegments, segmentsOf, sentencePieces,
  splitIntoSentences, splitSegmentAt, hasIndic,
} from "./model";
import { Btn, Icon, Notice, Section, Segmented, Spinner, fmtTime } from "./ui";

const INDIC = /[ऀ-෿]/;
const HEX = /^#[0-9a-f]{6}$/i;

// Bright enough to read over any shot, with the outline or box behind them.
// Black is left to the picker: black text under a black outline disappears.
const COLORS = [
  ["#FFFFFF", "White"], ["#FFD400", "Yellow"], ["#7CFF4F", "Green"], ["#33E1FF", "Blue"],
  ["#FF5CC8", "Pink"], ["#FF8A1F", "Orange"], ["#FF3B30", "Red"],
];

const LOOK_CARDS = [
  ["bold", "Bold", { fontWeight: 800, textShadow: "1.5px 0 #000,-1.5px 0 #000,0 1.5px #000,0 -1.5px #000" }],
  ["clean", "Clean", { fontWeight: 700, textShadow: "0 1px 5px rgba(0,0,0,.8)" }],
  ["box", "Box", { fontWeight: 700, background: "rgba(0,0,0,.7)", padding: "2px 6px", borderRadius: 4 }],
];

/**
 * Captions: from what was said, in the letters or language the creator picks,
 * styled and placed for all of them or one section at a time, with every word
 * correctable.
 *
 * Most Shorts are watched on mute, so captions are on by default and follow what
 * was SAID rather than a script: a caption reading a sentence nobody spoke is
 * the fastest way to look auto-generated.
 *
 * ── ALL OF THEM, OR ONE ──────────────────────────────────────────────────────
 * Every caption starts with the same look. "One caption" narrows the look,
 * size, colour and position controls, and a drag on the video, to the selected
 * section, which is how a creator lifts one caption above a product shot or
 * turns the price yellow. A section styled on its own keeps what it was given
 * when the rest change, and can be matched to them again.
 *
 * ── TRANSLATION KEEPS THE TIMING ─────────────────────────────────────────────
 * A translation is written per stretch of speech (services/edit/translateCaptions.js),
 * so "English" captions change while the creator is saying the Telugu they
 * translate. It runs on the server while editing carries on; the result arrives
 * into the edit as one undoable change (Workspace.js).
 */
export default function CaptionsPanel({
  tl, lay, mode, project, languages = [], nativeLabel, hasRoman, time, playing,
  selectedId = null, scope = "all", onScope, onSelectCaption,
  onChange, onSeek, onFlush, onData, onReload,
}) {
  const cap = tl.captions || {};
  const free = mode === "free";
  const { balance, setBalance, openBuy, canBuy } = useCredits();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [dismissed, setDismissed] = useState(null);
  const [W, H] = ASPECTS[tl.aspect] || ASPECTS["9:16"];

  const set = useCallback((fields, key) => onChange((d) => { d.captions = { ...d.captions, ...fields }; }, key), [onChange]);

  const allSegments = useMemo(() => segmentsOf(tl), [tl]);
  const placed = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const p of placedSegments(tl, lay)) {
      if (seen.has(p.seg.id)) continue;
      seen.add(p.seg.id);
      out.push(p);
    }
    return out;
  }, [tl, lay]);

  const translated = useMemo(() => {
    const codes = new Set();
    for (const s of allSegments) for (const [k, v] of Object.entries(s.tr || {})) if (v) codes.add(k);
    return languages.filter((l) => codes.has(l.code));
  }, [allSegments, languages]);

  // ── Writing captions (a video on its own) ─────────────────────────────────
  const uncaptioned = free
    ? project.media.filter((m) => m.kind === "recording" && m.status === "ready" && !m.captioned && m.has_audio)
    : [];
  const silentOnly = free && !allSegments.length && !uncaptioned.length && project.media.some((m) => m.kind === "recording" && m.status === "ready" && !m.has_audio);
  const captionCost = project.pricing?.analyse || 0;

  async function writeCaptions() {
    setBusy("captions");
    setError("");
    try {
      const saved = await onFlush();
      if (saved === false) {
        setError("Your latest changes aren't saved yet. Try again in a moment.");
        return;
      }
      const d = await startAnalysis(project.id, captionCost);
      if (typeof d.balance === "number") setBalance(d.balance);
      onData(d);
    } catch (err) {
      const b = err?.response?.data;
      if (b?.insufficient_credits) setBalance(b.balance);
      setError(errorMessage(err));
      if (b?.price_changed) onReload?.();
    } finally {
      setBusy("");
    }
  }

  // ── Translating ───────────────────────────────────────────────────────────
  const [lang, setLang] = useState(() => (/^\s*english\s*$/i.test(project.language_label || "") ? "hi" : "en"));
  const t = project.translation;
  const running = t?.status === "running";
  const langLabel = (code) => languages.find((l) => l.code === code)?.label || code;

  const missing = useMemo(() => {
    let count = 0;
    let seconds = 0;
    for (const { seg } of placed) {
      if (!(seg.text || seg.roman) || seg.tr?.[lang]) continue;
      count++;
      seconds += seg.end - seg.start;
    }
    return { count, seconds };
  }, [placed, lang]);
  const perMin = project.pricing?.translate_per_min || 1;
  const estimate = missing.count ? perMin * Math.max(1, Math.ceil(missing.seconds / 60)) : 0;
  const [confirmed, setConfirmed] = useState(null);
  useEffect(() => { setConfirmed(null); setNote(""); }, [lang, missing.count]);
  const price = confirmed ?? estimate;
  const tooExpensive = typeof balance === "number" && missing.count > 0 && price > balance;
  const showing = cap.mode === "tr" && cap.lang === lang && !missing.count;

  async function translate() {
    if (!missing.count) {
      set({ mode: "tr", lang });
      return;
    }
    setBusy("translate");
    setError("");
    setNote("");
    try {
      const saved = await onFlush();
      if (saved === false) {
        setError("Your latest changes aren't saved yet. Try again in a moment.");
        return;
      }
      const q = await translationQuote(project.id, lang);
      if (!q.count) {
        set({ mode: "tr", lang });
        return;
      }
      if (q.cost !== price) {
        setConfirmed(q.cost);
        setNote(`This translation is ${q.cost} credit${q.cost === 1 ? "" : "s"}. Press Translate again to confirm.`);
        return;
      }
      const d = await startTranslation(project.id, lang, q.cost);
      if (typeof d.balance === "number") setBalance(d.balance);
      onData(d);
    } catch (err) {
      const b = err?.response?.data;
      if (b?.insufficient_credits) setBalance(b.balance);
      else if (b?.price_changed) {
        setConfirmed(b.cost);
        setNote(`${b.message} Press Translate again to confirm.`);
      } else setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  function dismissFailure() {
    setDismissed(t?.id);
    ackTranslation(project.id, t?.id).catch(() => {});
  }

  // ── The sections ──────────────────────────────────────────────────────────
  const bySegments = cap.mode !== "off" && (cap.mode === "tr" || cap.source !== "script");
  const field = cap.mode === "roman" ? "roman" : cap.mode === "tr" ? `tr:${cap.lang}` : "text";
  const cues = useMemo(() => captionCues(tl), [tl]);
  const activeSeg = useMemo(() => cues.find((c) => time >= c.start && time < c.end)?.seg || null, [cues, time]);
  const rows = useRef({});

  useEffect(() => {
    if (!playing || !activeSeg) return;
    const focused = document.activeElement?.tagName === "TEXTAREA";
    if (!focused) rows.current[activeSeg]?.scrollIntoView?.({ block: "nearest" });
  }, [activeSeg, playing]);

  useEffect(() => {
    if (selectedId && !playing && document.activeElement?.tagName !== "TEXTAREA") {
      rows.current[selectedId]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId, playing]);

  const editWords = useCallback((id, value) => {
    onChange((d) => {
      if (!Array.isArray(d.segments)) d.segments = segmentsOf(d);
      const s = d.segments.find((x) => x.id === id);
      if (!s) return;
      if (field.startsWith("tr:")) s.tr = { ...(s.tr || {}), [field.slice(3)]: value };
      else s[field] = value;
    }, `words:${id}:${field}`);
  }, [onChange, field]);

  const selected = useMemo(() => placed.find((p) => p.seg.id === selectedId) || null, [placed, selectedId]);
  const one = bySegments && scope === "one" && !!selected;
  const current = captionLook(tl, one ? selected.seg : null);
  const customCount = useMemo(() => placed.filter((p) => p.seg.custom).length, [placed]);
  const canSentences = useMemo(() => placed.some((p) => sentencePieces(p.seg)), [placed]);

  // Look, size, colour and position go to every caption, or to the one picked.
  const apply = (fields, key) => {
    if (!one) {
      set(fields, key);
      return;
    }
    const id = selected.seg.id;
    onChange((d) => {
      if (!Array.isArray(d.segments)) d.segments = segmentsOf(d);
      const s = d.segments.find((x) => x.id === id);
      if (s) s.custom = { ...(s.custom || {}), ...fields };
    }, key);
  };

  const matchOthers = (id) => onChange((d) => {
    const s = (d.segments || []).find((x) => x.id === id);
    if (s) delete s.custom;
  });

  const chooseScope = (v) => {
    if (v === "one" && !selected) {
      const id = activeSeg || placed[0]?.seg.id;
      if (id) onSelectCaption(id);
    }
    onScope(v);
  };

  const presetOf = (x, y) => (Math.abs(x - 0.5) < 0.001 ? ["top", "middle", "bottom"].find((p) => Math.abs(captionPresetY(p, W, H) - y) < 0.002) : null);
  const byHand = current.x !== null && current.x !== undefined;
  const positionValue = byHand ? presetOf(current.x, current.y) || "custom" : cap.position;
  const choosePosition = (v) => (one
    ? apply({ x: 0.5, y: Math.round(captionPresetY(v, W, H) * 1000) / 1000 })
    : set({ position: v, x: null, y: null }));

  const splitSrc = selected && time > selected.start + 0.3 && time < selected.end - 0.3
    ? selected.clip.in + (time - selected.clip.start)
    : null;
  const splitSelected = () => {
    let ids = null;
    onChange((d) => { ids = splitSegmentAt(d, selected.seg.id, splitSrc); });
    if (ids) onSelectCaption(ids[1]);
  };

  const value = cap.mode === "tr" ? `tr:${cap.lang}` : cap.mode;
  const modeOptions = [
    { value: "off", label: "Off" },
    { value: "native", label: nativeLabel || "Original", indic: INDIC.test(nativeLabel || "") },
    ...(hasRoman ? [{ value: "roman", label: "Roman" }] : []),
    ...translated.map((l) => ({ value: `tr:${l.code}`, label: l.label })),
  ];

  const empty = !allSegments.length && (free || !tl.clips.some((c) => c.text || c.roman));
  const currentColor = HEX.test(String(current.color || "")) ? String(current.color).toUpperCase() : "#FFFFFF";
  const colorKnown = COLORS.some(([hex]) => hex === currentColor);

  return (
    <div>
      {error && <div style={{ marginBottom: 12 }}><Notice tone="bad">{error}</Notice></div>}

      {empty ? (
        <div style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 14, padding: "18px 16px", marginBottom: 18 }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 40, height: 40, borderRadius: 11, background: "var(--made-tint)", color: "var(--made)", marginBottom: 8 }}>
            <Icon.Captions size={20} />
          </span>
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>Captions from your voice</div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 12px" }}>
            {silentOnly
              ? "This video has no sound, so there is nothing to caption. You can still add text on screen from the Text tab."
              : "We listen to your video and write every word as captions, timed to your voice, in the language you speak. Then translate them into English or any other language."}
          </p>
          {uncaptioned.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn kind="primary" disabled={!!busy || captionCost <= 0 || (typeof balance === "number" && captionCost > balance)} onClick={writeCaptions}>
                {busy === "captions" ? "Starting…" : typeof balance === "number" && captionCost > balance ? "Not enough credits" : `Write captions · ${captionCost} credits`}
              </Btn>
              {typeof balance === "number" && captionCost > balance && canBuy && <Btn onClick={openBuy}>Buy credits</Btn>}
            </div>
          )}
        </div>
      ) : (
        <>
          {uncaptioned.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <Notice
                tone="info"
                action={
                  <Btn size="s" kind="primary" disabled={!!busy || (typeof balance === "number" && captionCost > balance)} onClick={writeCaptions}>
                    {busy === "captions" ? "Starting…" : `Write captions · ${captionCost}`}
                  </Btn>
                }
              >
                {uncaptioned.length === 1 ? "A video you added has" : `${uncaptioned.length} videos you added have`} no captions yet.
              </Notice>
            </div>
          )}

          <Section title="Show captions in">
            <Segmented full label="Captions" value={value} onChange={(v) => (v.startsWith("tr:") ? set({ mode: "tr", lang: v.slice(3) }) : set({ mode: v }))} options={modeOptions} />
          </Section>

          {allSegments.length > 0 && languages.length > 0 && (
            <Section title="Translate captions">
              <p style={hint}>Same timing, another language. Your voice stays as it is; only the captions change.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  aria-label="Translate into"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  disabled={running}
                  style={{ flex: "1 1 160px", minWidth: 0, minHeight: 36, padding: "6px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 13.5 }}
                >
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}{l.native && l.native !== l.label && !l.label.includes(l.native) ? ` · ${l.native}` : ""}</option>
                  ))}
                </select>
                <Btn kind="primary" size="m" disabled={!!busy || running || !placed.length || tooExpensive || showing} onClick={translate}>
                  {running ? <><Spinner size={12} /> Translating…</>
                    : busy === "translate" ? "Starting…"
                    : showing ? `Showing ${langLabel(lang)}`
                    : !missing.count ? `Show in ${langLabel(lang)}`
                    : tooExpensive ? "Not enough credits"
                    : `Translate · ${price} credit${price === 1 ? "" : "s"}`}
                </Btn>
                {tooExpensive && canBuy && <Btn onClick={openBuy}>Buy credits</Btn>}
              </div>
              {missing.count > 0 && missing.count < placed.length && !running && (
                <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 6 }}>
                  {placed.length - missing.count} of {placed.length} already in {langLabel(lang)}; only the rest is charged.
                </div>
              )}
              {running && (
                <div style={{ fontSize: 12.5, color: "var(--ink-body)", marginTop: 8, lineHeight: 1.5 }}>
                  Translating {t.count} caption{t.count === 1 ? "" : "s"} into {langLabel(t.lang)}. Keep editing; they switch over when ready.
                </div>
              )}
              {note && <div style={{ marginTop: 8 }}><Notice tone="warn">{note}</Notice></div>}
              {t?.status === "failed" && dismissed !== t.id && (
                <div style={{ marginTop: 8 }}>
                  <Notice tone="bad" action={<Btn size="s" onClick={dismissFailure}>Dismiss</Btn>}>{t.error}</Notice>
                </div>
              )}
            </Section>
          )}

          {!free && cap.mode !== "off" && cap.mode !== "tr" && (
            <Section title="Words">
              <Segmented
                full
                label="Caption words"
                value={cap.source}
                onChange={(v) => set({ source: v })}
                options={[
                  { value: "said", label: "What you said", title: "Matches your voice, even where you went off script" },
                  { value: "script", label: "The script", title: "The written lines, word for word" },
                ]}
              />
            </Section>
          )}

          {cap.mode !== "off" && (
            <>
              {bySegments && placed.length > 0 && (
                <Section title="Change the style of">
                  <Segmented
                    full
                    label="Change the style of"
                    value={scope}
                    onChange={chooseScope}
                    options={[
                      { value: "all", label: "All captions", title: "Every caption, except ones styled on their own" },
                      { value: "one", label: "One caption", title: "Only the caption you pick" },
                    ]}
                  />
                  <p style={{ ...hint, margin: "8px 0 0" }}>
                    {scope === "one"
                      ? selected
                        ? <>Only the caption at <strong style={{ color: "var(--ink)" }}>{fmtTime(selected.start)}</strong> changes. Pick another in the list, on the timeline, or tap it on the video.</>
                        : "Pick a caption in the list below, on the timeline, or tap it on the video."
                      : `Changes apply to every caption${customCount ? `, except ${customCount} styled on ${customCount === 1 ? "its" : "their"} own` : ""}.`}
                  </p>
                  {one && selected.seg.custom && (
                    <Btn size="s" onClick={() => matchOthers(selected.seg.id)} style={{ marginTop: 8 }}>Match the other captions again</Btn>
                  )}
                </Section>
              )}

              <Section title="Look">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
                  {LOOK_CARDS.map(([v, label, look]) => {
                    const on = current.style === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => apply({ style: v })}
                        style={{ border: `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`, borderRadius: 10, padding: 0, overflow: "hidden", cursor: "pointer", background: "var(--card)", fontFamily: "inherit" }}
                      >
                        <span style={{ display: "grid", placeItems: "center", height: 54, background: "linear-gradient(135deg,#6B7F95,#C9A27A)" }}>
                          <span style={{ fontSize: 14, color: currentColor, ...look }}>Sale leak</span>
                        </span>
                        <span style={{ display: "block", padding: "6px 0", fontSize: 12, fontWeight: 600, color: on ? "var(--ink)" : "var(--ink-mute)" }}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Color">
                <div role="group" aria-label="Caption color" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  {COLORS.map(([hex, name]) => {
                    const on = currentColor === hex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        aria-label={name}
                        aria-pressed={on}
                        title={name}
                        onClick={() => apply({ color: hex })}
                        style={{
                          width: 30, height: 30, borderRadius: "50%", padding: 0, cursor: "pointer", background: hex,
                          border: "1px solid rgba(0,0,0,.2)", boxShadow: on ? "0 0 0 2px var(--paper), 0 0 0 4px var(--ink)" : "none",
                        }}
                      />
                    );
                  })}
                  <label
                    title="Any color"
                    style={{
                      position: "relative", width: 30, height: 30, borderRadius: "50%", overflow: "hidden", cursor: "pointer",
                      border: "1px solid rgba(0,0,0,.2)", background: "conic-gradient(#f33,#fd0,#6f4,#3df,#55f,#f5c,#f33)",
                      boxShadow: colorKnown ? "none" : "0 0 0 2px var(--paper), 0 0 0 4px var(--ink)",
                    }}
                  >
                    <input
                      type="color"
                      aria-label="Any color"
                      value={currentColor.toLowerCase()}
                      onChange={(e) => apply({ color: e.target.value.toUpperCase() }, `color:${one ? selected.seg.id : "all"}`)}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: "none", padding: 0 }}
                    />
                  </label>
                </div>
              </Section>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0 18px" }}>
                <Section title="Size" style={{ marginBottom: 10 }}>
                  <Segmented label="Caption size" value={current.size} onChange={(v) => apply({ size: v })} options={[{ value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }, { value: "xl", label: "XL" }]} />
                </Section>
                <Section title="Position" style={{ marginBottom: 10 }}>
                  <Segmented
                    label="Caption position"
                    value={positionValue}
                    onChange={choosePosition}
                    options={[{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }]}
                  />
                </Section>
              </div>
              <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-mute)", margin: "0 0 18px", lineHeight: 1.5 }}>
                <Icon.Pencil size={13} />
                {one
                  ? byHand ? "Placed by hand. Drag it on the video to move it again." : "Or drag this caption on the video to put it anywhere."
                  : byHand ? "Placed by hand. Drag the captions on the video to move them again." : "Or drag the captions on the video to put them anywhere."}
              </p>
            </>
          )}

          {bySegments && placed.length > 0 && (
            <Section
              title={`Caption sections · ${placed.length}`}
              right={canSentences ? <Btn size="s" icon={<Icon.Scissors size={13} />} onClick={() => onChange((d) => { splitIntoSentences(d); })}>Split into sentences</Btn> : null}
            >
              <p style={hint}>
                Each section shows while you say it. Tap one to pick it, tap its time to jump there, type to fix a word{cap.mode === "tr" ? ` in ${langLabel(cap.lang)}` : ""}.
              </p>
              {selected && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, background: "var(--made-tint)", border: "1px solid var(--made-line)", marginBottom: 8 }}>
                  <span style={{ flex: "1 1 150px", fontSize: 12.5, color: "var(--ink-body)" }}>
                    Picked: <strong style={{ color: "var(--ink)" }}>{fmtTime(selected.start)}–{fmtTime(selected.end)}</strong>
                  </span>
                  <Btn size="s" icon={<Icon.Scissors size={13} />} disabled={splitSrc === null} onClick={splitSelected} title="Move the playhead inside this caption to split it there">
                    Split at {fmtTime(time)}
                  </Btn>
                  {scope !== "one" && <Btn size="s" onClick={() => onScope("one")}>Style just this one</Btn>}
                </div>
              )}
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {placed.map(({ seg, start }) => (
                  <CaptionRow
                    key={seg.id}
                    id={seg.id}
                    start={start}
                    value={captionText(seg, cap)}
                    active={seg.id === activeSeg}
                    selected={seg.id === selectedId}
                    swatch={seg.custom ? seg.custom.color || "#FFFFFF" : null}
                    onEdit={editWords}
                    onSeek={onSeek}
                    onSelect={onSelectCaption}
                    rows={rows}
                  />
                ))}
              </ol>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

const hint = { fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", margin: "0 0 8px" };

const CaptionRow = memo(function CaptionRow({ id, start, value, active, selected, swatch, onEdit, onSeek, onSelect, rows }) {
  const indic = hasIndic(value);
  return (
    <li
      ref={(el) => { rows.current[id] = el; }}
      data-caption={id}
      aria-current={selected ? "true" : undefined}
      onClick={(e) => {
        const tag = e.target.tagName;
        if (tag !== "TEXTAREA" && tag !== "BUTTON") onSelect(id);
      }}
      style={{
        display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 8, alignItems: "start", cursor: "pointer",
        padding: "6px 8px", borderRadius: 10,
        border: `1px solid ${selected ? "var(--ink)" : active ? "var(--made-line)" : "var(--line)"}`,
        boxShadow: selected ? "0 0 0 1px var(--ink)" : "none",
        background: active ? "var(--made-tint)" : "var(--card)",
      }}
    >
      <span style={{ display: "grid", justifyItems: "start", gap: 3 }}>
        <button
          type="button"
          onClick={() => onSeek(start + 0.01)}
          aria-label={`Play from ${fmtTime(start)}`}
          style={{ border: "none", background: "none", padding: "5px 2px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 650, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}
        >
          {fmtTime(start)}
        </button>
        {swatch && (
          <span title="Styled on its own" style={{ marginLeft: 3, width: 12, height: 12, borderRadius: 3, background: swatch, border: "1px solid rgba(0,0,0,.35)" }} />
        )}
      </span>
      <textarea
        value={value}
        rows={Math.max(1, Math.ceil(value.length / 42))}
        maxLength={1000}
        aria-label={`Caption at ${fmtTime(start)}`}
        onChange={(e) => onEdit(id, e.target.value)}
        className={indic ? "indic" : undefined}
        style={{
          width: "100%", resize: "none", border: "1px solid transparent", borderRadius: 7, padding: "4px 6px",
          background: "transparent", color: "var(--ink)", fontSize: 13.5, lineHeight: 1.5, outline: "none",
          ...(indic ? {} : { fontFamily: "inherit" }),
        }}
        onFocus={(e) => { onSelect(id); e.target.style.borderColor = "var(--line)"; e.target.style.background = "var(--card)"; }}
        onBlur={(e) => { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; }}
      />
    </li>
  );
});
