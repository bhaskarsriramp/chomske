import { useState, useEffect } from "react";
import api from "../../api";
import useIsMobile from "../../hooks/useIsMobile";

/**
 * "Analysis" — the first screen a showcase visitor lands on.
 *
 * ── WHY THIS IS THE FIRST SCREEN AND NOT THE FEED ────────────────────────────
 * Somebody who has never heard of us opens a link from a cold email. Dropping
 * them straight onto a topic list answers a question they have not asked yet.
 * The question they DO have is "what is this and why does it have my name on
 * it", and the only answer that buys the next click is specificity: not "AI
 * writes scripts in your voice", but "you open four of your five videos the same
 * way, 9% of your words are English, and here are the ones that stay English".
 *
 * Every number here is counted from their own transcripts with no model in the
 * loop (services/voiceMetrics.js), which is what makes it checkable against
 * videos they made themselves. That is the whole persuasion.
 *
 * ── THE DISCLOSURE IS ABOVE THE FOLD, NOT IN A FOOTER ────────────────────────
 * A person who finds a page carrying their own name and their own sentences
 * asks three things in order: what is this, who can see it, how do I stop it.
 * Answering before they have to ask is the decent thing, and in practice it is
 * what stops a polite objection becoming a public one.
 */
export default function AnalysisPanel({ user, onGoCreate }) {
  const isPhone = useIsMobile(760);
  const [a, setA] = useState(null);
  const [state, setState] = useState("loading");
  const [retiring, setRetiring] = useState(false);
  const [retired, setRetired] = useState(false);

  const name = user?.showcase?.display_name || user?.name || "you";
  const slug = user?.showcase?.slug || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/v/analysis");
        if (!cancelled) { setA(data?.analysis || null); setState("ready"); }
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function retire() {
    if (!window.confirm("Remove this page and the voice profile behind it? This can't be undone.")) return;
    setRetiring(true);
    try {
      await api.post(`/v/${slug}/retire`);
      setRetired(true);
    } catch {
      setRetiring(false);
    }
  }

  const pad = isPhone ? "20px" : "clamp(28px, 4vw, 56px)";

  if (retired) {
    return (
      <Page pad={pad}>
        <h1 style={h1(isPhone)}>Removed.</h1>
        <p style={body(isPhone)}>
          This page and the voice profile behind it are gone. Nothing was ever published,
          and we won't contact you about it again. Sorry for the intrusion.
        </p>
      </Page>
    );
  }

  const pc = (x) => (x === null || x === undefined ? null : `${Math.round(x * 100)}%`);

  // Only facts we actually measured. A stat with no number behind it is worse
  // than one fewer stat: this screen's entire credibility rests on every figure
  // being checkable against a video they made.
  const stats = !a ? [] : [
    a.videos ? { k: "Videos read", v: String(a.videos) } : null,
    a.language_label ? { k: "You speak", v: a.language_label } : null,
    a.english_ratio != null && a.script !== "English" ? { k: "English mixed in", v: pc(a.english_ratio) } : null,
    a.mean_sentence_words ? { k: "Avg sentence", v: `${a.mean_sentence_words} words` } : null,
    a.words_per_second ? { k: "You speak at", v: `${a.words_per_second} words/sec` } : null,
    a.question_ratio ? { k: "Sentences that ask", v: pc(a.question_ratio) } : null,
  ].filter(Boolean);

  return (
    <Page pad={pad}>
      <div
        style={{
          border: "1px solid var(--line)", borderRadius: 12,
          padding: isPhone ? "12px 14px" : "13px 16px", marginBottom: isPhone ? 24 : 30,
          fontSize: 13, lineHeight: 1.6, color: "var(--ink-mute)", background: "var(--card)",
        }}
      >
        We built this from {a?.videos || "a few"} of your public videos to show you what it
        does. <strong style={{ color: "var(--ink-body)" }}>Nothing has been published</strong> — this
        page isn't indexed and the link is private to you.{" "}
        <button onClick={retire} disabled={retiring} style={linkBtn}>
          {retiring ? "Removing…" : "Remove it"}
        </button>{" "}
        and it's gone for good.
      </div>

      <h1 style={h1(isPhone)}>{name}, this is how you talk.</h1>
      <p style={{ ...body(isPhone), maxWidth: 720 }}>
        {state === "loading"
          ? "Reading what we measured…"
          : state === "failed"
            ? "We couldn't load the analysis just now. The writing below still works."
            : `We read ${a?.videos || "your"} of your videos and measured them — no guessing, no adjectives. Everything below is counted from your own words.`}
      </p>

      {stats.length > 0 && (
        <div
          style={{
            display: "grid", gap: isPhone ? 10 : 13, margin: `${isPhone ? 24 : 30}px 0 0`,
            gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(auto-fit, minmax(170px, 1fr))",
          }}
        >
          {stats.map((s) => (
            <div key={s.k} style={card(isPhone)}>
              <div style={{ fontSize: 12, color: "var(--ink-mute)", marginBottom: 6 }}>{s.k}</div>
              <div style={{ fontSize: isPhone ? 20 : 24, fontWeight: 750, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                {s.v}
              </div>
            </div>
          ))}
        </div>
      )}

      {a?.english_kept?.length > 0 && (
        <Detail title="Words you keep in English" isPhone={isPhone}>{a.english_kept.join(" · ")}</Detail>
      )}
      {a?.opening_stems?.length > 0 && (
        <Detail title="You open videos the same way" isPhone={isPhone}>
          {a.opening_stems.map((s) => `“${s}…”`).join("   ")}
        </Detail>
      )}
      {a?.repeated_phrases?.length > 0 && (
        <Detail title="Phrases you repeat across videos" isPhone={isPhone}>
          {a.repeated_phrases.join("  ·  ")}
        </Detail>
      )}

      {a?.signature_phrase_count > 0 && (
        <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--ink-mute)", marginTop: 20, maxWidth: 720 }}>
          We also captured {a.signature_phrase_count} of your catchphrases and {a.category_voice_fields} things
          specific to how you cover tech — how you say a spec, how you say a price, the exact words
          you use to tell someone not to buy something. Those stay on our side; they're what the
          writing runs on.
        </p>
      )}

      <button onClick={onGoCreate} style={primaryBtn(isPhone)}>
        Now watch it write today's news in your voice →
      </button>
    </Page>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────── */

function Page({ children, pad }) {
  return (
    <div className="hg-scroll" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: `${28}px ${pad} 90px` }}>{children}</div>
    </div>
  );
}

function Detail({ title, children, isPhone }) {
  return (
    <div style={{ marginTop: isPhone ? 20 : 25 }}>
      <div style={{
        fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".06em",
        color: "var(--ink-mute)", marginBottom: 7, fontWeight: 700,
      }}>{title}</div>
      <div style={{ fontSize: isPhone ? 14.5 : 16, lineHeight: 1.7, color: "var(--ink)" }}>{children}</div>
    </div>
  );
}

const h1 = (isPhone) => ({
  fontSize: isPhone ? 26 : "clamp(30px, 3vw, 44px)",
  fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.12,
  color: "var(--ink)", margin: "0 0 12px",
});
const body = (isPhone) => ({
  fontSize: isPhone ? 15 : 16.5, lineHeight: 1.62, color: "var(--ink-body)", margin: 0,
});
const card = (isPhone) => ({
  background: "var(--card)", border: "1px solid var(--line)",
  borderRadius: 14, padding: isPhone ? "13px 14px" : "16px 17px",
});
const primaryBtn = (isPhone) => ({
  marginTop: isPhone ? 26 : 34, display: "inline-flex", alignItems: "center",
  height: 48, padding: "0 24px", borderRadius: 999, border: "none",
  background: "var(--ink)", color: "#fff",
  fontSize: isPhone ? 14.5 : 15.5, fontWeight: 650, cursor: "pointer",
});
const linkBtn = {
  padding: 0, border: "none", background: "transparent", color: "var(--ink-body)",
  fontSize: 13, cursor: "pointer", textDecoration: "underline",
};
