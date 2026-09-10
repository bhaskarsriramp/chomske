import { useState, useEffect, useCallback } from "react";
import api, { errorMessage } from "../../api";

/**
 * The showcase workbench.
 *
 * ── WHAT AN ADMIN ACTUALLY DOES HERE ─────────────────────────────────────────
 * Picks a creator, pastes up to five of their public videos, checks the ones we
 * could read, builds the voice, and copies a private link to email them. That
 * is the whole loop, and everything on this screen is one of those five steps.
 *
 * ── THE ONE RULE THIS SCREEN ENFORCES ────────────────────────────────────────
 * You cannot copy a link before its analysis has finished. The build runs to
 * minutes, and a link sent early opens onto an empty page for the one person we
 * most wanted to impress. `ready` comes from the server (built_at set, not
 * building) and the copy control does not exist until it is true.
 *
 * ── AND WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * Grant admin. The flag is set by hand in the database. An endpoint that can
 * make somebody an admin is the highest-value target in the product, and this
 * feature has never needed one.
 */
export default function AdminPanel() {
  // No responsive branching here on purpose. This is an internal tool used on a
  // desktop; the layout below is fluid enough to survive a phone, and every
  // isPhone ternary would be a branch nobody will ever look at.
  const [allowed, setAllowed] = useState(null);   // null = checking
  const [limits, setLimits] = useState({ max_videos: 5, credits_per_link: 100 });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  // Create form
  const [name, setName] = useState("");
  const [urls, setUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [checked, setChecked] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/showcases");
      setRows(data.showcases || []);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load showcases."));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/admin/me");
        setLimits(data.limits || limits);
        setAllowed(true);
        load();
      } catch {
        // 404 for anyone without the flag, deliberately: a 403 would confirm
        // the endpoint exists.
        setAllowed(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // A build in flight finishes without telling us, so the list refreshes while
  // any row is still building and stops the moment none is.
  useEffect(() => {
    if (!rows.some((r) => r.building)) return undefined;
    const t = setTimeout(load, 6000);
    return () => clearTimeout(t);
  }, [rows, load]);

  const urlList = urls.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  async function inspect() {
    setBusy("inspect");
    setError("");
    setChecked(null);
    try {
      const { data } = await api.post("/admin/showcases/inspect", { urls: urlList });
      setChecked(data);
    } catch (err) {
      setError(errorMessage(err, "Couldn't check those links."));
    } finally {
      setBusy("");
    }
  }

  async function create() {
    setBusy("create");
    setError("");
    try {
      const { data } = await api.post("/admin/showcases", {
        display_name: name.trim(), urls: urlList, notes,
      });
      setName(""); setUrls(""); setNotes(""); setChecked(null);
      setRows((r) => [data.showcase, ...r]);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create that showcase."));
    } finally {
      setBusy("");
    }
  }

  async function act(id, path, body) {
    setBusy(id + path);
    setError("");
    try {
      await api.post(`/admin/showcases/${id}${path}`, body || {});
      await load();
    } catch (err) {
      setError(errorMessage(err, "That didn't work."));
    } finally {
      setBusy("");
    }
  }

  if (allowed === null) return <Wrap><p style={muted}>Checking…</p></Wrap>;
  if (allowed === false) {
    return (
      <Wrap>
        <h1 style={h1}>Not found</h1>
        <p style={muted}>No such page.</p>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <h1 style={h1}>Showcases</h1>
      <p style={{ ...muted, maxWidth: 760, marginBottom: 30 }}>
        Build a creator's voice from their public videos, then send them the private link.
        Each link carries {limits.credits_per_link} credits, shared by everyone who opens it.
      </p>

      {/* ── Create ─────────────────────────────────────────────────────────── */}
      <section style={{ ...card, marginBottom: 34 }}>
        <h2 style={h2}>New showcase</h2>

        <label style={label}>Creator name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Prasadtechintelugu"
          style={input}
        />

        <label style={label}>
          Up to {limits.max_videos} video URLs, under 3 minutes each — one per line
        </label>
        <textarea
          value={urls}
          onChange={(e) => { setUrls(e.target.value); setChecked(null); }}
          rows={5}
          placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…"}
          style={{ ...input, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, resize: "vertical" }}
        />

        <label style={label}>Notes (channel, email, what you sent)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={input} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button
            onClick={inspect}
            disabled={!urlList.length || busy === "inspect"}
            style={btn(!urlList.length || busy === "inspect")}
          >
            {busy === "inspect" ? "Checking…" : "Check the links"}
          </button>
          <button
            onClick={create}
            disabled={!name.trim() || !checked?.ok?.length || busy === "create"}
            style={btnPrimary(!name.trim() || !checked?.ok?.length || busy === "create")}
          >
            {busy === "create" ? "Creating…" : "Create showcase"}
          </button>
        </div>

        {/* Checking is free (metadata only), so it always runs before anything
            is written and before a single video is read. */}
        {checked && (
          <div style={{ marginTop: 16, fontSize: 13.5 }}>
            {checked.ok.map((v) => (
              <div key={v.video_id} style={okRow}>
                ✓ {v.title || v.video_id}
                <span style={{ color: "var(--ink-mute)" }}>
                  {"  "}· {Math.round(v.duration_seconds)}s · {v.channel}
                </span>
              </div>
            ))}
            {checked.rejected.map((r, i) => (
              <div key={i} style={badRow}>✕ {r.url} — {r.reason}</div>
            ))}
          </div>
        )}
      </section>

      {/* ── List ───────────────────────────────────────────────────────────── */}
      {rows.map((r) => (
        <section key={r.id} style={{ ...card, marginBottom: 14, opacity: r.active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>
                {r.display_name}
                {r.claimed && <Tag>claimed</Tag>}
                {!r.active && !r.claimed && <Tag>off</Tag>}
              </div>
              <div style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>
                {r.videos} videos · {r.credits} credits · {r.opens} opens · {r.scripts_made} scripts
                {r.language_label ? ` · ${r.language_label}` : ""}
                {r.confidence ? ` · ${r.confidence}` : ""}
              </div>
              {r.build_error && (
                <div style={{ fontSize: 12.5, color: "#C0392B", marginTop: 5 }}>{r.build_error}</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              {/* The gate. No link before the analysis has produced something. */}
              {r.ready ? (
                <button
                  onClick={() => navigator.clipboard?.writeText(r.url)}
                  style={btnPrimary(false)}
                >
                  Copy link
                </button>
              ) : r.building ? (
                <span style={{ ...muted, fontSize: 13, padding: "9px 0" }}>Analysing…</span>
              ) : (
                <button
                  onClick={() => act(r.id, "/build")}
                  disabled={!r.videos || busy === r.id + "/build"}
                  style={btnPrimary(!r.videos || busy === r.id + "/build")}
                >
                  {busy === r.id + "/build" ? "Starting…" : "Build voice"}
                </button>
              )}

              {!r.claimed && (
                <>
                  <button onClick={() => act(r.id, "/topup", { credits: limits.credits_per_link })} style={btn(false)}>
                    +{limits.credits_per_link}
                  </button>
                  <button onClick={() => act(r.id, "/rotate")} style={btn(false)}>New link</button>
                  <button onClick={() => act(r.id, "/active", { active: !r.active })} style={btn(false)}>
                    {r.active ? "Turn off" : "Turn on"}
                  </button>
                </>
              )}
            </div>
          </div>

          {r.ready && r.active && (
            <div style={{ ...muted, fontSize: 12, marginTop: 10, fontFamily: "ui-monospace, Menlo, monospace" }}>
              {r.url}
            </div>
          )}
        </section>
      ))}

      {!rows.length && <p style={muted}>No showcases yet.</p>}

      {error && <div role="alert" style={{ marginTop: 18, fontSize: 13.5, color: "#C0392B" }}>{error}</div>}
    </Wrap>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────── */

function Wrap({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #FAFAF8)" }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "44px clamp(20px, 5vw, 60px) 120px" }}>
        {children}
      </div>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      marginLeft: 9, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 650,
      color: "var(--ink-mute)", background: "var(--bg, #F4F4F4)", border: "1px solid var(--line, #E3E3E3)",
      verticalAlign: "middle",
    }}>{children}</span>
  );
}

const h1 = { fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 10px" };
const h2 = { fontSize: 17, fontWeight: 700, color: "var(--ink)", margin: "0 0 16px" };
const muted = { fontSize: 14, lineHeight: 1.6, color: "var(--ink-mute)", margin: 0 };
const card = {
  background: "var(--card, #fff)", border: "1px solid var(--line, #E3E3E3)",
  borderRadius: 14, padding: "20px 20px",
};
const label = {
  display: "block", fontSize: 12, fontWeight: 650, textTransform: "uppercase",
  letterSpacing: ".05em", color: "var(--ink-mute)", margin: "14px 0 6px",
};
const input = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--line, #E3E3E3)", fontSize: 14.5, color: "var(--ink)",
  background: "var(--bg, #fff)",
};
const okRow = { padding: "3px 0", color: "var(--ink)" };
const badRow = { padding: "3px 0", color: "#C0392B" };

const btn = (disabled) => ({
  padding: "9px 15px", borderRadius: 10, border: "1px solid var(--line, #E3E3E3)",
  background: "var(--bg, #fff)", color: "var(--ink)", fontSize: 13.5, fontWeight: 600,
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
});

const btnPrimary = (disabled) => ({
  padding: "9px 17px", borderRadius: 10, border: "none",
  background: disabled ? "#D8D8D8" : "var(--primary, #0F0E0C)", color: "#fff",
  fontSize: 13.5, fontWeight: 650, cursor: disabled ? "default" : "pointer",
});
