import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import { timeAgo } from "../News/newsUtils";
import Skeleton from "../Shell/Skeleton";
import { listProjects, deleteProject, createProject } from "./editApi";
import { Btn, Icon, Notice, fmtTime } from "./ui";

/**
 * Edit videos: every edit, newest first, and where a new one starts.
 *
 * Two kinds live side by side: a video uploaded here on its own (New project),
 * and a recording cut to one of the creator's scripts (Edit video under the
 * script). The list does not split them, because to a creator both are "my
 * video I am editing"; the card just says which one came from a script.
 *
 * The status line answers the one question each card is looked at for: what do
 * I have to do next with this. Upload, wait, edit, download, or nothing, because
 * it expired. Cards run the full width, four a row on a desk (index.css
 * .hg-video-grid), since a thumbnail is what a creator finds a video by.
 */
export default function VideosPanel({ onGoCreate }) {
  const isPhone = useIsMobile(680);
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await listProjects());
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your videos."));
      setRows((r) => r || []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Back online: the list may have moved on (an export finished) while it could not be read.
  useEffect(() => {
    const back = () => load();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [load]);

  async function remove(id) {
    setConfirming(null);
    try {
      await deleteProject(id);
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const gut = isPhone ? 16 : 26;

  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0, padding: `${isPhone ? 16 : 22}px ${gut}px 40px` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px 24px", flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h1 style={{ fontSize: isPhone ? 20 : 23, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 4px" }}>Edit videos</h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-body)", margin: 0, lineHeight: 1.6 }}>
            Caption any video in your language, translate it, add B-roll and music, and export. Files are kept for a week after you last work on a video.
          </p>
        </div>
        <Btn kind="primary" icon={<Icon.Plus size={15} />} onClick={() => setCreating(true)} style={{ flex: isPhone ? "1 1 100%" : "0 0 auto" }}>
          New project
        </Btn>
      </div>

      {error && <div role="alert" style={{ padding: "10px 13px", borderRadius: 10, marginBottom: 12, background: "#FCE8E6", border: "1px solid #F5C7C3", color: "var(--bad)", fontSize: 13 }}>{error}</div>}

      {rows === null && (
        <div className="hg-video-grid">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rectangular" height={236} />)}
        </div>
      )}

      {rows && rows.length === 0 && (
        <div style={{ padding: "28px 20px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--card)", textAlign: "center" }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 46, height: 46, borderRadius: 12, background: "var(--made-tint)", color: "var(--made)", marginBottom: 10 }}>
            <Icon.Film size={22} />
          </span>
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>No videos yet</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 auto 16px", maxWidth: 400 }}>
            Start a project and upload any video where you talk. Or record one of your scripts, and press Edit video under it.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn kind="primary" icon={<Icon.Plus size={15} />} onClick={() => setCreating(true)}>New project</Btn>
            {onGoCreate && <Btn onClick={onGoCreate}>Write a script</Btn>}
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="hg-video-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((p) => (
            <VideoCard
              key={p.id}
              p={p}
              confirming={confirming === p.id}
              onOpen={() => !p.purged && navigate(`/app/edit?p=${p.id}`)}
              onAskDelete={() => setConfirming(p.id)}
              onDelete={() => remove(p.id)}
              onKeep={() => setConfirming(null)}
            />
          ))}
        </ul>
      )}

      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/app/edit?p=${id}`)}
        />
      )}
    </div>
  );
}

function VideoCard({ p, confirming, onOpen, onAskDelete, onDelete, onKeep }) {
  const status = statusOf(p);
  const name = p.headline || "Untitled";
  return (
    <li className="hg-row" style={{ display: "flex", flexDirection: "column", minWidth: 0, borderRadius: 14, border: "1px solid var(--line)", background: "var(--card)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={onOpen}
        style={{ display: "block", width: "100%", border: "none", background: "none", padding: 0, textAlign: "left", cursor: p.purged ? "default" : "pointer", fontFamily: "inherit", color: "inherit" }}
      >
        {/* Portrait and landscape both fit whole, over a blurred fill of themselves. */}
        <span style={{ position: "relative", display: "block", aspectRatio: "16 / 10", background: "#1D1C1A", overflow: "hidden" }}>
          {p.thumb_url ? (
            <>
              <img src={p.thumb_url} alt="" aria-hidden="true" style={{ position: "absolute", inset: "-12%", width: "124%", height: "124%", objectFit: "cover", filter: "blur(18px) brightness(.6)" }} />
              <img src={p.thumb_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
            </>
          ) : (
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#8C877F" }}><Icon.Film size={26} /></span>
          )}
          {p.duration > 0 && (
            <span style={{ position: "absolute", right: 8, bottom: 8, padding: "2px 6px", borderRadius: 5, background: "rgba(0,0,0,.72)", color: "#fff", fontSize: 11.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(p.duration, false)}
            </span>
          )}
        </span>
        <span style={{ display: "block", padding: "11px 12px 0" }}>
          <span title={name} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 14, fontWeight: 650, lineHeight: 1.35, color: "var(--ink)", wordBreak: "break-word" }}>
            {name}
          </span>
          <span style={{ display: "block", marginTop: 4, fontSize: 12.5, color: status.tone, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {status.label}
          </span>
        </span>
      </button>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 6, minHeight: 44, padding: "4px 6px 6px 12px" }}>
        {confirming ? (
          <>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>Delete?</span>
            <Btn size="s" kind="danger" onClick={onDelete}>Delete</Btn>
            <Btn size="s" onClick={onKeep}>Keep</Btn>
          </>
        ) : (
          <>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.mode !== "free" ? "From a script · " : ""}{timeAgo(p.updated_at)}
            </span>
            <Btn size="s" kind="quiet" aria-label={`Delete ${name}`} onClick={onAskDelete} icon={<Icon.Trash />} style={{ padding: 7 }} />
          </>
        )}
      </div>
    </li>
  );
}

function statusOf(p) {
  const free = p.mode === "free";
  if (p.purged) return { label: "Files expired", tone: "var(--ink-mute)" };
  if (p.rendering) return { label: "Exporting…", tone: "var(--made)" };
  if (p.translating) return { label: "Translating captions…", tone: "var(--made)" };
  if (p.status === "analysing") return { label: free ? "Writing captions…" : "Matching to the script…", tone: "var(--made)" };
  if (p.status === "failed") return { label: free ? "Captions failed, open to retry" : "Matching failed, open to retry", tone: "var(--bad)" };
  if (p.status === "ready") return p.exported ? { label: "Exported", tone: "var(--ok)" } : { label: "Ready to edit", tone: "var(--ink)" };
  if (free) return p.recordings ? { label: "Uploaded, ready for captions", tone: "var(--ink)" } : { label: "Waiting for your video", tone: "var(--ink-mute)" };
  return p.recordings ? { label: "Uploaded, ready to match", tone: "var(--ink)" } : { label: "Waiting for your recording", tone: "var(--ink-mute)" };
}

/**
 * A name, then straight to the upload. The name comes first because it is what
 * the video is found by here; it can be changed from the editor at any time.
 */
function NewProjectDialog({ onClose, onCreated }) {
  const isPhone = useIsMobile(600);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);
  const named = name.trim().length > 0;

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function submit(e) {
    e?.preventDefault();
    if (busy || !named) return;
    setBusy(true);
    setError("");
    try {
      const d = await createProject(name.trim());
      onCreated(d.project.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return createPortal(
    <div onClick={() => !busy && onClose()} className="hg-fade" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,15,15,.45)", display: "flex", justifyContent: "center", alignItems: isPhone ? "flex-end" : "center", padding: isPhone ? 0 : 18 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        className="hg-sheet-up"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isPhone ? "100%" : "min(460px, 100%)", background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: isPhone ? "16px 16px 0 0" : 16, padding: isPhone ? "18px 16px calc(20px + env(safe-area-inset-bottom))" : 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 750, letterSpacing: "-.02em", color: "var(--ink)" }}>New project</h3>
          <Btn aria-label="Close" size="s" onClick={onClose} disabled={busy} icon={<Icon.Close size={15} />} style={{ width: 34, height: 34, padding: 0 }} />
        </div>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink-body)", marginBottom: 6 }} htmlFor="new-project-name">
          Name your video
        </label>
        <input
          id="new-project-name"
          ref={input}
          value={name}
          maxLength={120}
          placeholder="e.g. iPhone 17 Pro price drop"
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 15, padding: "11px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", outline: "none", fontFamily: "inherit" }}
        />
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", margin: "8px 0 16px" }}>
          Next you upload the video. You can rename it any time from the editor.
        </p>
        {error && <div style={{ marginBottom: 12 }}><Notice tone="bad">{error}</Notice></div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn kind="primary" size="l" type="submit" disabled={busy || !named} style={{ flex: isPhone ? "1 1 100%" : undefined }}>
            {busy ? "Creating…" : "Create and upload"}
          </Btn>
          <Btn size="l" onClick={onClose} disabled={busy} style={{ flex: isPhone ? "1 1 100%" : undefined }}>Cancel</Btn>
        </div>
      </form>
    </div>,
    document.body
  );
}
