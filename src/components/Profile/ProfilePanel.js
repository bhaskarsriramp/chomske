import { useState } from "react";
import useIsMobile from "../../hooks/useIsMobile";

/**
 * Profile — the connected account, and the way out.
 *
 * Deliberately thin. There is nothing to configure here yet, and inventing
 * settings to fill a page gives people switches that do nothing.
 */
export default function ProfilePanel({ user, onSignOut }) {
  const isPhone = useIsMobile(680);
  const [confirming, setConfirming] = useState(false);

  const gut = isPhone ? 16 : 30;

  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0, width: "100%", padding: `${isPhone ? 18 : 28}px ${gut}px 60px` }}>
      <h1 style={{ fontSize: isPhone ? 21 : 25, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 5px" }}>
        Profile
      </h1>
      <p style={{ fontSize: 14, color: "var(--ink-body)", margin: "0 0 24px" }}>
        The account this workspace belongs to.
      </p>

      <section
        style={{
          padding: isPhone ? 18 : 22, borderRadius: "var(--radius)",
          background: "var(--card)", border: "1px solid var(--line)",
        }}
      >
        <div
          style={{
            fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
            textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 14,
          }}
        >
          Connected account
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          {user?.picture ? (
            <img
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
              style={{ width: 46, height: 46, borderRadius: "50%", border: "1px solid var(--line)", flexShrink: 0 }}
            />
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                background: "#F2EFE9", border: "1px solid var(--line)",
                display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700, color: "var(--ink-mute)",
              }}
            >
              {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </span>
          )}

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 650, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              {user?.name || "Signed in"}
            </div>
            <div
              style={{
                fontSize: 13.5, color: "var(--ink-body)", marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {user?.email}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 15,
            borderTop: "1px solid var(--line)",
          }}
        >
          <GoogleMark />
          <span style={{ fontSize: 13, color: "var(--ink-mute)" }}>
            Signed in with Google. There is no password to manage.
          </span>
        </div>
      </section>

      <section
        style={{
          marginTop: 16, padding: isPhone ? 18 : 22, borderRadius: "var(--radius)",
          background: "var(--card)", border: "1px solid var(--line)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 5 }}>
          Sign out
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 14px" }}>
          Your videos, voice profile and scripts stay where they are. Signing back in
          with the same Google account brings everything back.
        </p>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="hg-btn-ghost"
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer",
            }}
          >
            Sign out
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={onSignOut}
              style={{
                fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
                border: "1px solid var(--bad)", background: "var(--bad)", color: "#fff",
                cursor: "pointer",
              }}
            >
              Yes, sign out
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="hg-btn-ghost"
              style={{
                fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
                border: "1px solid var(--line)", background: "var(--card)",
                color: "var(--ink-body)", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7C21.8 18.9 23 15.9 23 12.3z" />
      <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21 7.6 23.5 12 23.5z" />
      <path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4l3.8-3z" />
      <path fill="#EA4335" d="M12 5.1c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.6 15.1.5 12 .5 7.6.5 3.7 3 1.8 6.8l3.8 3c.9-2.7 3.4-4.7 6.4-4.7z" />
    </svg>
  );
}
