import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../api";
import { useCredits } from "../../state/CreditsContext";
import { startAnalysis, startTranslation, translationQuote, ackTranslation } from "./editApi";
import { captionCues, captionText, placedSegments, segmentsOf, hasIndic } from "./model";
import { Btn, Icon, Notice, Section, Segmented, Spinner, fmtTime } from "./ui";

const INDIC = /[ऀ-෿]/;

/**
 * Captions: from what was said, in the letters or language the creator picks,
 * placed anywhere, with every word correctable.
 *
 * Most Shorts are watched on mute, so captions are on by default and follow what
 * was SAID rather than a script: a caption reading a sentence nobody spoke is
 * the fastest way to look auto-generated.
 *
 * ── TRANSLATION KEEPS THE TIMING ─────────────────────────────────────────────
 * A translation is written per stretch of speech (services/edit/translateCaptions.js),
 * so "English" captions change while the creator is saying the Telugu they
 * translate. It runs on the server while editing carries on; the result arrives
 * into the edit as one undoable change (Workspace.js).
 */
export default function CaptionsPanel({
  tl, lay, mode, project, languages = [], nativeLabel, hasRoman, time, playing,
  onChange, onSeek, onFlush, onData, onReload,
}) {
  const cap = tl.captions || {};
  const free = mode === "free";
  const { balance, setBalance, openBuy, canBuy } = useCredits();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [dismissed, setDismissed] = useState(null);

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
  const [lang, setLang] = useState(() => (/^\s*english\s*$/.test(project.language_label || "") ? "hi" : "en"));
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

  // ── The words ─────────────────────────────────────────────────────────────
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

  const editWords = useCallback((id, value) => {
    onChange((d) => {
      if (!Array.isArray(d.segments)) d.segments = segmentsOf(d);
      const s = d.segments.find((x) => x.id === id);
      if (!s) return;
      if (field.startsWith("tr:")) s.tr = { ...(s.tr || {}), [field.slice(3)]: value };
      else s[field] = value;
    }, `words:${id}:${field}`);
  }, [onChange, field]);

  const value = cap.mode === "tr" ? `tr:${cap.lang}` : cap.mode;
  const modeOptions = [
    { value: "off", label: "Off" },
    { value: "native", label: nativeLabel || "Original", indic: INDIC.test(nativeLabel || "") },
    ...(hasRoman ? [{ value: "roman", label: "Roman" }] : []),
    ...translated.map((l) => ({ value: `tr:${l.code}`, label: l.label })),
  ];
  const custom = cap.x !== null && cap.x !== undefined;

  const empty = !allSegments.length && (free || !tl.clips.some((c) => c.text || c.roman));

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
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", margin: "0 0 8px" }}>
                Same timing, another language. Your voice stays as it is; only the captions change.
              </p>
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
              <Section title="Look">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
                  {[
                    ["bold", "Bold", { color: "#fff", fontWeight: 800, textShadow: "1.5px 0 #000,-1.5px 0 #000,0 1.5px #000,0 -1.5px #000" }],
                    ["clean", "Clean", { color: "#fff", fontWeight: 700, textShadow: "0 1px 5px rgba(0,0,0,.8)" }],
                    ["box", "Box", { color: "#fff", fontWeight: 700, background: "rgba(0,0,0,.7)", padding: "2px 6px", borderRadius: 4 }],
                  ].map(([v, label, look]) => {
                    const on = cap.style === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ style: v })}
                        style={{ border: `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`, borderRadius: 10, padding: 0, overflow: "hidden", cursor: "pointer", background: "var(--card)", fontFamily: "inherit" }}
                      >
                        <span style={{ display: "grid", placeItems: "center", height: 54, background: "linear-gradient(135deg,#6B7F95,#C9A27A)" }}>
                          <span style={{ fontSize: 14, ...look }}>Sale leak</span>
                        </span>
                        <span style={{ display: "block", padding: "6px 0", fontSize: 12, fontWeight: 600, color: on ? "var(--ink)" : "var(--ink-mute)" }}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                <Section title="Size" style={{ marginBottom: 10 }}>
                  <Segmented label="Caption size" value={cap.size} onChange={(v) => set({ size: v })} options={[{ value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }]} />
                </Section>
                <Section title="Position" style={{ marginBottom: 10 }}>
                  <Segmented
                    label="Caption position"
                    value={custom ? "custom" : cap.position}
                    onChange={(v) => set({ position: v, x: null, y: null })}
                    options={[{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }]}
                  />
                </Section>
              </div>
              <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-mute)", margin: "0 0 18px", lineHeight: 1.5 }}>
                <Icon.Pencil size={13} />
                {custom ? "Placed by hand. Drag the captions on the video to move them again." : "Or drag the captions on the video to put them anywhere."}
              </p>
            </>
          )}

          {bySegments && placed.length > 0 && (
            <Section title={`Caption text · ${placed.length}`}>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", margin: "0 0 8px" }}>
                Tap a time to jump there. Type to fix a name or a word{cap.mode === "tr" ? ` in ${langLabel(cap.lang)}` : ""}.
              </p>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {placed.map(({ seg, start }) => (
                  <CaptionRow
                    key={seg.id}
                    id={seg.id}
                    start={start}
                    value={captionText(seg, cap)}
                    active={seg.id === activeSeg}
                    onEdit={editWords}
                    onSeek={onSeek}
                    rowRef={(el) => { rows.current[seg.id] = el; }}
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

const CaptionRow = memo(function CaptionRow({ id, start, value, active, onEdit, onSeek, rowRef }) {
  const indic = hasIndic(value);
  return (
    <li
      ref={rowRef}
      style={{
        display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 8, alignItems: "start",
        padding: "6px 8px", borderRadius: 10, border: `1px solid ${active ? "var(--ink)" : "var(--line)"}`,
        background: active ? "var(--made-tint)" : "var(--card)",
      }}
    >
      <button
        type="button"
        onClick={() => onSeek(start + 0.01)}
        aria-label={`Play from ${fmtTime(start)}`}
        style={{ border: "none", background: "none", padding: "5px 2px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 650, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}
      >
        {fmtTime(start)}
      </button>
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
        onFocus={(e) => { e.target.style.borderColor = "var(--line)"; e.target.style.background = "var(--card)"; }}
        onBlur={(e) => { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; }}
      />
    </li>
  );
});
