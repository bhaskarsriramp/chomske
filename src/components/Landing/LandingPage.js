import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import { HERO_WASH, categoryColor, cardTint } from "../../theme";
import Logo from "../Shell/Logo";

/**
 * The landing page.
 *
 * ── WHAT THIS PAGE IS SELLING ────────────────────────────────────────────────
 * Not transcription. Transcription is a step the product takes internally, and
 * an earlier version of this page led with it: "Hindi stays Hindi, Telugu stays
 * Telugu". That describes a mechanism to someone who has not yet been told what
 * the machine is for, and it reads as a language utility rather than the thing
 * a creator actually gets.
 *
 * What they get is a morning back. Every day they hunt for a topic, check
 * whether it is still fresh, and then write a script from nothing. This does
 * the first two before they wake up and drafts the third in their own speaking
 * style. So the page is ordered: the outcome, the day it replaces, the three
 * steps, then the niches, and only then the language detail, which is support
 * for "it sounds like you" rather than the headline.
 *
 * The visuals are the product's own screens rebuilt at small scale. A feature
 * list can claim anything; showing the feed a creator will actually open makes
 * the claim checkable in two seconds.
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
  // centred column. A 27" monitor should get a genuinely wider page, not the
  // same 1080px strip with more empty space either side of it.
  const pad = isMobile ? "20px" : "clamp(32px, 5vw, 104px)";

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", overflowX: "hidden" }}>
      <Nav pad={pad} />
      <Hero
        isMobile={isMobile}
        pad={pad}
        onCredential={handleCredential}
        onError={() => setError("Google sign-in was cancelled or blocked.")}
        error={error}
        busy={busy || checking}
      />
      <TheDay isMobile={isMobile} pad={pad} />
      <HowItWorks isMobile={isMobile} pad={pad} />
      <Niches isMobile={isMobile} pad={pad} />
      <SoundsLikeYou isMobile={isMobile} pad={pad} />
      <ClosingCta isMobile={isMobile} pad={pad} onCredential={handleCredential} busy={busy} />
      <Footer pad={pad} />
    </div>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────────── */

function Hero({ isMobile, pad, onCredential, onError, error, busy }) {
  return (
    <section
      style={{
        background: HERO_WASH,
        borderBottom: "1px solid var(--line)",
        padding: `${isMobile ? 40 : 74}px ${pad} ${isMobile ? 46 : 82}px`,
      }}
    >
      <div
        style={{
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: "1.02fr 1fr",
          gap: "clamp(40px, 4.6vw, 84px)",
          alignItems: "center",
        }}
      >
        <div className="hg-rise">
          <Eyebrow>Daily topics and scripts for Indian creators</Eyebrow>

          <h1
            style={{
              // Type scales with the viewport rather than the column being
              // capped: a wider screen gets bigger words, so the line stays the
              // same readable number of characters without wasting width.
              fontSize: isMobile ? 35 : "clamp(44px, 4.05vw, 76px)",
              lineHeight: 1.06,
              letterSpacing: "-0.038em",
              fontWeight: 800,
              color: "var(--ink)",
              margin: "18px 0 0",
            }}
          >
            Know what to post
            <br />
            today. By 9am.
          </h1>

          <p
            style={{
              fontSize: isMobile ? 16.5 : "clamp(17px, 1.15vw, 22px)",
              lineHeight: 1.58,
              color: "var(--ink-body)",
              margin: "20px 0 0",
            }}
          >
            Chomske watches the news in your niche all night, ranks the handful
            of stories actually worth a video, and writes the first draft in
            your own speaking style.
          </p>

          <p
            style={{
              fontSize: isMobile ? 14.5 : "clamp(14.5px, 0.92vw, 17.5px)",
              lineHeight: 1.6,
              color: "var(--ink-mute)",
              margin: "14px 0 0",
            }}
          >
            The two slowest parts of your day, finding the topic and writing the
            script, are finished before you open the app.
          </p>

          <div style={{ marginTop: 30 }}>
            <SignIn onCredential={onCredential} onError={onError} busy={busy} />
            {error && (
              <div style={{ marginTop: 12, fontSize: 13.5, color: "var(--bad)" }} role="alert">
                {error}
              </div>
            )}
            <div style={{ marginTop: 13, fontSize: 12.5, color: "var(--ink-mute)" }}>
              Free to start. No card required.
            </div>
          </div>

          <Proof isMobile={isMobile} />
        </div>

        <div style={{ marginTop: isMobile ? 36 : 0 }}>
          <ProductShot isMobile={isMobile} />
        </div>
      </div>
    </section>
  );
}

/**
 * Three claims the page then goes on to prove, sized as text rather than as
 * stat cards. Big numbers in boxes is how a landing page fakes traction it does
 * not have yet; these are statements about behaviour, which are true on day one.
 */
function Proof({ isMobile }) {
  const items = [
    ["Ranked, not listed", "Three stories worth covering, out of a few thousand"],
    ["Early, not late", "First seen times, so you post before the big channels"],
    ["Yours, not generic", "Written from your own videos, in the way you talk"],
  ];
  return (
    <div
      style={{
        marginTop: isMobile ? 34 : 44,
        paddingTop: isMobile ? 22 : 28,
        borderTop: "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
        gap: isMobile ? 16 : 22,
      }}
    >
      {items.map(([t, d]) => (
        <div key={t}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
            {t}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)" }}>{d}</div>
        </div>
      ))}
    </div>
  );
}

/* ── The product, shown ────────────────────────────────────────────────── */

/**
 * The feed and the script, side by side, drawn from the real components' shapes.
 * This is the page's main argument: the thing being sold is a screen you open
 * every morning, so the screen is what the hero shows.
 */
function ProductShot({ isMobile }) {
  return (
    <div
      className="hg-rise"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 18,
        boxShadow: "0 30px 70px -40px rgba(60,40,25,.4)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 15px",
          borderBottom: "1px solid var(--line)",
          background: "#FAFAFA",
        }}
      >
        <Dot /><Dot /><Dot />
        <span style={{ marginLeft: 6, fontSize: 11.5, color: "var(--ink-mute)" }}>
          chomske.com/app/topics
        </span>
      </div>

      <div style={{ padding: isMobile ? 15 : 18 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "var(--ink-mute)",
            marginBottom: 11,
          }}
        >
          Tuesday · what to cover today
        </div>

        <MockRow
          i={0}
          title="OpenAI ships a model that runs offline on a laptop"
          meta="5 sources · Hacker News, The Verge · 1h ago"
          fresh
        />
        <MockRow
          i={1}
          title="Google's new image model is free for the first month"
          meta="4 sources · DeepMind, Google News · 3h ago"
        />
        <MockRow
          i={2}
          title="Anthropic opens its enterprise tier to Indian startups"
          meta="3 sources · Google News · 5h ago"
          dim
        />

        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px dashed var(--line)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                padding: "5px 11px",
                borderRadius: 999,
                color: "#fff",
                background: "var(--primary)",
              }}
            >
              Write this in my voice
            </span>
            <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>
              learned from 5 of your videos
            </span>
          </div>

          <p
            className="indic"
            style={{
              fontSize: isMobile ? 14 : 15,
              lineHeight: 1.75,
              color: "var(--ink)",
              margin: 0,
            }}
          >
            तो दोस्तों, आज की सबसे बड़ी खबर, <b>OpenAI</b> ने एक ऐसा{" "}
            <b>model</b> निकाल दिया है जो आपके laptop पर बिना{" "}
            <b>internet</b> के चलेगा। मैंने खुद पढ़ा, और सच बताऊँ तो...
          </p>
        </div>
      </div>
    </div>
  );
}

/** Mirrors the real feed row: cycling warm ground, no category label, NEW only. */
function MockRow({ i, title, meta, fresh, dim }) {
  const t = cardTint(i);
  return (
    <div
      style={{
        padding: "11px 12px",
        borderRadius: 10,
        marginBottom: 7,
        background: `linear-gradient(180deg, ${t.from} 0%, var(--card) 76%)`,
        border: `1px solid ${t.line}`,
        opacity: dim ? 0.6 : 1,
      }}
    >
      {fresh && (
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--accent)", marginBottom: 4 }}>
          NEW
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "var(--ink)" }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 5 }}>{meta}</div>
    </div>
  );
}

/* ── The day it replaces ───────────────────────────────────────────────── */

function TheDay({ isMobile, pad }) {
  const before = [
    "Scroll four apps looking for something to talk about",
    "Read six articles to find out if it is even true",
    "Stare at a blank script, then write it twice",
    "Post at night, after two bigger channels already did",
  ];
  const after = [
    "Open one page, already ranked for your niche",
    "Every source that carried it, oldest first, in one click",
    "A draft in your own words, ready to edit",
    "Record while the story is still early",
  ];

  return (
    <section style={{ padding: `${isMobile ? 50 : 84}px ${pad}` }}>
      <SectionHead
        isMobile={isMobile}
        title="The part of the job nobody watches"
        sub="Recording takes twenty minutes. Deciding what to record, and writing it, takes the rest of the morning. That is the part this replaces."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 14 : "clamp(18px, 1.6vw, 30px)",
          marginTop: isMobile ? 26 : 38,
        }}
      >
        <Column
          isMobile={isMobile}
          heading="Your morning now"
          items={before}
          tone="plain"
        />
        <Column
          isMobile={isMobile}
          heading="Your morning with Chomske"
          items={after}
          tone="lit"
        />
      </div>
    </section>
  );
}

function Column({ heading, items, tone, isMobile }) {
  const lit = tone === "lit";
  return (
    <div
      style={{
        padding: isMobile ? 20 : 26,
        borderRadius: 16,
        background: lit
          ? "linear-gradient(160deg, #FFF7EE 0%, #FDF1EC 52%, #F4F5E6 100%)"
          : "var(--card)",
        border: `1px solid ${lit ? "#EEDFCE" : "var(--line)"}`,
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: lit ? "#A05A2C" : "var(--ink-mute)",
          marginBottom: 16,
        }}
      >
        {heading}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 13 }}>
        {items.map((t) => (
          <li key={t} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                marginTop: 6,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: lit ? "#B5502B" : "#C9C9C9",
              }}
            />
            <span
              style={{
                fontSize: isMobile ? 14.5 : 15.5,
                lineHeight: 1.55,
                color: lit ? "var(--ink)" : "var(--ink-mute)",
                fontWeight: lit ? 500 : 400,
              }}
            >
              {t}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── How ───────────────────────────────────────────────────────────────── */

function HowItWorks({ isMobile, pad }) {
  const steps = [
    {
      n: "01",
      t: "Tell it your niche",
      d: "Pick up to three from AI, markets, business, crypto, film, sports, science, government exams. It only watches those.",
      c: categoryColor("ai_tech"),
    },
    {
      n: "02",
      t: "Add a few of your Shorts",
      d: "It listens to how you open, the English words you keep, the way you sign off, and builds a profile of your voice. Up to five videos, once, at the start.",
      c: categoryColor("entertainment"),
    },
    {
      n: "03",
      t: "Open it every morning",
      d: "Today's ranked stories with every source attached. Pick one, and the script comes back in your words, with title ideas.",
      c: categoryColor("crypto"),
    },
  ];

  return (
    <section
      id="how"
      style={{
        padding: `${isMobile ? 50 : 84}px ${pad}`,
        borderTop: "1px solid var(--line)",
        background: "#FBFAF9",
      }}
    >
      <SectionHead
        isMobile={isMobile}
        title="Set up once. Then it is a habit."
        sub="Setting up is a one-off. After that it is one page you check before you record."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 14 : "clamp(18px, 1.6vw, 30px)",
          marginTop: isMobile ? 26 : 38,
        }}
      >
        {steps.map((s) => (
          <div
            key={s.n}
            style={{
              padding: isMobile ? 20 : 26,
              borderRadius: 16,
              background: `linear-gradient(170deg, ${s.c.tint} 0%, var(--card) 62%)`,
              border: `1px solid ${s.c.line}`,
            }}
          >
            <div
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 34,
                height: 34,
                borderRadius: 10,
                background: s.c.solid,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.02em",
                marginBottom: 15,
              }}
            >
              {s.n}
            </div>
            <div style={{ fontSize: isMobile ? 17 : 18, fontWeight: 700, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.015em" }}>
              {s.t}
            </div>
            <div style={{ fontSize: isMobile ? 14.5 : 15, lineHeight: 1.65, color: "var(--ink-body)" }}>
              {s.d}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Niches ────────────────────────────────────────────────────────────── */

/**
 * The eight categories, in their own colours. This section exists because the
 * previous page implied the product was a Hindi language tool, and a stock
 * market creator reading it had no reason to think it was for them.
 */
function Niches({ isMobile, pad }) {
  const cats = [
    ["ai_tech", "AI & technology", "Model launches, big tech moves, research that ships"],
    ["finance", "Stock market & finance", "Results season, IPOs, RBI, the rupee"],
    ["business", "Business & startups", "Funding rounds, founder moves, shake-ups"],
    ["crypto", "Crypto & Web3", "Prices with a cause, regulation, hacks"],
    ["entertainment", "Film & entertainment", "Releases, box office, casting, streaming"],
    ["sports", "Sports & cricket", "Results, squads, transfers, injuries"],
    ["science_health", "Science & health", "Studies that hold up, health guidance, space"],
    ["jobs_exams", "Govt jobs & exams", "Notifications, admit cards, results, dates"],
  ];

  return (
    <section style={{ padding: `${isMobile ? 50 : 84}px ${pad}`, borderTop: "1px solid var(--line)" }}>
      <SectionHead
        isMobile={isMobile}
        title="Built for whatever you cover"
        sub="Every category is watched by its own sources and judged by its own bar. A funding round is big news for a business channel and noise for a cricket one."
      />

      <div
        style={{
          display: "grid",
          // Two per row on a phone, labels only. Eight cards each carrying a
          // blurb in a 160px column turns into a page of five-line paragraphs,
          // and the point of this section is breadth, which the names alone
          // already make.
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(230px, 1fr))",
          gap: isMobile ? 10 : 14,
          marginTop: isMobile ? 26 : 38,
        }}
      >
        {cats.map(([id, label, blurb]) => {
          const c = categoryColor(id);
          return (
            <div
              key={id}
              style={{
                padding: isMobile ? "13px 13px" : "18px 18px",
                borderRadius: 14,
                background: `linear-gradient(165deg, ${c.tint} 0%, var(--card) 70%)`,
                border: `1px solid ${c.line}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: isMobile ? 0 : 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.solid, flexShrink: 0 }} />
                <span style={{ fontSize: isMobile ? 13 : 14.5, fontWeight: 700, color: c.ink, letterSpacing: "-0.01em" }}>
                  {label}
                </span>
              </div>
              {!isMobile && (
                <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-mute)" }}>
                  {blurb}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Voice ─────────────────────────────────────────────────────────────── */

/**
 * The language claim, demoted to support. It is still the hardest part of the
 * product and the reason the scripts do not read like a press release, but it
 * only means something once the reader knows there is a script at all.
 */
function SoundsLikeYou({ isMobile, pad }) {
  return (
    <section
      style={{
        padding: `${isMobile ? 50 : 84}px ${pad}`,
        borderTop: "1px solid var(--line)",
        background: "#FBFAF9",
      }}
    >
      <div
        style={{
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: "1fr 1.05fr",
          gap: "clamp(36px, 4vw, 76px)",
          alignItems: "center",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: isMobile ? 25 : "clamp(28px, 2.4vw, 44px)",
              fontWeight: 750,
              letterSpacing: "-0.032em",
              lineHeight: 1.12,
              color: "var(--ink)",
              margin: "0 0 14px",
            }}
          >
            It writes the way you actually talk.
          </h2>
          <p style={{ fontSize: isMobile ? 15.5 : "clamp(16px, 1.05vw, 19px)", lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 16px" }}>
            Most tools hand back tidy English no matter what went in. Nobody
            speaks like that on camera, and an audience can hear it in the first
            three seconds.
          </p>
          <p style={{ fontSize: isMobile ? 14.5 : 15.5, lineHeight: 1.65, color: "var(--ink-body)", margin: 0 }}>
            Chomske learns from your own videos instead. Your language stays in
            its own script, the English words you always keep in English stay in
            English, and your opener is your opener. Hindi, Telugu, Tamil,
            Bengali, Marathi, or the mix of two that you actually use.
          </p>
        </div>

        <div style={{ marginTop: isMobile ? 28 : 0 }}>
          <VoiceCard isMobile={isMobile} />
        </div>
      </div>
    </section>
  );
}

function VoiceCard({ isMobile }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 22px 54px -40px rgba(60,40,25,.36)",
      }}
    >
      <div
        style={{
          padding: "11px 16px",
          borderBottom: "1px solid var(--line)",
          background: "#FAFAFA",
          fontSize: 11.5,
          color: "var(--ink-mute)",
        }}
      >
        Your voice · Hindi and English mixed · learned from 5 videos
      </div>
      <div style={{ padding: isMobile ? 18 : 24 }}>
        <p className="indic" style={{ fontSize: isMobile ? 15 : 16.5, color: "var(--ink)", margin: 0 }}>
          तो दोस्तों, आज हम बात करने वाले हैं एक ऐसे <b>AI model</b> के बारे में
          जो पूरी तरह से <b>open source</b> है।
        </p>
        <p className="indic" style={{ fontSize: isMobile ? 15 : 16.5, color: "var(--ink)", margin: "14px 0 0" }}>
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
            lineHeight: 1.65,
          }}
        >
          <b style={{ color: "var(--ink-body)" }}>AI model</b>,{" "}
          <b style={{ color: "var(--ink-body)" }}>open source</b> and{" "}
          <b style={{ color: "var(--ink-body)" }}>test</b> stayed in English,
          because that is how you say them.
        </div>
      </div>
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

/**
 * Title and standfirst, side by side on desktop.
 *
 * Two columns rather than one capped column: the page is meant to use the whole
 * viewport, and a paragraph running the full width of a 27" monitor is
 * unreadable no matter how good the sentence is. Splitting the row solves the
 * line length by giving the width to a second column instead of throwing it
 * away as margin.
 */
function SectionHead({ title, sub, isMobile }) {
  return (
    <div
      style={{
        display: isMobile ? "block" : "grid",
        gridTemplateColumns: "1.1fr 1fr",
        gap: "clamp(30px, 4vw, 76px)",
        alignItems: "end",
      }}
    >
      <h2
        style={{
          fontSize: isMobile ? 25 : "clamp(28px, 2.4vw, 44px)",
          fontWeight: 750,
          letterSpacing: "-0.032em",
          lineHeight: 1.12,
          color: "var(--ink)",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            fontSize: isMobile ? 15 : "clamp(15.5px, 1.02vw, 18.5px)",
            lineHeight: 1.6,
            color: "var(--ink-body)",
            margin: isMobile ? "12px 0 0" : 0,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function Nav({ pad }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `16px ${pad}`,
        borderBottom: "1px solid var(--line)",
        background: "rgba(255,255,255,.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <Logo />
      <a
        href="#how"
        style={{ fontSize: 14, color: "var(--ink-mute)", textDecoration: "none", fontWeight: 500 }}
      >
        How it works
      </a>
    </header>
  );
}

function Eyebrow({ children }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#A64824",
        background: "rgba(255,255,255,.72)",
        border: "1px solid #EFDCCF",
        borderRadius: 999,
        padding: "6px 13px",
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
        width="270"
      />
    </div>
  );
}

function Dot() {
  return <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#DEDEDE" }} />;
}

function ClosingCta({ isMobile, pad, onCredential, busy }) {
  return (
    <section
      style={{
        borderTop: "1px solid var(--line)",
        background: HERO_WASH,
        padding: isMobile ? `56px ${pad}` : `92px clamp(32px, 22vw, 500px)`,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h2
          style={{
            fontSize: isMobile ? 27 : "clamp(30px, 2.7vw, 50px)",
            fontWeight: 800,
            letterSpacing: "-0.038em",
            lineHeight: 1.1,
            color: "var(--ink)",
            margin: "0 0 14px",
          }}
        >
          Tomorrow morning, it is already done.
        </h2>
        <p style={{ fontSize: isMobile ? 15.5 : 17, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 28px" }}>
          Sign in, pick your niche, and see what today looks like when the
          topic is already chosen.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <SignIn onCredential={onCredential} onError={() => {}} busy={busy} />
        </div>
        <div style={{ marginTop: 13, fontSize: 12.5, color: "var(--ink-mute)" }}>
          Free to start. No card required.
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
        background: "var(--card)",
      }}
    >
      <Logo />
      <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
        © {new Date().getFullYear()} Chomske · chomske.com
      </div>
    </footer>
  );
}
