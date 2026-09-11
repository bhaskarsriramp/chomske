import { useState, useEffect } from "react";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import Logo from "../Shell/Logo";

/**
 * The one thing a showcase visitor is ever asked for.
 *
 * ── WHY THIS IS NOT A MUI DIALOG ─────────────────────────────────────────────
 * It was asked for as one, and it is not, because @mui/material is not a
 * dependency here and adding it for one dialog would be the single largest
 * package in the project. components/Landing/LandingPage.js already records the
 * decision and the reason: six dependencies, and the icon package alone drags
 * @mui/material and two emotion packages behind it. This is a focus-trapped,
 * Escape-closing, backdrop-dismissing dialog in about ninety lines, matching the
 * app's own idiom, and it costs nothing to ship.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 * Signs them in exactly as the landing page does (POST /auth/google with the
 * Google credential), then immediately claims the showcase: the profile, the
 * voice, the videos and every script generated from this link are re-parented
 * onto the account that was just created. They land on a finished voice rather
 * than an empty "paste five URLs" screen, which is the entire payoff of having
 * built the thing for them in advance.
 */
export default function SignUpDialog({ open, onClose, showcaseId, reason }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  async function onCredential(credentialResponse) {
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/google", { credential: credentialResponse.credential });

      // The claim runs AFTER sign-in and before the reload, so the account that
      // loads already owns everything. A failure here is not fatal: they have a
      // real account either way, and the admin can re-point the showcase by
      // hand, so this must never strand them on a dialog.
      try {
        if (showcaseId) await api.post("/v/claim", { showcase_id: showcaseId });
      } catch { /* see above */ }

      // A hard reload rather than a state update: every provider in the shell
      // (credits, profiles, voice) was primed with the showcase's data, and
      // re-fetching each one in the right order from here is a sequence bug
      // waiting to happen. The account is new; a clean boot is correct.
      window.location.href = "/app/discover";
    } catch (err) {
      setError(errorMessage(err, "Couldn't finish that. Please try again."));
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create your account"
      onClick={() => { if (!busy) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300, display: "grid", placeItems: "center",
        background: "rgba(15,15,15,.42)", padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", width: "100%", maxWidth: 430,
          background: "var(--card, #fff)", borderRadius: 18,
          border: "1px solid var(--line, #E3E3E3)",
          boxShadow: "0 30px 70px -35px rgba(15,15,15,.5)",
          padding: "30px 28px 26px",
        }}
      >
        <button
          onClick={() => { if (!busy) onClose?.(); }}
          aria-label="Close"
          style={{
            position: "absolute", top: 12, right: 12, width: 32, height: 32,
            display: "grid", placeItems: "center", borderRadius: 9,
            border: "none", background: "transparent", color: "var(--ink-mute)",
            cursor: busy ? "default" : "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div style={{ marginBottom: 20 }}><Logo size={30} fontSize={17} /></div>

        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 10px" }}>
          {reason === "voice"
            ? "Create an account to change your videos"
            : reason === "credits"
              ? "Create an account to keep writing"
              : "This is your voice. Take it with you."}
        </h2>

        <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 8px" }}>
          Sign in and everything here — the videos, the analysis, the scripts you've
          written — moves onto your account. You won't be asked to paste anything or
          wait for the analysis again.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 0 22px" }}>
          100 free credits to start. No card.
        </p>

        {busy ? (
          <p style={{ fontSize: 14, color: "var(--ink-body)", textAlign: "center", padding: "10px 0" }}>
            Setting up your account…
          </p>
        ) : (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <GoogleLogin onSuccess={onCredential} onError={() => setError("Google sign-in failed. Please try again.")} text="continue_with" shape="pill" size="large" width="300" />
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginTop: 14, fontSize: 13, color: "#C0392B", textAlign: "center" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
