import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { createPortal } from "react-dom";
import api, { errorMessage } from "../../api";
import { useCredits } from "../../state/CreditsContext";
import useElementWidth from "../../hooks/useElementWidth";
import ScriptToggle, { EnglishNote } from "./ScriptToggle";
import ShootPack, { packAsText, withRoman } from "./ShootPack";
import Teleprompter from "./Teleprompter";

/** Below this the card stacks its controls and drops their longer labels. */
const NARROW_PX = 560;

const TABS = [
  { id: "broll", label: "B-roll", icon: "M3 7h13v10H3zM16 10l5-3v10l-5-3" },
  { id: "script", label: "Full script", icon: "M4 6h16M4 11h16M4 16h10" },
];

/**
 * A finished script, the one card the product exists to hand over. Shown on
 * Create (ScriptPanel) and in My scripts, so a script does not change shape
 * depending on which screen it is read from.
 *
 * ── TWO QUESTIONS, TWO CONTROLS ──────────────────────────────────────────────
 * "How do I want to see it" and "in which letters" are different questions,
 * and one row of pills mixing "Hinglish · Roman · B-roll" asked them both at
 * once. So:
 *
 *   tabs     B-roll | Full script. What the card is showing.
 *   Read in  Roman | తెలుగు. The alphabet, for whichever tab is open, and for
 *            the teleprompter.
 *
 * ── IT OPENS ON THE B-ROLL, IN ROMAN ─────────────────────────────────────────
 * The B-roll is what makes a creator stop and read: it is their script already
 * broken into shots, timed to how they talk, which is the case for the product
 * made by the product. Roman because that is what most creators read fastest.
 * Both are one tap from the paragraphs in their own letters.
 *
 * Both choices can be held by the parent (`view` and `onView`). ScriptPanel
 * does, so flipping between v1 and v2 keeps the tab and the letters a creator
 * was comparing them in. Left out, the card holds them itself.
 *
 * ── A PLAN IS ALMOST ALWAYS ALREADY HERE ─────────────────────────────────────
 * runScript builds it before the script is marked done. For a script written
 * before that, or one whose included build failed, the card asks for it when
 * the B-roll tab is shown, with `auto` so that request can never spend.
 *
 * Parents key this on the script id, so that request and its result belong to
 * exactly one script.
 */
export default function ScriptCard({ script, compact = false, meta = null, onUpdated, view = null, onView = null }) {
  const [boxRef, width] = useElementWidth();
  const narrow = width ? width < NARROW_PX : compact;
  const uid = useId();

  const [ownView, setOwnView] = useState({ layout: "broll", alphabet: "roman" });
  const current = view || ownView;
  const setView = onView || setOwnView;
  const { layout, alphabet } = current;
  const setLayout = (next) => setView({ ...current, layout: next });
  const setAlphabet = (next) => setView({ ...current, alphabet: next });

  const [copied, setCopied] = useState(null);   // null | "ok" | "failed"
  const [prompting, setPrompting] = useState(false);

  const [built, setBuilt] = useState(null);
  const [packStatus, setPackStatus] = useState("idle");
  const [packError, setPackError] = useState("");
  const [price, setPrice] = useState(null);
  const autoTried = useRef(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const { setBalance, refresh: refreshCredits } = useCredits();

  // A plan saved before its Roman lines could be lined up gets them here, from
  // the script's own Roman version, so the Read in switch is not missing for it.
  // The Roman version, or the one fetched for a script that was left without it.
  const [fetchedRoman, setFetchedRoman] = useState(null);
  const romanText = script.roman_text || fetchedRoman?.text || "";

  // A plan saved before its Roman lines could be lined up gets them here, from
  // the script's own Roman version, so the Read in switch is not missing for it.
  const pack = useMemo(() => withRoman(script.shoot_pack || built, romanText), [script.shoot_pack, built, romanText]);

  const build = useCallback(async ({ confirm = false } = {}) => {
    setPackStatus("building");
    setPackError("");
    try {
      const { data } = await api.post(`/script/${script.id}/shoot`, confirm ? {} : { auto: true });
      if (!live.current) return;
      setBuilt(data.shoot_pack);
      setPackStatus("idle");
      if (data.charged > 0) {
        if (typeof data.balance === "number") setBalance(data.balance);
        refreshCredits();
      }
      onUpdated?.(script.id, { shoot_pack: data.shoot_pack });
    } catch (err) {
      if (!live.current) return;
      const body = err?.response?.data || {};
      if (err?.response?.status === 402) {
        // `needs_confirm` is a price to show, not a problem to report.
        // Insufficient credits, after they pressed the priced button, is.
        setPrice(body.needed ?? null);
        setPackError(body.needs_confirm ? "" : body.message || "Not enough credits.");
        if (typeof body.balance === "number") setBalance(body.balance);
        setPackStatus("priced");
      } else {
        setPackError(errorMessage(err, "Couldn't plan the B-roll for this one."));
        setPackStatus("failed");
      }
    }
  }, [script.id, setBalance, refreshCredits, onUpdated]);

  // Once per card. A retry after that is the creator's own click.
  useEffect(() => {
    if (layout !== "broll" || pack || autoTried.current || script.status !== "done") return;
    autoTried.current = true;
    build();
  }, [layout, pack, script.status, build]);

  // ── A script that lost its Roman version gets it now ──────────────────────
  // It is written during generation, but that one call can fail, and without it
  // Read in has nothing to offer on either tab. Asked for once per card; the
  // server allows one try a day per script.
  const romanAsked = useRef(false);
  useEffect(() => {
    if (romanAsked.current || script.status !== "done" || script.roman_text) return;
    if ((String(script.text || "").match(/[\u0900-\u0DFF\u0600-\u06FF]/g) || []).length < 12) return;
    romanAsked.current = true;
    api.post(`/script/${script.id}/roman`)
      .then(({ data }) => {
        if (!data?.roman_text) return;
        if (live.current) setFetchedRoman({ text: data.roman_text, aligned: !!data.roman_aligned });
        onUpdated?.(script.id, { roman_text: data.roman_text, roman_aligned: !!data.roman_aligned });
      })
      .catch(() => {});
  }, [script.id, script.status, script.roman_text, script.text, onUpdated]);

  // ── What is on screen ─────────────────────────────────────────────────────
  // A plan can only offer Roman if its lines were split in step with the
  // script's (see buildShootPack), which is stricter than the paragraphs' test.
  // Before a plan exists the paragraphs' answer is used, so the toggle does not
  // appear and then vanish while one is being built.
  const romanOk = layout === "broll" && pack ? !!pack.has_roman : !!romanText;
  const englishOk = layout === "script" && !!script.english_text;

  // The English version is a different document with no line-level match to a
  // plan, so on the B-roll tab it falls back to Roman, the nearest thing.
  const shown =
    alphabet === "english" && englishOk ? "english"
      : alphabet !== "native" && romanOk ? "roman"
        : "native";

  const text = shown === "english" ? script.english_text : shown === "roman" ? romanText : script.text;

  // ── COPY TAKES WHAT THE TAB SHOWS ─────────────────────────────────────────
  // On the B-roll tab that is the plan: every line with its timecode, each shot
  // under its line, and the have-ready list, which is what an editor needs from
  // a WhatsApp message. On Full script it is the paragraphs, ready to read or
  // paste into a prompter app. In the letters on screen either way. The label
  // says which, so nobody pastes a shot list where they expected a script.
  const copyingPlan = layout === "broll" && !!pack;
  const copyText = copyingPlan ? packAsText(pack, { roman: shown === "roman" }) : text;

  function copy() {
    if (!copyText) return;
    navigator.clipboard.writeText(copyText).then(
      () => { setCopied("ok"); setTimeout(() => live.current && setCopied(null), 2000); },
      () => { setCopied("failed"); setTimeout(() => live.current && setCopied(null), 3000); }
    );
  }

  function onTabKey(e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = layout === "broll" ? "script" : "broll";
    setLayout(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  }

  return (
    <div
      ref={boxRef}
      style={{
        background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: "var(--radius)", overflow: "hidden",
      }}
    >
      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="How to show this script"
        style={{
          display: "flex", alignItems: "stretch",
          padding: narrow ? "0 6px" : "0 14px 0 8px",
          borderBottom: "1px solid var(--line)", background: "var(--card)",
        }}
      >
        {TABS.map((t) => {
          const on = layout === t.id;
          return (
            <button
              key={t.id}
              id={`${uid}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setLayout(t.id)}
              onKeyDown={onTabKey}
              style={{
                // Halves on a narrow card, so the two read as the one choice
                // they are and each is a thumb-sized target.
                flex: narrow ? "1 1 0" : "0 0 auto",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: narrow ? "12px 8px 10px" : "13px 14px 11px",
                // Reset first, then the one edge that stays.
                border: "none", borderBottom: `2px solid ${on ? "var(--ink)" : "transparent"}`,
                marginBottom: -1, background: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13.5, fontWeight: on ? 650 : 550,
                color: on ? "var(--ink)" : "var(--ink-mute)", whiteSpace: "nowrap",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          );
        })}
        {!narrow && meta && (
          <span
            style={{
              marginLeft: "auto", alignSelf: "center", minWidth: 0, paddingLeft: 12,
              fontSize: 12, color: "var(--ink-mute)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {meta}
          </span>
        )}
      </div>

      {/* ── Read in, and the actions ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
          padding: narrow ? "8px 10px" : "8px 12px 8px 15px",
          borderBottom: "1px solid var(--made-line)", background: "var(--made-tint)",
        }}
      >
        {narrow && meta && (
          <span style={{ flexBasis: "100%", fontSize: 12, color: "var(--ink-mute)", lineHeight: 1.5 }}>
            {meta}
          </span>
        )}
        <ScriptToggle
          value={shown}
          onChange={setAlphabet}
          nativeLabel={script.language_label}
          nativeText={script.text}
          hasRoman={romanOk}
          hasEnglish={englishOk}
          compact={narrow}
        />
        {/* Right-aligned whether or not there is a toggle beside them, and they
            wrap onto their own row as a pair rather than one at a time. */}
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          {pack && (
            <button onClick={() => setPrompting(true)} className="hg-btn-ghost" style={ghostBtn}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8" />
              </svg>
              {narrow ? "Prompter" : "Teleprompter"}
            </button>
          )}
          <button
            onClick={copy}
            className="hg-btn-ghost"
            title={copyingPlan ? "Copies every line with its timecode, the shots and the have-ready list" : "Copies the script as paragraphs"}
            style={{
              ...ghostBtn,
              color: copied === "ok" ? "var(--ok)" : copied === "failed" ? "var(--bad)" : "var(--ink-body)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {copied === "ok"
                ? <path d="M4 12.5l5.5 5.5L20 6.5" />
                : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>}
            </svg>
            {copied === "ok" ? "Copied" : copied === "failed" ? "Couldn't copy" : copyingPlan ? "Copy B-roll" : "Copy script"}
          </button>
        </span>
      </div>

      {script.english_error && <EnglishNote message={script.english_error} />}

      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${layout}`}>
        {layout === "broll" ? (
          <ShootPack
            pack={pack}
            status={packStatus}
            error={packError}
            price={price}
            roman={shown === "roman"}
            narrow={narrow}
            onRetry={() => build()}
            onConfirm={() => build({ confirm: true })}
            onReadScript={() => setLayout("script")}
          />
        ) : (
          // `indic` only on the script in its own letters. Keyed on what is
          // shown so a switch is a real swap, which is what lets the fade read
          // as a change of content.
          <div
            key={shown}
            className={shown === "native" ? "indic hg-fade" : "hg-fade"}
            style={{
              padding: narrow ? 17 : 22,
              fontSize: narrow ? 15.5 : 16.5,
              color: "var(--ink)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: shown === "english" ? 1.75 : undefined,
            }}
          >
            {text}
          </div>
        )}
      </div>

      {/* Portalled to the body: this card sits inside panes and sheets that
          animate with a transform, and a fixed element inside a transformed
          ancestor is fixed to that ancestor instead of the screen. */}
      {prompting && pack && createPortal(
        <Teleprompter
          lines={pack.lines || []}
          roman={shown === "roman"}
          script={{ ...script, roman_text: romanText, shoot_pack: pack }}
          onClose={() => setPrompting(false)}
        />,
        document.body
      )}
    </div>
  );
}

const ghostBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
  padding: "6px 12px", borderRadius: 9,
  border: "1px solid var(--line)", background: "var(--card)",
  color: "var(--ink-body)", cursor: "pointer", whiteSpace: "nowrap",
};
