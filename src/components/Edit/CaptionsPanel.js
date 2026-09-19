import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../api";
import { useCredits } from "../../state/CreditsContext";
import { startAnalysis, startTranslation, translationQuote, ackTranslation } from "./editApi";
import {
  CAPTION_PX, captionCues, captionText, captionLook, captionPx, placedSegments, removeSegment, segmentsOf, sentencePieces,
  splitIntoSentences, hasIndic,
} from "./model";
import { Btn, Icon, Notice, Section, Segmented, Spinner, Switch, fmtTime } from "./ui";
// The colour and size controls are shared with the demo studio; only the look
// tiles below are this product's own. See captionStyle.js.
import { ColorPicker, SizePicker, HEX } from "./captionStyle";

const INDIC = /[ऀ-෿]/;

const LOOKS = [
  ["bold", "Bold", { fontWeight: 800, textShadow: "1.5px 0 #000,-1.5px 0 #000,0 1.5px #000,0 -1.5px #000" }],
  ["clean", "Clean", { fontWeight: 700, textShadow: "0 1px 5px rgba(0,0,0,.8)" }],
  ["box", "Box", { fontWeight: 700, background: "rgba(0,0,0,.7)", padding: "2px 6px", borderRadius: 4 }],
];
const TILE = "linear-gradient(135deg,#6B7F95,#C9A27A)";

const given = (v) => v !== null && v !== undefined;
const styledOwn = (c) => !!c && ["style", "size", "px", "color"].some((k) => given(c[k]));

/**
 * Captions: from what was said, in the letters or language the creator picks,
 * styled for all of them here and for one at a time in its own row, with every
 * word correctable.
 *
 * Most Shorts are watched on mute, so captions are on by default and follow what
 * was SAID rather than a script: a caption reading a sentence nobody spoke is
 * the fastest way to look auto-generated.
 *
 * ── ALL OF THEM, AND ONE ─────────────────────────────────────────────────────
 * Look, colour and size at the top go to every caption. Picking a caption opens
 * the same controls in its row, for that caption alone, which is how a creator
 * turns the price yellow. A caption styled on its own keeps what it was given
 * when the rest change, until it is reset. Position is by hand, on the video
 * (Preview.js): the first caption carries all of them, any other moves only
 * itself.
 *
 * ── TRANSLATION KEEPS THE TIMING ─────────────────────────────────────────────
 * A translation is written per stretch of speech (services/edit/translateCaptions.js),
 * so "English" captions change while the creator is saying the Telugu they
 * translate. It runs on the server while editing carries on; the result arrives
 * into the edit as one undoable change (Workspace.js).
 */
export default function CaptionsPanel({
  tl, lay, mode, project, languages = [], nativeLabel, hasRoman, time, playing,
  selectedId = null, onSelectCaption,
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
    return codes;
  }, [allSegments]);

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
  const [lang, setLang] = useState(() =>
    cap.mode === "tr" && cap.lang ? cap.lang : /^\s*english\s*$/i.test(project.language_label || "") ? "hi" : "en"
  );
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

  // ── Which words show ──────────────────────────────────────────────────────
  // The switches return to what was showing before: captions turned back on
  // come back as they were, a translation turned off gives the original back.
  const lastOn = useRef(cap.mode && cap.mode !== "off" ? cap.mode : "native");
  const lastOriginal = useRef(cap.mode === "roman" ? "roman" : "native");
  useEffect(() => {
    if (cap.mode && cap.mode !== "off") lastOn.current = cap.mode;
    if (cap.mode === "native" || cap.mode === "roman") lastOriginal.current = cap.mode;
  }, [cap.mode]);

  const [translateOpen, setTranslateOpen] = useState(false);
  const translateOn = translateOpen || cap.mode === "tr";

  const showCaptions = (on) => set({ mode: on ? lastOn.current : "off" });
  const showOriginal = (v) => {
    setTranslateOpen(false);
    set({ mode: v });
  };
  const switchTranslate = (on) => {
    setTranslateOpen(on);
    // A language already translated shows at once; one that is not waits for Translate.
    if (on && !missing.count && placed.length && !running) set({ mode: "tr", lang });
    else if (!on && cap.mode === "tr") set({ mode: lastOriginal.current });
  };

  const originals = [
    { value: "native", label: nativeLabel || "Original", indic: INDIC.test(nativeLabel || "") },
    ...(hasRoman ? [{ value: "roman", label: "Roman" }] : []),
  ];

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

  const current = captionLook(tl);
  const currentColor = HEX.test(String(current.color || "")) ? String(current.color).toUpperCase() : "#FFFFFF";
  const canSentences = useMemo(() => placed.some((p) => sentencePieces(p.seg)), [placed]);

  // One caption's own look, from the controls in its row.
  const styleOne = useCallback((id, fields, key) => onChange((d) => {
    if (!Array.isArray(d.segments)) d.segments = segmentsOf(d);
    const s = d.segments.find((x) => x.id === id);
    if (s) s.custom = { ...(s.custom || {}), ...fields };
  }, key), [onChange]);

  const resetOne = useCallback((id) => onChange((d) => {
    const s = (d.segments || []).find((x) => x.id === id);
    if (s) delete s.custom;
  }), [onChange]);

  const deleteOne = useCallback((id) => {
    onChange((d) => { removeSegment(d, id); });
    onSelectCaption(null);
  }, [onChange, onSelectCaption]);

  const byHand = given(cap.x) || placed.some((p) => given(p.seg.custom?.x) || given(p.seg.custom?.y));
  const resetPositions = () => onChange((d) => {
    d.captions = { ...d.captions, position: "bottom", x: null, y: null };
    for (const s of d.segments || []) {
      if (!s.custom) continue;
      delete s.custom.x;
      delete s.custom.y;
      if (!Object.keys(s.custom).length) delete s.custom;
    }
  });

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

          <Section title="Captions" right={<Switch on={cap.mode !== "off"} label="Show captions" onChange={showCaptions} />}>
            {cap.mode !== "off" && (
              <Segmented full label="Captions in" value={cap.mode} onChange={showOriginal} options={originals} />
            )}
          </Section>

          {cap.mode !== "off" && allSegments.length > 0 && languages.length > 0 && (
            <Section title="Translate captions" right={<Switch on={translateOn} label="Translate captions" onChange={switchTranslate} />}>
              {translateOn && (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      aria-label="Translate into"
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                      disabled={running}
                      style={{ flex: "1 1 160px", minWidth: 0, minHeight: 36, padding: "6px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 13.5 }}
                    >
                      {languages.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}{l.native && l.native !== l.label && !l.label.includes(l.native) ? ` · ${l.native}` : ""}{translated.has(l.code) ? " ✓" : ""}
                        </option>
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
                </>
              )}
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
                  {LOOKS.map(([v, label, look]) => {
                    const on = current.style === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ style: v })}
                        style={{ border: `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`, borderRadius: 10, padding: 0, overflow: "hidden", cursor: "pointer", background: "var(--card)", fontFamily: "inherit" }}
                      >
                        <span style={{ display: "grid", placeItems: "center", height: 54, background: TILE }}>
                          <span style={{ fontSize: 14, color: currentColor, ...look }}>Sale leak</span>
                        </span>
                        <span style={{ display: "block", padding: "6px 0", fontSize: 12, fontWeight: 600, color: on ? "var(--ink)" : "var(--ink-mute)" }}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Color">
                <ColorPicker value={currentColor} keyId="all" onChange={(hex, key) => set({ color: hex }, key)} />
              </Section>

              <Section title="Size">
                <SizePicker size={current.size} px={captionPx(current)} min={CAPTION_PX.min} max={CAPTION_PX.max} onPreset={(v) => set({ size: v, px: null })} onPx={(px) => set({ px }, "px:all")} />
              </Section>

              <Section
                title="Placement"
                right={byHand ? <Btn size="s" kind="quiet" icon={<Icon.Reset size={13} />} title="Put every caption back at the bottom" onClick={resetPositions} style={{ padding: "4px 8px", minHeight: 28 }}>Reset</Btn> : null}
              >
                <p style={{ ...hint, margin: 0 }}>
                  {bySegments
                    ? "Place by hand anywhere you want. The first caption moves them all; any other moves only itself."
                    : "Place by hand anywhere you want: drag the captions on the video."}
                </p>
              </Section>
            </>
          )}

          {bySegments && placed.length > 0 && (
            <Section
              title={`Caption sections · ${placed.length}`}
              right={canSentences ? <Btn size="s" icon={<Icon.Scissors size={13} />} onClick={() => onChange((d) => { splitIntoSentences(d); })}>Split into sentences</Btn> : null}
            >
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {placed.map(({ seg, start }) => {
                  const selected = seg.id === selectedId;
                  return (
                    <CaptionRow
                      key={seg.id}
                      id={seg.id}
                      start={start}
                      value={captionText(seg, cap)}
                      active={seg.id === activeSeg}
                      selected={selected}
                      swatch={styledOwn(seg.custom) ? seg.custom.color || currentColor : null}
                      look={selected ? captionLook(tl, seg) : null}
                      custom={!!seg.custom}
                      onEdit={editWords}
                      onSeek={onSeek}
                      onSelect={onSelectCaption}
                      onStyle={styleOne}
                      onReset={resetOne}
                      onDelete={deleteOne}
                      rows={rows}
                    />
                  );
                })}
              </ol>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

const hint = { fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", margin: "0 0 8px" };

const CaptionRow = memo(function CaptionRow({
  id, start, value, active, selected, swatch, look, custom, onEdit, onSeek, onSelect, onStyle, onReset, onDelete, rows,
}) {
  const indic = hasIndic(value);
  const color = HEX.test(String(look?.color || "")) ? String(look.color).toUpperCase() : "#FFFFFF";
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
      <span style={{ display: "grid", justifyItems: "start", gap: 3, minWidth: 42 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSeek(start + 0.01); }}
          aria-label={`Play from ${fmtTime(start)}`}
          style={{ border: "none", background: "none", padding: "5px 2px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 650, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}
        >
          {fmtTime(start)}
        </button>
        {selected ? (
          <span style={{ display: "inline-flex", gap: 2 }}>
            {custom && <RowIcon label="Match the other captions" onClick={() => onReset(id)}><Icon.Reset size={13} /></RowIcon>}
            <RowIcon label="Delete caption (Del)" danger onClick={() => onDelete(id)}><Icon.Trash size={13} /></RowIcon>
          </span>
        ) : swatch && (
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
      {selected && look && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 12px", padding: "7px 0 2px", borderTop: "1px solid var(--line)", cursor: "default" }}
        >
          <ColorPicker compact value={color} keyId={id} onChange={(hex, key) => onStyle(id, { color: hex }, key)} />
          <LookPicker value={look.style} onChange={(v) => onStyle(id, { style: v })} />
          <SizePicker compact size={look.size} px={captionPx(look)} min={CAPTION_PX.min} max={CAPTION_PX.max} onPreset={(v) => onStyle(id, { size: v, px: null })} onPx={(px) => onStyle(id, { px }, `px:${id}`)} />
        </div>
      )}
    </li>
  );
});

function RowIcon({ label, danger = false, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ width: 20, height: 20, padding: 0, display: "grid", placeItems: "center", border: "none", borderRadius: 5, background: "transparent", color: danger ? "var(--bad)" : "var(--ink-mute)", cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

/** Bold, Clean and Box as small tiles drawn in their own look. */
function LookPicker({ value, onChange }) {
  return (
    <div role="group" aria-label="Caption look" style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
      {LOOKS.map(([v, label, look]) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-label={label}
            aria-pressed={on}
            title={label}
            onClick={() => onChange(v)}
            style={{
              width: 28, height: 26, padding: 0, boxSizing: "border-box", borderRadius: 6, cursor: "pointer", display: "grid", placeItems: "center",
              background: TILE, border: `2px solid ${on ? "var(--ink)" : "transparent"}`, fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 12, lineHeight: 1, color: "#fff", ...look, ...(v === "box" ? { padding: "2px 3px", borderRadius: 3 } : {}) }}>A</span>
          </button>
        );
      })}
    </div>
  );
}

