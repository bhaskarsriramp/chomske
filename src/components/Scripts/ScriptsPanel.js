import { useState, useEffect, useCallback } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Skeleton, { SkeletonText } from "../Shell/Skeleton";
import { timeAgo, sourceLabel } from "../News/newsUtils";
import { categoryColor, cardBackground } from "../../theme";
import { useProfiles } from "../../state/ProfileContext";

/**
 * My scripts — everything this creator has written, and what it was written from.
 *
 * ── WHY THE TOPIC TRAVELS WITH THE SCRIPT ────────────────────────────────────
 * A script read back three days later is a page of text with no way to check it.
 * The product's whole promise is "these are the facts, here is where they came
 * from, check the numbers before you say them out loud" — and that promise has
 * to survive being read later, not just at the moment of generation. So every
 * script carries its story's brief and every source link, permanently.
 *
 * Split panes on a wide screen for the same reason Topics uses them: choosing
 * which of nine scripts to record today means comparing them, and a list that
 * replaces itself with a detail view forces that comparison through memory.
 */
export default function ScriptsPanel({ onGoTopics }) {
  const isPhone = useIsMobile(680);
  const isNarrow = useIsMobile(1100);

  const { profiles, active, activeId } = useProfiles();

  const [scripts, setScripts] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  // ── THIS IS A SCOPE TOGGLE, NOT A PROFILE PICKER ──────────────────────────
  // Which channel you are working in is decided once, in the app bar at the top
  // of every screen. A second dropdown here that could point somewhere else
  // would let the bar say "Tech channel" while the list showed sports — two
  // controls for one idea, and one of them wrong.
  //
  // So the list follows the bar, and the only extra choice is whether to widen
  // to everything ever written. That is a genuinely different question ("what
  // have I made" vs "what have I made for this channel") and worth one toggle.
  const [allProfiles, setAllProfiles] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get("/script", {
        params: { limit: 30, ...(!allProfiles && activeId ? { profile: activeId } : {}) },
      });
      setScripts(data.scripts || []);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your scripts."));
      setScripts([]);
    } finally {
      setBusy(false);
      setLoadedOnce(true);
    }
  }, [allProfiles, activeId]);

  useEffect(() => { load(); }, [load]);

  // Changing the scope changes the list under the open script. Clearing the
  // selection stops the right pane showing a script that is no longer in the
  // list beside it.
  useEffect(() => { setOpenId(null); }, [allProfiles, activeId]);

  // The right pane is always on screen at this width, so leaving it empty wastes
  // half the view.
  useEffect(() => {
    if (isNarrow || !scripts.length) return;
    if (openId && scripts.some((s) => s.id === openId)) return;
    setOpenId(scripts[0].id);
  }, [scripts, isNarrow, openId]);

  const selected = scripts.find((s) => s.id === openId) || null;
  const gut = isPhone ? 16 : 26;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, width: "100%" }}>
      <section
        style={{
          display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0,
          flex: isNarrow ? "1 1 100%" : "0 0 clamp(400px, 36%, 660px)",
          borderRight: isNarrow ? "none" : "1px solid var(--line)",
          background: "var(--paper)",
        }}
      >
        <div style={{ padding: `${isPhone ? 16 : 20}px ${gut}px 12px`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1
              style={{
                fontSize: isPhone ? 20 : 23, fontWeight: 750, letterSpacing: "-0.03em",
                color: "var(--ink)", margin: "0 0 4px",
              }}
            >
              My scripts
            </h1>
            {/* Only offered once there is more than one channel to widen to. */}
            {profiles.length > 1 && (
              <div
                role="group"
                aria-label="Scope"
                style={{
                  display: "inline-flex", padding: 3, gap: 2, flexShrink: 0,
                  background: "#F2F2F2", border: "1px solid var(--line)", borderRadius: 10,
                }}
              >
                {[
                  { on: !allProfiles, label: "This channel", set: false },
                  { on: allProfiles, label: "All", set: true },
                ].map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setAllProfiles(t.set)}
                    aria-pressed={t.on}
                    style={{
                      fontSize: 12.5, fontWeight: t.on ? 600 : 500, padding: "6px 11px",
                      borderRadius: 8, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                      background: t.on ? "var(--card)" : "transparent",
                      color: t.on ? "var(--ink)" : "var(--ink-mute)",
                      boxShadow: t.on ? "0 1px 2px rgba(15,15,15,.09)" : "none",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-body)", margin: 0, lineHeight: 1.6 }}>
            {/* Deliberately not rendered until the count is known — see Skeleton.js.
                "0 scripts" shown for half a second is a claim, and a wrong one. */}
            {loadedOnce
              ? scripts.length
                ? `${scripts.length} written in your voice, newest first.`
                : !allProfiles && active?.name
                ? `Nothing written for ${active.name} yet.`
                : "Nothing written yet."
              : <Skeleton variant="text" width={230} height={11} />}
          </p>
        </div>

        <div
          className="hg-scroll"
          style={{ flex: 1, minHeight: 0, padding: `0 ${gut}px ${isPhone ? 28 : 34}px` }}
        >
          {error && (
            <div
              role="alert"
              style={{
                padding: "12px 14px", borderRadius: 10, marginBottom: 12,
                background: "#FCE8E6", border: "1px solid #F5C7C3",
                color: "var(--bad)", fontSize: 13.5, lineHeight: 1.55,
              }}
            >
              {error}
            </div>
          )}

          {!loadedOnce && busy && <ListSkeleton />}

          {loadedOnce && !scripts.length && !error && <EmptyState onGoTopics={onGoTopics} />}

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {scripts.map((s, i) => (
              <ScriptRow
                key={s.id}
                script={s}
                index={i}
                isPhone={isPhone}
                active={!isNarrow && s.id === openId}
                onOpen={() => setOpenId(s.id)}
              />
            ))}
          </div>
        </div>
      </section>

      {!isNarrow && (
        <section
          style={{
            flex: "1 1 0", minWidth: 0, minHeight: 0,
            display: "flex", flexDirection: "column", background: "var(--card)",
          }}
        >
          {!loadedOnce ? (
            <div style={{ padding: 30 }}><DetailSkeleton /></div>
          ) : selected ? (
            <ScriptDetail key={selected.id} script={selected} />
          ) : (
            <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 40 }}>
              <p style={{ fontSize: 13.5, color: "var(--ink-mute)", margin: 0 }}>
                Pick a script to read it.
              </p>
            </div>
          )}
        </section>
      )}

      {isNarrow && selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selected.headline}
          className="hg-sheet-up"
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "var(--card)", display: "flex", flexDirection: "column",
          }}
        >
          <ScriptDetail key={selected.id} script={selected} onClose={() => setOpenId(null)} compact />
        </div>
      )}
    </div>
  );
}

/* ── List ──────────────────────────────────────────────────────────────── */

function ScriptRow({ script, index, isPhone, active, onOpen }) {
  const col = categoryColor(script.topic?.category);

  return (
    <button
      onClick={onOpen}
      className={active ? undefined : "hg-row"}
      style={{
        textAlign: "left", width: "100%", cursor: "pointer", display: "block",
        padding: isPhone ? "12px 13px" : "13px 15px",
        background: cardBackground(index, active),
        border: "1px solid rgba(0,0,0,.07)",
        borderRadius: 10,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
        {script.topic?.category_label && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: col.solid }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.055em", textTransform: "uppercase", color: col.ink }}>
              {script.topic.category_label}
            </span>
          </span>
        )}
        <StatusMark status={script.status} />
      </span>

      <span
        style={{
          display: "block", fontSize: isPhone ? 14.5 : 15, fontWeight: 600,
          lineHeight: 1.38, letterSpacing: "-0.008em", color: "var(--ink)",
        }}
      >
        {script.headline || "Untitled"}
      </span>

      {script.hook && script.status === "done" && (
        <span
          className="indic"
          style={{
            marginTop: 5, fontSize: 13, lineHeight: 1.55, color: "var(--ink-mute)",
            display: "-webkit-box", overflow: "hidden",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}
        >
          {script.hook}
        </span>
      )}

      <span
        style={{
          display: "block", marginTop: 7, fontSize: 11.5, color: "#8A8A8A",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {[
          timeAgo(script.created_at),
          // The voice it was written in, as it was CALLED at the time — the name
          // is copied onto the script, so renaming a voice never rewrites the
          // history of what was already made in it.
          script.profile_name,
          script.language_label,
          script.sources?.length ? `${script.sources.length} source${script.sources.length === 1 ? "" : "s"}` : null,
        ].filter(Boolean).join("  ·  ")}
      </span>
    </button>
  );
}

function StatusMark({ status }) {
  if (status === "done") return null;   // the normal case needs no label
  const s =
    status === "processing"
      ? { label: "Writing", color: "var(--made)" }
      : { label: "Failed", color: "var(--bad)" };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.055em", textTransform: "uppercase", color: s.color }}>
      {s.label}
    </span>
  );
}

/* ── Detail ────────────────────────────────────────────────────────────── */

function ScriptDetail({ script, onClose, compact }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!script.text) return;
    navigator.clipboard.writeText(script.text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {}
    );
  }

  return (
    <>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: compact ? "13px 18px" : "15px 26px",
          borderBottom: "1px solid var(--line)", background: "var(--card)", flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12.5, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[script.language_label, timeAgo(script.created_at)].filter(Boolean).join("  ·  ")}
          {script.voice_confidence === "thin" && "  ·  learned from one video"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {script.status === "done" && (
            <button
              onClick={copy}
              className="hg-btn-ghost"
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 9,
                border: "1px solid var(--line)", background: "var(--card)",
                color: copied ? "var(--ok)" : "var(--ink-body)", cursor: "pointer",
              }}
            >
              {copied ? "Copied" : "Copy script"}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="hg-btn-ghost"
              style={{
                fontSize: 17, lineHeight: 1, padding: "6px 11px", borderRadius: 9,
                border: "1px solid var(--line)", background: "var(--card)",
                color: "var(--ink-mute)", cursor: "pointer",
              }}
            >
              ×
            </button>
          )}
        </div>
      </header>

      <div
        className="hg-scroll"
        style={{ flex: 1, minHeight: 0, padding: compact ? "22px 18px 60px" : "28px 26px 70px" }}
      >
        <h2
          style={{
            fontSize: compact ? 20 : 25, fontWeight: 700, lineHeight: 1.24,
            letterSpacing: "-0.022em", color: "var(--ink)", margin: "0 0 12px",
          }}
        >
          {script.headline || "Untitled"}
        </h2>

        {/* The topic, kept with the script so the facts stay checkable later. */}
        {script.topic?.brief && (
          <p style={{ fontSize: compact ? 14.5 : 15, lineHeight: 1.7, color: "var(--ink-body)", margin: "0 0 22px" }}>
            {script.topic.brief}
          </p>
        )}

        {script.status === "failed" && (
          <div
            style={{
              padding: 16, borderRadius: 12, marginBottom: 20,
              background: "#FCE8E6", border: "1px solid #F5C7C3",
            }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--bad)", marginBottom: 5 }}>
              This one didn't get written
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>
              {script.error || "Something went wrong."}
            </div>
          </div>
        )}

        {script.status === "processing" && (
          <div style={{ marginBottom: 20 }}>
            <SkeletonText lines={5} />
          </div>
        )}

        {script.status === "done" && (
          <div
            style={{
              background: "var(--card)", border: "1px solid var(--made-line)",
              borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 22,
            }}
          >
            <div
              style={{
                padding: "9px 15px", borderBottom: "1px solid var(--made-line)",
                background: "var(--made-tint)", fontSize: 11,
                fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                color: "var(--ink-mute)",
              }}
            >
              Your script
            </div>
            <div
              className="indic"
              style={{
                padding: compact ? 17 : 22,
                fontSize: compact ? 15.5 : 16.5,
                color: "var(--ink)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {script.text}
            </div>
          </div>
        )}

        {script.title_suggestions?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Title ideas</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {script.title_suggestions.map((t, i) => (
                <div
                  key={i}
                  className="indic"
                  style={{
                    fontSize: 14, lineHeight: 1.5, color: "var(--ink-body)",
                    padding: "9px 12px", borderRadius: 9,
                    background: "var(--card)", border: "1px solid var(--line)",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>
        )}

        {script.sources?.length > 0 && (
          <div>
            <SectionLabel>Written from · {script.sources.length}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {script.sources.map((c, i) => (
                <a
                  key={`${c.url}-${i}`}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hg-row"
                  style={{
                    display: "block", padding: "12px 14px", borderRadius: 10,
                    border: "1px solid var(--line)", background: "var(--card)", textDecoration: "none",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
                    {c.source ? sourceLabel(c.source) : hostOf(c.url)}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-body)" }}>
                    {c.title || c.url}
                  </div>
                </a>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: "12px 0 0", lineHeight: 1.6 }}>
              Every fact in the script came from these. Check any number before you say it.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
        textTransform: "uppercase", color: "var(--ink-mute)",
        margin: "0 0 11px", paddingBottom: 9, borderBottom: "1px solid var(--line)",
      }}
    >
      {children}
    </div>
  );
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/* ── Loading and empty ─────────────────────────────────────────────────── */

function ListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{ padding: 13, borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)" }}
        >
          <Skeleton variant="text" width={94} height={9} />
          <div style={{ height: 8 }} />
          <Skeleton variant="text" width="88%" height={13} />
          <div style={{ height: 8 }} />
          <Skeleton variant="text" width="55%" height={10} />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton variant="text" width="70%" height={24} />
      <div style={{ height: 16 }} />
      <SkeletonText lines={4} />
      <div style={{ height: 26 }} />
      <Skeleton variant="rectangular" height={220} />
    </div>
  );
}

function EmptyState({ onGoTopics }) {
  return (
    <div
      style={{
        padding: "30px 24px", textAlign: "center",
        background: "var(--card)", border: "1px dashed var(--line)", borderRadius: "var(--radius)",
      }}
    >
      <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)", marginBottom: 7 }}>
        No scripts yet
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 16px" }}>
        Open a story under Topics, read what happened, and write it in your voice.
        Everything you generate is kept here with its sources.
      </p>
      <button
        onClick={onGoTopics}
        className="hg-btn-primary"
        style={{
          fontSize: 13.5, fontWeight: 600, padding: "10px 18px", borderRadius: 10,
          border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer",
        }}
      >
        Go to Topics
      </button>
    </div>
  );
}
