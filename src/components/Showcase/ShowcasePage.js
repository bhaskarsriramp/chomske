import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import { HERO_WASH } from "../../theme";
import Logo from "../Shell/Logo";

/**
 * The private demo we email to one creator.
 *
 * ── WHAT THIS SCREEN IS FOR ──────────────────────────────────────────────────
 * Somebody who has never heard of us opens a link from a cold email. They have
 * roughly one screen's worth of patience, and the only thing that buys the next
 * one is specificity: not "AI writes scripts in your voice", but "you open four
 * of your five videos the same way, 41% of your words are English, and here are
 * the ones that stay English".
 *
 * That is why the analysis comes FIRST and the product second. The measured
 * numbers are checkable against videos they made themselves, which is what
 * separates this from every other tool that claims to sound like them.
 *
 * ── NO SIGN-IN, AND THAT IS THE POINT ────────────────────────────────────────
 * The link is the credential. Asking a stranger to create an account to look at
 * a demo is the step that loses them, and this whole feature exists to remove
 * exactly that step: the videos are already read, the voice is already built.
 *
 * ── WHAT THEY CANNOT DO HERE ─────────────────────────────────────────────────
 * Add videos, rebuild the voice, buy credits, or reach any other account. The
 * server enforces that (middleware/authenticateToken.js defaults to refusing a
 * showcase session), so the absence of those controls here is presentation, not
 * security.
 */

const STEP = { OPENING: "opening", DEAD: "dead", INTRO: "intro", TOPICS: "topics", SCRIPT: "script" };

export default function ShowcasePage() {
  const { slug } = useParams();
  const isPhone = useIsMobile(760);

  const [step, setStep] = useState(STEP.OPENING);
  const [error, setError] = useState("");
  const [showcase, setShowcase] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const [topics, setTopics] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  const [busyId, setBusyId] = useState("");
  const [script, setScript] = useState(null);
  const [credits, setCredits] = useState(0);
  const [wall, setWall] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [retired, setRetired] = useState(false);

  const pollRef = useRef(null);

  /* ── KEEP THIS PAGE OUT OF SEARCH ───────────────────────────────────────
     routes/showcase.js sends X-Robots-Tag on the API, but the HTML at /v/:slug
     is served by the static host, which knows nothing about this route. So the
     tag is set here too, on mount, and removed on unmount so it cannot leak
     onto the rest of the app.

     This matters more than a normal privacy nicety. The page carries a real
     person's name and quotes their own sentences back to them: sent privately
     to that person it is a courtesy they can end at any time, but indexed by
     Google it becomes public commercial use of their identity that they never
     agreed to, and a cached search result is not something an apology undoes.

     Belt and braces: also add `X-Robots-Tag: noindex` for /v/* at the static
     host, because a crawler that never executes our JavaScript never sees this. */
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow, noarchive";
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, []);

  /* ── Open the link ─────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post(`/v/${slug}/open`);
        if (cancelled) return;
        setShowcase(data.showcase);
        setCredits(data.showcase?.credits ?? 0);
        setStep(STEP.INTRO);

        // The hook. Fetched right behind the open so the first screen has
        // something specific on it rather than a spinner and a name.
        try {
          const a = await api.get("/v/analysis");
          if (!cancelled) setAnalysis(a.data?.analysis || null);
        } catch { /* the page still works without it */ }
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err, "This link isn't active any more."));
        setStep(STEP.DEAD);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  /* ── Today's stories ───────────────────────────────────────────────────── */
  const loadTopics = useCallback(async () => {
    setLoadingTopics(true);
    setError("");
    try {
      const { data } = await api.get("/news", { params: { limit: 12 } });
      setTopics(data?.items || []);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load today's stories."));
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  function goTopics() {
    setStep(STEP.TOPICS);
    if (!topics.length) loadTopics();
  }

  /* ── Write one ─────────────────────────────────────────────────────────── */
  async function generate(item) {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    try {
      const { data } = await api.post("/script", {
        news_id: item.id,
        seconds: 60,
        profile_id: showcase?.profile_id,
      });
      setCredits(data?.balance ?? credits);
      setScript(data.script);
      setStep(STEP.SCRIPT);
      if (data.script?.status !== "done") poll(data.script.id);
      else setBusyId("");
    } catch (err) {
      // 402 is not an error, it is the end of the demo and the whole reason
      // there is a next screen. Everything else is a genuine failure.
      if (err?.response?.status === 402) {
        setWall(true);
        setBusyId("");
        return;
      }
      setError(errorMessage(err, "Couldn't write that one. Please try again."));
      setBusyId("");
    }
  }

  function poll(id) {
    clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/script/${id}`);
        setScript(data.script);
        if (data.script?.status === "processing") poll(id);
        else setBusyId("");
      } catch {
        setBusyId("");
      }
    }, 2500);
  }

  /* ── Claim ─────────────────────────────────────────────────────────────── */
  async function onCredential(credentialResponse) {
    setClaiming(true);
    setError("");
    try {
      await api.post("/auth/google", { credential: credentialResponse.credential });
      // The whole payoff: the profile, the voice and the transcripts move onto
      // the account they just created, so they land on a finished voice instead
      // of an empty "paste five URLs" screen.
      await api.post("/v/claim", { showcase_id: showcase?.id });
      window.location.href = "/app/discover";
    } catch (err) {
      setError(errorMessage(err, "Couldn't finish that. Please try again."));
      setClaiming(false);
    }
  }

  async function retire() {
    if (!window.confirm("Remove this page and the voice profile behind it? This can't be undone.")) return;
    try {
      await api.post(`/v/${slug}/retire`);
      setRetired(true);
    } catch {
      setError("Couldn't remove that. Please email us and we'll do it.");
    }
  }

  /* ── Render ────────────────────────────────────────────────────────────── */
  const pad = isPhone ? "20px" : "clamp(32px, 6vw, 110px)";
  const name = showcase?.display_name || "you";

  if (retired) {
    return (
      <Shell pad={pad}>
        <h1 style={h1(isPhone)}>Removed.</h1>
        <p style={body(isPhone)}>
          This page and the voice profile behind it are gone. Nothing was ever published,
          and we won't contact you about it again. Sorry for the intrusion.
        </p>
      </Shell>
    );
  }

  if (step === STEP.OPENING) {
    return <Shell pad={pad}><p style={body(isPhone)}>Opening…</p></Shell>;
  }

  if (step === STEP.DEAD) {
    return (
      <Shell pad={pad}>
        <h1 style={h1(isPhone)}>This link isn't active.</h1>
        <p style={body(isPhone)}>{error || "It may have expired, or already been claimed."}</p>
      </Shell>
    );
  }

  return (
    <Shell pad={pad}>
      {/* ── THE DISCLOSURE ──────────────────────────────────────────────────
          Placed above everything, not buried at the bottom, and written to be
          read. Somebody who finds a page with their own name and their own
          sentences on it will ask these three questions in this order: what is
          this, who can see it, and how do I make it stop. Answering before
          they have to ask is both the decent thing and, in practice, the thing
          that stops a polite objection becoming a public one. */}
      <div
        style={{
          border: "1px solid var(--line, #E3E3E3)", borderRadius: 12,
          padding: isPhone ? "12px 14px" : "13px 16px", marginBottom: isPhone ? 26 : 34,
          fontSize: 13, lineHeight: 1.6, color: "var(--ink-mute)", background: "var(--card)",
        }}
      >
        We built this from {analysis?.videos || showcase?.transcript_count || "a few"} of your public
        videos to show you what it does. <strong style={{ color: "var(--ink-body)" }}>Nothing has been
        published</strong> — this page isn't indexed and the link is private to you.{" "}
        <button onClick={retire} style={linkBtn}>Remove it</button> and it's gone for good.
      </div>

      {step === STEP.INTRO && (
        <Intro
          name={name}
          analysis={analysis}
          showcase={showcase}
          isPhone={isPhone}
          onNext={goTopics}
        />
      )}

      {step === STEP.TOPICS && (
        <Topics
          name={name}
          topics={topics}
          loading={loadingTopics}
          busyId={busyId}
          credits={credits}
          isPhone={isPhone}
          onPick={generate}
          onBack={() => setStep(STEP.INTRO)}
        />
      )}

      {step === STEP.SCRIPT && (
        <ScriptView
          script={script}
          name={name}
          credits={credits}
          isPhone={isPhone}
          onAnother={() => { setScript(null); goTopics(); }}
        />
      )}

      {error && (
        <div role="alert" style={{ marginTop: 18, fontSize: 13.5, color: "#C0392B" }}>{error}</div>
      )}

      {wall && (
        <Wall
          name={name}
          isPhone={isPhone}
          claiming={claiming}
          onCredential={onCredential}
          onClose={() => setWall(false)}
        />
      )}
    </Shell>
  );
}

/* ── Screens ────────────────────────────────────────────────────────────── */

function Intro({ name, analysis, showcase, isPhone, onNext }) {
  const pc = (x) => (x === null || x === undefined ? null : `${Math.round(x * 100)}%`);
  const a = analysis || {};

  // Only facts we actually measured. A stat with no number behind it is worse
  // than one fewer stat: this page's entire credibility is that every figure on
  // it can be checked against a video they made.
  const stats = [
    a.videos ? { k: "Videos read", v: String(a.videos) } : null,
    a.language_label ? { k: "You speak", v: a.language_label } : null,
    a.english_ratio !== null && a.english_ratio !== undefined && a.script !== "English"
      ? { k: "English mixed in", v: pc(a.english_ratio) } : null,
    a.mean_sentence_words ? { k: "Avg sentence", v: `${a.mean_sentence_words} words` } : null,
    a.words_per_second ? { k: "You speak at", v: `${a.words_per_second} words/sec` } : null,
    a.question_ratio ? { k: "Sentences that ask", v: pc(a.question_ratio) } : null,
  ].filter(Boolean);

  return (
    <>
      <h1 style={h1(isPhone)}>
        {name}, this is how you talk.
      </h1>
      <p style={{ ...body(isPhone), maxWidth: 760 }}>
        We read {a.videos || showcase?.transcript_count || "your"} of your videos and measured
        them — no guessing, no adjectives. Everything below is counted from your own words.
      </p>

      {stats.length > 0 && (
        <div
          style={{
            display: "grid", gap: isPhone ? 10 : 14, margin: `${isPhone ? 26 : 34}px 0 0`,
            gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
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

      {a.english_kept?.length > 0 && (
        <Detail title="Words you keep in English" isPhone={isPhone}>
          {a.english_kept.join(" · ")}
        </Detail>
      )}

      {a.opening_stems?.length > 0 && (
        <Detail title="You open videos the same way" isPhone={isPhone}>
          {a.opening_stems.map((s) => `“${s}…”`).join("   ")}
        </Detail>
      )}

      {a.repeated_phrases?.length > 0 && (
        <Detail title="Phrases you repeat across videos" isPhone={isPhone}>
          {a.repeated_phrases.join("  ·  ")}
        </Detail>
      )}

      {a.signature_phrase_count > 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-mute)", marginTop: 20 }}>
          We also captured {a.signature_phrase_count} of your catchphrases and{" "}
          {a.category_voice_fields} things specific to how you cover tech — how you say a spec,
          how you say a price, the exact words you use to tell someone not to buy something.
          Those stay on our side; they're what the writing runs on.
        </p>
      )}

      <button onClick={onNext} style={primaryBtn(isPhone)}>
        Now watch it write today's news in your voice →
      </button>
    </>
  );
}

function Topics({ name, topics, loading, busyId, credits, isPhone, onPick, onBack }) {
  return (
    <>
      <button onClick={onBack} style={linkBtn}>← Back to your analysis</button>
      <h1 style={{ ...h1(isPhone), marginTop: 14 }}>What's worth covering today.</h1>
      <p style={{ ...body(isPhone), maxWidth: 760 }}>
        We watch 120+ sources around the clock and rank what's actually happening in tech.
        Pick one and we'll write it as a 60-second script, in your voice.
      </p>
      <p style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 8 }}>
        {credits} credits left on this link — about {Math.max(0, Math.floor(credits / 30))} more scripts.
      </p>

      {loading && <p style={{ ...body(isPhone), marginTop: 24 }}>Loading today's stories…</p>}

      {!loading && !topics.length && (
        <p style={{ ...body(isPhone), marginTop: 24 }}>Nothing ranked yet today. Try again shortly.</p>
      )}

      <div style={{ display: "grid", gap: isPhone ? 10 : 12, marginTop: isPhone ? 22 : 28 }}>
        {topics.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t)}
            disabled={Boolean(busyId)}
            style={{
              ...card(isPhone), textAlign: "left", cursor: busyId ? "wait" : "pointer",
              opacity: busyId && busyId !== t.id ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: isPhone ? 15 : 16.5, fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>
                {t.headline || t.title}
              </span>
              {t.summary && (
                <span style={{ display: "block", fontSize: 13, lineHeight: 1.55, color: "var(--ink-body)" }}>
                  {String(t.summary).slice(0, 150)}
                </span>
              )}
            </span>
            <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 650, color: "var(--ink-mute)" }}>
              {busyId === t.id ? "Writing…" : "Write it →"}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function ScriptView({ script, name, credits, isPhone, onAnother }) {
  const done = script?.status === "done";
  const failed = script?.status === "failed";

  return (
    <>
      <h1 style={h1(isPhone)}>
        {done ? `In ${name}'s voice.` : failed ? "That one didn't work." : "Writing…"}
      </h1>
      {script?.headline && (
        <p style={{ ...body(isPhone), maxWidth: 760 }}>{script.headline}</p>
      )}

      {!done && !failed && (
        <p style={{ ...body(isPhone), marginTop: 20 }}>
          Reading the coverage, then writing it the way you would. About thirty seconds.
        </p>
      )}

      {failed && (
        <p style={{ ...body(isPhone), marginTop: 20 }}>
          {script?.error || "Something went wrong writing that one. Your credits weren't charged."}
        </p>
      )}

      {done && (
        <div
          style={{
            ...card(isPhone), marginTop: isPhone ? 22 : 28,
            whiteSpace: "pre-wrap", fontSize: isPhone ? 15 : 16.5, lineHeight: 1.75,
            color: "var(--ink)",
          }}
        >
          {script.text}
        </div>
      )}

      {(done || failed) && (
        <>
          <button onClick={onAnother} style={primaryBtn(isPhone)}>
            Try another story
          </button>
          <p style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 12 }}>
            {credits} credits left on this link.
          </p>
        </>
      )}
    </>
  );
}

/**
 * The end of the demo.
 *
 * Not "buy credits": there is no account for credits to go into, and asking a
 * stranger to pay before they have signed up is a step nobody takes. The ask is
 * to keep the voice — which already exists, already cost us money to build, and
 * transfers to their account intact the moment they sign in.
 */
function Wall({ name, isPhone, claiming, onCredential, onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center",
        background: "rgba(12,12,14,.55)", padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card, #fff)", borderRadius: 18, padding: isPhone ? "26px 22px" : "34px 34px",
          maxWidth: 520, width: "100%", border: "1px solid var(--line, #E3E3E3)",
        }}
      >
        <h2 style={{ fontSize: isPhone ? 22 : 27, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 12px" }}>
          This is your voice. Take it with you.
        </h2>
        <p style={{ fontSize: isPhone ? 14.5 : 15.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 8px" }}>
          Sign in and everything on this page — the videos, the analysis, the voice — moves
          onto your account. You won't be asked to paste anything or wait for it again.
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 0 22px" }}>
          100 free credits to start. No card.
        </p>

        {claiming ? (
          <p style={{ fontSize: 14, color: "var(--ink-body)" }}>Setting up your account…</p>
        ) : (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <GoogleLogin onSuccess={onCredential} onError={() => {}} text="continue_with" shape="pill" size="large" width="280" />
          </div>
        )}

        <button onClick={onClose} style={{ ...linkBtn, marginTop: 18, display: "block" }}>
          Not now
        </button>
      </div>
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────── */

function Shell({ children, pad }) {
  return (
    <div style={{ minHeight: "100vh", background: HERO_WASH }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: `40px ${pad} 120px` }}>
        <div style={{ marginBottom: 34 }}><Logo size={28} fontSize={16} /></div>
        {children}
      </div>
    </div>
  );
}

function Detail({ title, children, isPhone }) {
  return (
    <div style={{ marginTop: isPhone ? 20 : 26 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-mute)", marginBottom: 7, fontWeight: 650 }}>
        {title}
      </div>
      <div style={{ fontSize: isPhone ? 14.5 : 16, lineHeight: 1.7, color: "var(--ink)" }}>{children}</div>
    </div>
  );
}

const h1 = (isPhone) => ({
  fontSize: isPhone ? 27 : "clamp(32px, 3.4vw, 50px)",
  fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.12,
  color: "var(--ink)", margin: "0 0 14px",
});

const body = (isPhone) => ({
  fontSize: isPhone ? 15 : 17, lineHeight: 1.62, color: "var(--ink-body)", margin: 0,
});

const card = (isPhone) => ({
  background: "var(--card, #fff)", border: "1px solid var(--line, #E3E3E3)",
  borderRadius: 14, padding: isPhone ? "14px 15px" : "17px 18px",
});

const primaryBtn = (isPhone) => ({
  marginTop: isPhone ? 28 : 36, display: "inline-flex", alignItems: "center",
  height: 48, padding: "0 26px", borderRadius: 999, border: "none",
  background: "var(--primary, #0F0E0C)", color: "#fff",
  fontSize: isPhone ? 15 : 16, fontWeight: 650, cursor: "pointer",
});

const linkBtn = {
  padding: 0, border: "none", background: "transparent", color: "var(--ink-mute)",
  fontSize: 13, cursor: "pointer", textDecoration: "underline",
};
