import { useState, useEffect, useCallback } from "react";
import api, { errorMessage } from "../../api";
import { categoryColor } from "../../theme";
import Skeleton from "../Shell/Skeleton";
import { useProfiles } from "../../state/ProfileContext";

/**
 * Your channel: what the account covers, and the state of its voice.
 *
 * One channel per account (see state/ProfileContext.js). It owns the categories
 * the feed is drawn from, the one voice, that voice's videos, and the scripts
 * written in it.
 *
 * ── WHY THIS IS STILL A CARD, NOT A SETTINGS FORM ───────────────────────────
 * A form would show the name and the categories, which are the two things a
 * creator already knows. The card shows what they cannot see anywhere else:
 * how many videos are held, whether the voice has been analysed, whether it has
 * gone stale. That is the reason to open this screen at all.
 */
export default function ProfilesSection({ isPhone, onGoVoice }) {
  const { profiles, activeId, refresh, loading } = useProfiles();

  const [cats, setCats] = useState([]);
  const [maxCats, setMaxCats] = useState(3);
  const [editing, setEditing] = useState(null);     // profile id being edited
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/categories")
      .then(({ data }) => {
        if (cancelled) return;
        setCats(data.categories || []);
        setMaxCats(data.max || 3);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (id, patch) => {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/profiles/${id}`, patch);
      await refresh();
      setEditing(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that."));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  async function doDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/profiles/${confirmDelete.id}`);
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete that profile."));
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !profiles.length) {
    return (
      <Card isPhone={isPhone}>
        <Skeleton variant="text" width={120} height={14} />
        <div style={{ height: 12 }} />
        <Skeleton variant="rectangular" height={92} />
      </Card>
    );
  }

  return (
    <Card isPhone={isPhone}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 5 }}>
            Your channel
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)", margin: 0 }}>
            What it covers decides the topics you are shown. Its voice decides how
            every script is written.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 12, fontSize: 13.5, color: "var(--bad)", lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {profiles.map((p) => (
          <ProfileCard
            key={p.id}
            profile={p}
            active={p.id === activeId}
            isPhone={isPhone}
            cats={cats}
            maxCats={maxCats}
            editing={editing === p.id}
            busy={busy}
            canDelete={profiles.length > 1}
            onEdit={() => { setEditing(p.id); setError(""); }}
            onCancelEdit={() => setEditing(null)}
            onSave={(patch) => save(p.id, patch)}
            onDelete={() => setConfirmDelete(p)}
            onGoVoice={onGoVoice}
          />
        ))}
      </div>

      {confirmDelete && (
        <DeleteDialog
          profile={confirmDelete}
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={doDelete}
        />
      )}
    </Card>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function Card({ isPhone, children }) {
  return (
    <section
      style={{
        marginTop: 16, padding: isPhone ? 18 : 22, borderRadius: "var(--radius)",
        background: "var(--card)", border: "1px solid var(--line)",
      }}
    >
      {children}
    </section>
  );
}

function ProfileCard({
  profile: p, active, isPhone, cats, maxCats, editing, busy, canDelete,
  onEdit, onCancelEdit, onSave, onDelete, onGoVoice,
}) {
  const [name, setName] = useState(p.name);
  const [picked, setPicked] = useState(p.categories || []);

  // Reset the draft whenever the edit opens, so cancelling and reopening does
  // not resurrect a half-finished change from three minutes ago.
  useEffect(() => {
    if (editing) { setName(p.name); setPicked(p.categories || []); }
  }, [editing, p.name, p.categories]);

  function toggle(id) {
    setPicked((v) => {
      if (v.includes(id)) return v.filter((x) => x !== id);
      if (v.length >= maxCats) return v;
      return [...v, id];
    });
  }

  const dirty =
    name.trim() !== p.name ||
    picked.length !== (p.categories || []).length ||
    picked.some((c) => !(p.categories || []).includes(c));

  return (
    <div
      style={{
        borderRadius: 12, padding: isPhone ? 14 : 16,
        border: `1.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
        background: active ? "linear-gradient(170deg, var(--made-tint) 0%, var(--card) 62%)" : "var(--card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.015em" }}>
              {p.name}
            </span>
            {active && (
              <span
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: ".06em", padding: "3px 8px",
                  borderRadius: 999, background: "var(--ink)", color: "#fff",
                }}
              >
                IN USE
              </span>
            )}
          </div>

          {/* Its actual condition, not a description of it: what it watches, how
              many videos teach its voice, and whether that voice exists yet. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
            {(p.category_labels || []).map((label, i) => {
              const col = categoryColor(p.categories?.[i]);
              return (
                <span
                  key={label}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                    background: col.tint, color: col.ink, border: `1px solid ${col.line}`,
                  }}
                >
                  <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: col.solid }} />
                  {label}
                </span>
              );
            })}
          </div>

          <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 9, lineHeight: 1.55 }}>
            {p.videos.used} of {p.videos.max} videos ·{" "}
            {p.voice.built ? (
              <>
                voice ready{p.voice.language_label ? ` · ${p.voice.language_label}` : ""}
                {p.voice.stale && " · needs re-analysing"}
              </>
            ) : p.videos.ready > 0 ? (
              <button
                onClick={() => onGoVoice?.()}
                style={{
                  border: "none", background: "none", padding: 0, cursor: "pointer",
                  font: "inherit", color: "var(--made)", fontWeight: 600,
                  textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                ready to analyse
              </button>
            ) : (
              <button
                onClick={() => onGoVoice?.()}
                style={{
                  border: "none", background: "none", padding: 0, cursor: "pointer",
                  font: "inherit", color: "var(--ink-mute)", fontWeight: 600,
                  textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                no voice yet, add a video
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 7, flexShrink: 0, flexWrap: "wrap" }}>
          <button
            onClick={editing ? onCancelEdit : onEdit}
            className="hg-btn-ghost"
            style={{
              fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 9,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer",
            }}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            aria-label="Profile name"
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 14.5, padding: "10px 12px",
              border: "1px solid var(--line)", borderRadius: 10, marginBottom: 12,
              background: "var(--card)", color: "var(--ink)", outline: "none", fontFamily: "inherit",
            }}
          />

          <div style={{ display: "grid", gap: 7, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {cats.map((c) => {
              const on = picked.includes(c.id);
              const blocked = !on && picked.length >= maxCats;
              const col = categoryColor(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  aria-pressed={on}
                  disabled={blocked}
                  className={on || blocked ? undefined : "hg-pick"}
                  style={{
                    textAlign: "left", padding: "9px 11px", borderRadius: 9,
                    cursor: blocked ? "not-allowed" : "pointer",
                    background: on ? col.tint : "var(--card)",
                    border: `1.5px solid ${on ? col.solid : "var(--line)"}`,
                    opacity: blocked ? 0.42 : 1,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span
                      aria-hidden="true"
                      style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: on ? col.solid : "#CFCFCF" }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{c.label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 13, flexWrap: "wrap" }}>
            <button
              onClick={() => onSave({ name: name.trim(), categories: picked })}
              disabled={!dirty || !name.trim() || !picked.length || busy}
              className={!dirty || !name.trim() || !picked.length || busy ? undefined : "hg-btn-primary"}
              style={{
                fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9, border: "none",
                background: !dirty || !name.trim() || !picked.length || busy ? "#E5E5E5" : "var(--primary)",
                color: !dirty || !name.trim() || !picked.length || busy ? "var(--ink-mute)" : "#fff",
                cursor: !dirty || !name.trim() || !picked.length || busy ? "default" : "pointer",
              }}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>

            <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
              {picked.length} of {maxCats} categories
            </span>

            {canDelete && (
              <button
                onClick={onDelete}
                style={{
                  marginLeft: "auto", border: "none", background: "none", padding: 0,
                  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", color: "var(--bad)",
                  cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                Delete this profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteDialog({ profile, busy, onCancel, onConfirm }) {
  return (
    <>
      <div
        onClick={busy ? undefined : onCancel}
        className="hg-fade"
        style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,.45)", zIndex: 100 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete profile"
        className="hg-dialog-in"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 101, width: "min(440px, calc(100vw - 32px))",
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", padding: 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.5)",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em" }}>
          Delete “{profile.name}”?
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 6px" }}>
          Its {profile.videos.used} video{profile.videos.used === 1 ? "" : "s"} and the voice
          learned from them go with it.
        </p>
        {/* Said plainly, because it is the question someone actually has before
            they press this. */}
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-mute)", margin: "0 0 18px" }}>
          Scripts you wrote for this channel are{" "}
          <strong style={{ color: "var(--ink)" }}>kept</strong>. They stay in My scripts
          under the name they were written for.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            className="hg-btn-ghost"
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: busy ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--bad)", background: "var(--bad)", color: "#fff",
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Deleting…" : "Delete profile"}
          </button>
        </div>
      </div>
    </>
  );
}
