import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";

/**
 * The landing page.
 *
 * The hero shows the actual output rather than describing it. For a product whose
 * entire claim is "the script stays in the language it was spoken in", a screenshot
 * of Devanagari sitting next to English words IS the pitch — a paragraph saying
 * "supports Indian languages" proves nothing and reads like every other AI tool.
 */
export default function LandingPage({ onSignedIn, checking }) {
  const isMobile = useIsMobile();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCredential(credentialResponse) {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/google", {
        credential: credentialResponse.credential,
      });
      onSignedIn(data.user);
    } catch (err) {
      setError(errorMessage(err, "Sign-in failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  // The gutter scales with the viewport instead of capping content in a fixed
  // centred column. A 27" monitor should get a genuinely wider page, not the same
  // 1080px strip with more empty space either side of it.
  const pad = isMobile ? "20px" : "clamp(32px, 5vw, 104px)";

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Nav pad={pad} />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{ padding: `${isMobile ? 44 : 76}px ${pad} ${isMobile ? 12 : 28}px` }}>
        <div>
          <div
            style={{
              display: isMobile ? "block" : "grid",
              gridTemplateColumns: "1.05fr 1fr",
              gap: "clamp(40px, 5vw, 88px)",
              alignItems: "center",
            }}
          >
            <div className="hg-rise">
              <Eyebrow>For Indian creators</Eyebrow>

              <h1
                style={{
                  // Type scales with the viewport rather than the column being
                  // capped: a wider screen gets bigger words, so the line stays
                  // the same readable number of characters without wasting width.
                  fontSize: isMobile ? 34 : "clamp(44px, 4.1vw, 78px)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.035em",
                  fontWeight: 800,
                  color: "var(--ink)",
                  margin: "16px 0 0",
                }}
              >
                Hear what they
                <br />
                actually said.
              </h1>

              <p
                style={{
                  fontSize: isMobile ? 16 : "clamp(17px, 1.15vw, 23px)",
                  lineHeight: 1.6,
                  color: "var(--ink-body)",
                  margin: "18px 0 0",
                }}
              >
                Paste a YouTube link. Get the transcript in the language it was
                spoken in — Hindi stays Hindi, Telugu stays Telugu, and the English
                words mixed in stay exactly where they were.
              </p>

              <p
                style={{
                  fontSize: isMobile ? 14.5 : "clamp(14.5px, 0.9vw, 18px)",
                  lineHeight: 1.6,
                  color: "var(--ink-mute)",
                  margin: "14px 0 0",
                }}
              >
                No translation. No transliteration into English letters. Just the
                words, in their own script.
              </p>

              <div style={{ marginTop: 30 }}>
                <SignIn
                  onCredential={handleCredential}
                  onError={() => setError("Google sign-in was cancelled or blocked.")}
                  busy={busy || checking}
                />
                {error && (
                  <div style={{ marginTop: 12, fontSize: 13.5, color: "var(--bad)" }} role="alert">
                    {error}
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink-mute)" }}>
                  Free to start · no card required
                </div>
              </div>
            </div>

            {!isMobile && <TranscriptPreview />}
          </div>

          {isMobile && (
            <div style={{ marginTop: 34 }}>
              <TranscriptPreview compact />
            </div>
          )}
        </div>
      </section>

      <Features isMobile={isMobile} pad={pad} />
      <HowItWorks isMobile={isMobile} pad={pad} />
      <ClosingCta isMobile={isMobile} pad={pad} onCredential={handleCredential} busy={busy} />
      <Footer pad={pad} />
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function Nav({ pad }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `18px ${pad}`,
        borderBottom: "1px solid var(--line)",
        background: "rgba(251,250,247,.85)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <Wordmark />
      <a
        href="#how"
        style={{ fontSize: 14, color: "var(--ink-mute)", textDecoration: "none", fontWeight: 500 }}
      >
        How it works
      </a>
    </header>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span
        aria-hidden="true"
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: "var(--ink)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: '"Noto Sans Devanagari", Inter, sans-serif',
        }}
      >
        ह
      </span>
      <span style={{ fontWeight: 700, fontSize: 16.5, color: "var(--ink)", letterSpacing: "-0.02em" }}>
        Hinglish
      </span>
    </div>
  );
}

function Eyebrow({ children }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "0.13em",
        textTransform: "uppercase",
        color: "var(--accent)",
        background: "var(--accent-soft)",
        border: "1px solid #F7CFCF",
        borderRadius: 999,
        padding: "6px 12px",
      }}
    >
      {children}
    </span>
  );
}

function SignIn({ onCredential, onError, busy }) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8, opacity: busy ? 0.6 : 1 }}>
      <GoogleLogin
        onSuccess={onCredential}
        onError={onError}
        text="continue_with"
        shape="pill"
        size="large"
        width="260"
      />
    </div>
  );
}

/**
 * The product's output, shown rather than described. The mixed Devanagari and
 * English here is the whole point — it's what a real Hindi tech video sounds like.
 */
function TranscriptPreview({ compact = false }) {
  return (
    <div
      className="hg-rise"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 18,
        boxShadow: "0 24px 60px -34px rgba(15,15,15,.4)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--line)",
          background: "#F9F9F9",
        }}
      >
        <Dot /><Dot /><Dot />
        <span style={{ marginLeft: 6, fontSize: 12, color: "var(--ink-mute)" }}>
          youtube.com/watch?v=…
        </span>
      </div>

      <div style={{ padding: compact ? 18 : 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Pill>Hinglish (Hindi–English)</Pill>
          <Pill subtle>detected automatically</Pill>
        </div>

        <p className="indic" style={{ fontSize: compact ? 15 : 16.5, color: "var(--ink)", margin: 0 }}>
          तो दोस्तों, आज हम बात करने वाले हैं एक ऐसे <b>AI model</b> के बारे में
          जो पूरी तरह से <b>open source</b> है।
        </p>
        <p className="indic" style={{ fontSize: compact ? 15 : 16.5, color: "var(--ink)", margin: "14px 0 0" }}>
          मैंने इसको खुद <b>test</b> किया है, और सच बताऊँ तो <b>results</b> काफ़ी
          impressive थे। चलिए <b>demo</b> देखते हैं।
        </p>

        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px dashed var(--line)",
            fontSize: 12.5,
            color: "var(--ink-mute)",
            lineHeight: 1.6,
          }}
        >
          Notice: <b style={{ color: "var(--ink-body)" }}>AI model</b>,{" "}
          <b style={{ color: "var(--ink-body)" }}>open source</b>,{" "}
          <b style={{ color: "var(--ink-body)" }}>test</b> stayed in English —
          because that's how it was said.
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#D9D9D9" }} />;
}

function Pill({ children, subtle }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        padding: "5px 10px",
        borderRadius: 999,
        color: subtle ? "var(--ink-mute)" : "var(--accent)",
        background: subtle ? "#F2F2F2" : "var(--accent-soft)",
        border: `1px solid ${subtle ? "var(--line)" : "#F7CFCF"}`,
      }}
    >
      {children}
    </span>
  );
}

function Features({ isMobile, pad }) {
  const items = [
    {
      t: "Its own script",
      d: "Devanagari stays Devanagari. Telugu, Bengali, Tamil and Marathi come back in their own script — never romanised into English letters.",
    },
    {
      t: "Code-mixing intact",
      d: "Indian creators mix English into Hindi constantly. The transcript keeps that exactly as spoken instead of forcing one language on the whole thing.",
    },
    {
      t: "Their real voice",
      d: "Filler words, repeats, catchphrases, the way they open and close. It reads like a person talking, not a cleaned-up press release.",
    },
  ];

  return (
    <section style={{ padding: `${isMobile ? 46 : 76}px ${pad}`, borderTop: "1px solid var(--line)" }}>
      <div>
        <h2
          style={{
            fontSize: isMobile ? 24 : "clamp(28px, 2.4vw, 44px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--ink)",
            margin: "0 0 10px",
          }}
        >
          Most tools translate. This one listens.
        </h2>
        <p style={{ fontSize: isMobile ? 15 : "clamp(15.5px, 1.05vw, 20px)", color: "var(--ink-body)", margin: "0 0 34px" }}>
          Run a Hindi video through a normal transcription tool and you get polite
          English back. The thing that made it worth watching is gone.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: isMobile ? 14 : "clamp(18px, 1.6vw, 32px)",
          }}
        >
          {items.map((f) => (
            <div
              key={f.t}
              className="hg-row"
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: 22,
              }}
            >
              <div style={{ fontSize: 16.5, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
                {f.t}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-body)" }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ isMobile, pad }) {
  const steps = [
    { n: "01", t: "Paste the link", d: "Any public YouTube video — full length, Shorts, or a youtu.be link." },
    { n: "02", t: "We listen to it", d: "The whole video is read end to end, and the spoken language is detected on its own." },
    { n: "03", t: "Read it back", d: "The transcript appears in its own script, ready to copy." },
  ];

  return (
    <section
      id="how"
      style={{ padding: `${isMobile ? 46 : 76}px ${pad}`, borderTop: "1px solid var(--line)", background: "#F2F2F2" }}
    >
      <div>
        <h2
          style={{
            fontSize: isMobile ? 24 : "clamp(28px, 2.4vw, 44px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--ink)",
            margin: "0 0 34px",
          }}
        >
          Three steps, about a minute.
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: isMobile ? 22 : "clamp(26px, 2.4vw, 52px)",
          }}
        >
          {steps.map((s) => (
            <div key={s.n}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "0.1em",
                  marginBottom: 10,
                }}
              >
                {s.n}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 7 }}>{s.t}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-body)" }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta({ isMobile, pad, onCredential, busy }) {
  return (
    <section
      // Centred copy gets its breathing room from a gutter that grows with the
      // viewport, not from a fixed content width — so the block stays centred and
      // legible at any size without pinning itself to one column.
      style={{
        padding: isMobile
          ? `52px ${pad}`
          : `84px clamp(32px, 26vw, 560px)`,
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h2
          style={{
            fontSize: isMobile ? 26 : "clamp(30px, 2.7vw, 50px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
            color: "var(--ink)",
            margin: "0 0 12px",
          }}
        >
          Try it on one video.
        </h2>
        <p style={{ fontSize: isMobile ? 15 : 16.5, color: "var(--ink-body)", margin: "0 0 26px" }}>
          Sign in with Google and paste a link. You'll know in a minute whether it
          hears what you hear.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <SignIn onCredential={onCredential} onError={() => {}} busy={busy} />
        </div>
      </div>
    </section>
  );
}

function Footer({ pad }) {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        padding: `26px ${pad}`,
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Wordmark />
      <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
        © {new Date().getFullYear()} Hinglish · chomske.com
      </div>
    </footer>
  );
}
