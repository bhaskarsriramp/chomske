import { useState, useEffect } from "react";
import api from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Skeleton from "../Shell/Skeleton";

/**
 * "Analysis": the first screen a showcase visitor lands on.
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
 * ── WHERE THE DISCLOSURE SITS ────────────────────────────────────────────────
 * It used to be a bordered banner above the headline, which meant the page
 * opened by apologising for itself: the first thing a creator read was a
 * paragraph about what we had not done, before anything showed them why the
 * link was worth opening.
 *
 * It is now one quiet line at the foot of the page, saying what this was built
 * from and that nothing has been published. The self-serve off switch that sat
 * beside it has been removed by request; a takedown is handled from the admin
 * panel, which can deactivate a showcase or rotate its link.
 */
export default function AnalysisPanel({ user, onGoCreate }) {
  const isPhone = useIsMobile(760);
  const [a, setA] = useState(null);
  const [state, setState] = useState("loading");

  const name = user?.showcase?.display_name || user?.name || "you";

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

  const pad = isPhone ? "20px" : "clamp(28px, 4vw, 56px)";

  // ── THE WAIT IS THE FIRST IMPRESSION ──────────────────────────────────────
  // This screen is reached by clicking a link in a cold email, often on a phone
  // on a slow connection, and it is the moment the whole outreach either works
  // or does not. A blank white panel for two seconds reads as broken, and a
  // creator who thinks it is broken closes the tab before anything loads.
  //
  // The skeleton mirrors the real layout, headline, paragraph, five stat cards,
  // two detail rows, so nothing jumps when the numbers land. The name is shown
  // for real even here: it comes from the session rather than the request, so
  // there is no reason to hide the one thing that proves this page is about
  // them.
  if (state === "loading") {
    return (
      <Page pad={pad}>
        <Skeleton variant="text" width="72%" height={isPhone ? 30 : 44} />
        <div style={{ height: 14 }} />
        <Skeleton variant="text" width="88%" height={14} />
        <Skeleton variant="text" width="64%" height={14} />

        <div
          style={{
            display: "grid", gap: isPhone ? 10 : 13, margin: `${isPhone ? 24 : 30}px 0 0`,
            gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(auto-fit, minmax(170px, 1fr))",
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={card(isPhone)}>
              <Skeleton variant="text" width="58%" height={10} />
              <div style={{ height: 8 }} />
              <Skeleton variant="text" width="74%" height={isPhone ? 20 : 24} />
            </div>
          ))}
        </div>

        {[0, 1].map((i) => (
          <div key={i} style={{ marginTop: isPhone ? 20 : 25 }}>
            <Skeleton variant="text" width={168} height={10} />
            <div style={{ height: 8 }} />
            <Skeleton variant="text" width="92%" height={14} />
            <Skeleton variant="text" width="70%" height={14} />
          </div>
        ))}

        <div style={{ marginTop: isPhone ? 26 : 34 }}>
          <Skeleton variant="rectangular" width={320} height={48} style={{ borderRadius: 999, maxWidth: "100%" }} />
        </div>
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
      <h1 style={h1(isPhone)}>{name}, this is how you talk.</h1>
      <p style={{ ...body(isPhone), maxWidth: 720 }}>
        {state === "failed"
          ? "We couldn't load the analysis just now. The writing below still works."
          : `We read ${a?.videos || "your"} of your videos and measured them. No guessing, no adjectives. Everything below is counted from your own words.`}
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
          specific to how you cover tech: how you say a spec, how you say a price, the exact words
          you use to tell someone not to buy something. Those stay on our side; they're what the
          writing runs on.
        </p>
      )}

      <button onClick={onGoCreate} style={primaryBtn(isPhone)}>
        Now watch it write today's news in your voice →
      </button>

      {/* The provenance line, and only that. The self-serve off switch that
          used to sit here is gone by request; a creator who wants the page
          taken down is handled from the admin panel, which can turn a showcase
          off or rotate its link. */}
      <div style={{ marginTop: isPhone ? 34 : 46, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--ink-mute)", margin: 0, maxWidth: 640 }}>
          Built from {a?.videos || "a few"} of your public videos. Nothing has been published:
          this page is not indexed and the link is private to you.
        </p>
      </div>
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
