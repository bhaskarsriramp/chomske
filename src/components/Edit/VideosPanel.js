import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import { timeAgo } from "../News/newsUtils";
import Skeleton from "../Shell/Skeleton";
import { listProjects, deleteProject } from "./editApi";
import { Btn, Icon, fmtTime } from "./ui";

/**
 * My videos: every edit, newest first.
 *
 * The status line answers the one question each row is looked at for: what do
 * I have to do next with this. Upload, wait, edit, download, or nothing, because
 * it expired.
 */
export default function VideosPanel({ onGoCreate }) {
  const isPhone = useIsMobile(680);
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);

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
      <div style={{ maxWidth: 820 }}>
        <h1 style={{ fontSize: isPhone ? 20 : 23, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 4px" }}>My videos</h1>
        <p style={{ fontSize: 13.5, color: "var(--ink-body)", margin: "0 0 16px", lineHeight: 1.6 }}>
          Recordings you've cut to a script. Files are kept for a week after you last worked on a video.
        </p>

        {error && <div role="alert" style={{ padding: "10px 13px", borderRadius: 10, marginBottom: 12, background: "#FCE8E6", border: "1px solid #F5C7C3", color: "var(--bad)", fontSize: 13 }}>{error}</div>}

        {rows === null && (
          <div style={{ display: "grid", gap: 8 }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} variant="rectangular" height={84} />)}
          </div>
        )}

        {rows && rows.length === 0 && (
          <div style={{ padding: "28px 20px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--card)", textAlign: "center" }}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 46, height: 46, borderRadius: 12, background: "var(--made-tint)", color: "var(--made)", marginBottom: 10 }}>
              <Icon.Film size={22} />
            </span>
            <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>No videos yet</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 auto 16px", maxWidth: 380 }}>
              Write a script, record yourself reading it, then press Edit video under the script to upload it.
            </p>
            {onGoCreate && <Btn kind="primary" onClick={onGoCreate}>Write a script</Btn>}
          </div>
        )}

        {rows && rows.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {rows.map((p) => {
              const status = statusOf(p);
              return (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)" }}>
                  <button
                    type="button"
                    onClick={() => !p.purged && navigate(`/app/edit?p=${p.id}`)}
                    className="hg-row"
                    style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, border: "none", background: "none", padding: 0, textAlign: "left", cursor: p.purged ? "default" : "pointer", fontFamily: "inherit" }}
                  >
                    <span style={{ width: 52, height: 66, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#ECEAE6", display: "grid", placeItems: "center", color: "var(--ink-mute)" }}>
                      {p.thumb_url ? <img src={p.thumb_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon.Film size={18} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 650, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isPhone ? "normal" : "nowrap", lineHeight: 1.35 }}>
                        {p.headline || "Untitled"}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 3, color: status.tone }}>
                        {status.label}
                        <span style={{ color: "var(--ink-mute)" }}>
                          {p.duration ? ` · ${fmtTime(p.duration, false)}` : ""} · {timeAgo(p.updated_at)}
                        </span>
                      </span>
                    </span>
                  </button>
                  {confirming === p.id ? (
                    <span style={{ display: "flex", gap: 6 }}>
                      <Btn size="s" kind="danger" onClick={() => remove(p.id)}>Delete</Btn>
                      <Btn size="s" onClick={() => setConfirming(null)}>Keep</Btn>
                    </span>
                  ) : (
                    <Btn size="s" kind="quiet" aria-label="Delete video" onClick={() => setConfirming(p.id)} icon={<Icon.Trash />} style={{ padding: 7 }} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function statusOf(p) {
  if (p.purged) return { label: "Files expired", tone: "var(--ink-mute)" };
  if (p.rendering) return { label: "Exporting…", tone: "var(--made)" };
  if (p.status === "analysing") return { label: "Matching to the script…", tone: "var(--made)" };
  if (p.status === "failed") return { label: "Matching failed, open to retry", tone: "var(--bad)" };
  if (p.status === "ready") return p.exported ? { label: "Exported", tone: "var(--ok)" } : { label: "Ready to edit", tone: "var(--ink)" };
  return p.recordings ? { label: "Uploaded, ready to match", tone: "var(--ink)" } : { label: "Waiting for your recording", tone: "var(--ink-mute)" };
}
