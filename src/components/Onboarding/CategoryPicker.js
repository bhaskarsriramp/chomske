import { useState, useEffect } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import { categoryColor, HERO_WASH } from "../../theme";
import Logo from "../Shell/Logo";

/**
 * First-run category picker.
 *
 * ── WHY THIS BLOCKS THE APP ──────────────────────────────────────────────────
 * It is not a preference screen. The selection decides which sources get polled
 * and which categories the ranker spends money on, so a user who skips it has no
 * feed to look at — the product is empty until this is answered. A dismissible
 * version would let people reach an app that cannot work yet and conclude it is
 * broken. So there is no close control and no route past it; the only way out is
 * to choose, or to sign out.
 *
 * The screen explains WHY it is asking, because a signup form that demands
 * answers without saying what they do is where people leave.
 */
export default function CategoryPicker({ user, onDone, onSignOut }) {
  const isPhone = useIsMobile(680);

  const [cats, setCats] = useState([]);
  const [max, setMax] = useState(3);
  const [picked, setPicked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/auth/categories");
        if (cancelled) return;
        setCats(data.categories || []);
        setMax(data.max || 3);
        // Pre-fill when they're editing rather than onboarding.
        setPicked((user?.categories || []).slice(0, data.max || 3));
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Couldn't load the categories."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  function toggle(id) {
    setError("");
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.length >= max) return p;      // cap enforced here and on the server
      return [...p, id];
    });
  }

  async function submit() {
    if (!picked.length || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/auth/categories", { categories: picked });
      onDone(data.user);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that. Please try again."));
      setSaving(false);
    }
  }

  const full = picked.length >= max;
  const gut = isPhone ? "20px" : "clamp(32px, 6vw, 120px)";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        // The one screen in the app that gets the marketing ground. It is the
        // first thing a new account sees after the landing page, and dropping
        // straight to flat grey here reads as though the product ended.
        //
        // The wash is on this fixed layer, not on the scroller inside it. A
        // radial gradient on a scrolling box is sized to the whole scroll
        // height, so on a phone the eight cards stretch it into visible bands
        // that then slide past as you scroll.
        background: HERO_WASH,
      }}
    >
    <div
      className="hg-scroll"
      style={{
        position: "absolute", inset: 0,
        padding: `${isPhone ? 30 : 56}px ${gut} ${isPhone ? 120 : 140}px`,
      }}
    >
      <div style={{ marginBottom: isPhone ? 26 : 38 }}>
        <Logo size={28} fontSize={16} />
      </div>

      <h1
        style={{
          fontSize: isPhone ? 27 : "clamp(34px, 3.4vw, 54px)",
          fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.1,
          color: "var(--ink)", margin: "0 0 14px",
        }}
      >
        What do you make videos about?
      </h1>

      <p
        style={{
          fontSize: isPhone ? 15 : "clamp(16px, 1.1vw, 20px)",
          lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 8px",
        }}
      >
        Pick up to {max}. We watch the news in those areas around the clock and every
        morning show you what is worth covering, ranked, with every source that carried it.
      </p>
      <p style={{ fontSize: isPhone ? 13.5 : 14.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 0 26px" }}>
        We only pull stories from what you choose, so nothing else clutters your feed.
        You can change this any time from Profile.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 18,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonGrid isPhone={isPhone} />
      ) : (
        <div
          role="group"
          aria-label="Categories"
          style={{
            display: "grid", gap: isPhone ? 11 : 14,
            gridTemplateColumns: isPhone ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {cats.map((c) => {
            const on = picked.includes(c.id);
            // Greyed rather than removed once the cap is hit: hiding options would
            // make the screen change shape under the cursor mid-decision.
            const blocked = !on && full;
            // Each category owns a hue from here on. Meeting it at the moment of
            // choosing is what makes the same colour legible later on a feed row.
            const col = categoryColor(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                disabled={blocked}
                className={on || blocked ? undefined : "hg-pick"}
                style={{
                  position: "relative", textAlign: "left",
                  padding: isPhone ? "16px 16px" : "19px 18px",
                  borderRadius: 14, cursor: blocked ? "not-allowed" : "pointer",
                  background: on
                    ? col.tint
                    : `linear-gradient(168deg, ${col.tint} 0%, var(--card) 66%)`,
                  border: `1.5px solid ${on ? col.solid : col.line}`,
                  opacity: blocked ? 0.42 : 1,
                  transition: "border-color .13s ease, background .13s ease, opacity .13s ease",
                }}
              >
                <span
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 10, marginBottom: 6,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{ width: 8, height: 8, borderRadius: "50%", background: col.solid, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: isPhone ? 15.5 : 16.5, fontWeight: 650, color: "var(--ink)", letterSpacing: "-0.015em" }}>
                      {c.label}
                    </span>
                  </span>
                  <Check on={on} color={col.solid} />
                </span>
                <span style={{ display: "block", fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-body)" }}>
                  {c.blurb}
                </span>
              </button>
            );
          })}
        </div>
      )}

      </div>

      {/* Pinned so the action is reachable without scrolling back, on a phone
          where eight cards is well past one screen. Outside the scroller: a
          fixed bar inside a scrolling box is a bar that fights the scrollbar. */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 101,
          background: "var(--card)", borderTop: "1px solid var(--line)",
          padding: `${isPhone ? 13 : 16}px ${gut}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 14, flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
            {picked.length === 0
              ? "Choose at least one"
              : `${picked.length} of ${max} selected`}
          </div>
          <button
            onClick={onSignOut}
            style={{
              marginTop: 2, padding: 0, border: "none", background: "transparent",
              fontSize: 12, color: "var(--ink-mute)", cursor: "pointer", textDecoration: "underline",
            }}
          >
            Not you? Sign out
          </button>
        </div>

        <button
          onClick={submit}
          disabled={!picked.length || saving}
          className={!picked.length || saving ? undefined : "hg-btn-primary"}
          style={{
            fontSize: 15, fontWeight: 600, padding: "13px 28px", borderRadius: 11,
            border: "none", flexShrink: 0,
            background: !picked.length || saving ? "#E5E5E5" : "var(--primary)",
            color: !picked.length || saving ? "var(--ink-mute)" : "#fff",
            cursor: !picked.length || saving ? "default" : "pointer",
          }}
        >
          {saving ? "Setting up…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function Check({ on, color = "var(--ink)" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0, width: 21, height: 21, borderRadius: "50%",
        display: "grid", placeItems: "center",
        background: on ? color : "transparent",
        border: `1.5px solid ${on ? color : "#D9D9D9"}`,
        transition: "background .13s ease, border-color .13s ease",
      }}
    >
      {on && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5l5.5 5.5L20 6.5" />
        </svg>
      )}
    </span>
  );
}

function SkeletonGrid({ isPhone }) {
  return (
    <div
      style={{
        display: "grid", gap: isPhone ? 11 : 14,
        gridTemplateColumns: isPhone ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))",
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="hg-skel" style={{ height: 92, borderRadius: 12 }} />
      ))}
    </div>
  );
}
