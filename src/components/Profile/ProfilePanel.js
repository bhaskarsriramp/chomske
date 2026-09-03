import { useState, useEffect, useCallback } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";

/**
 * Profile — the connected account, and the way out.
 *
 * Deliberately thin. There is nothing to configure here yet, and inventing
 * settings to fill a page gives people switches that do nothing.
 */
export default function ProfilePanel({ user, onSignOut, onUserChange }) {
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

      <CategoriesSection user={user} onUserChange={onUserChange} isPhone={isPhone} />

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

/**
 * Change what you cover.
 *
 * Saves only on an explicit button rather than on each toggle: every change here
 * alters which categories the collector polls, and a half-finished selection
 * being written on the way to the intended one would start and stop paid work
 * for a category the user never meant to have.
 */
function CategoriesSection({ user, onUserChange, isPhone }) {
  const [cats, setCats] = useState([]);
  const [max, setMax] = useState(3);
  const [picked, setPicked] = useState(user?.categories || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/categories")
      .then(({ data }) => {
        if (cancelled) return;
        setCats(data.categories || []);
        setMax(data.max || 3);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setPicked(user?.categories || []); }, [user]);

  const toggle = useCallback((id) => {
    setError("");
    setSaved(false);
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.length >= max) return p;
      return [...p, id];
    });
  }, [max]);

  const current = user?.categories || [];
  const dirty =
    picked.length !== current.length || picked.some((id) => !current.includes(id));

  async function save() {
    if (!picked.length || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/auth/categories", { categories: picked });
      onUserChange?.(data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  }

  if (!cats.length) return null;

  return (
    <section
      style={{
        marginTop: 16, padding: isPhone ? 18 : 22, borderRadius: "var(--radius)",
        background: "var(--card)", border: "1px solid var(--line)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 5 }}>
        What you cover
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 15px" }}>
        Up to {max}. Changing this changes which stories appear under Topics.
        New categories take a few minutes to fill up.
      </p>

      <div
        style={{
          display: "grid", gap: 9,
          gridTemplateColumns: isPhone ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {cats.map((c) => {
          const on = picked.includes(c.id);
          const blocked = !on && picked.length >= max;
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              disabled={blocked}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 11,
                cursor: blocked ? "not-allowed" : "pointer",
                background: on ? "var(--accent-soft)" : "var(--card)",
                border: `1.5px solid ${on ? "var(--accent)" : "var(--line)"}`,
                opacity: blocked ? 0.45 : 1,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{c.label}</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--ink-mute)", marginTop: 3, lineHeight: 1.5 }}>
                {c.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ marginTop: 12, fontSize: 13.5, color: "var(--bad)" }} role="alert">{error}</div>
      )}

      <div style={{ marginTop: 15, display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={!dirty || !picked.length || saving}
          className={!dirty || !picked.length || saving ? undefined : "hg-btn-primary"}
          style={{
            fontSize: 13.5, fontWeight: 600, padding: "10px 18px", borderRadius: 10, border: "none",
            background: !dirty || !picked.length || saving ? "#E9E4DB" : "var(--accent)",
            color: !dirty || !picked.length || saving ? "var(--ink-mute)" : "#fff",
            cursor: !dirty || !picked.length || saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <span style={{ fontSize: 12.5, color: saved ? "var(--ok)" : "var(--ink-mute)" }}>
          {saved ? "Saved" : `${picked.length} of ${max} selected`}
        </span>
      </div>
    </section>
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
