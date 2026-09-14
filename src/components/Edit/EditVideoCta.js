import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../api";
import { useShowcase } from "../../state/ShowcaseContext";
import { openProjectForScript } from "./editApi";
import { Btn, Icon } from "./ui";

/**
 * The door from a finished script into the editor.
 *
 * Under the script card rather than in its toolbar. The toolbar is for reading
 * this script; this is the next job, recording done, and it is offered as the
 * next step in the page's own order: read it, record it, then this.
 *
 * Absent for a showcase visitor. The editor stores footage and spends render
 * minutes, and a demo link is not an account.
 */
export default function EditVideoCta({ scriptId, compact = false }) {
  const { isShowcase } = useShowcase();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (isShowcase || !scriptId) return null;

  async function open() {
    setBusy(true);
    setError("");
    try {
      const d = await openProjectForScript(scriptId);
      navigate(`/app/edit?p=${d.project.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't open the editor. Please try again."));
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 14, padding: compact ? "14px 14px" : "15px 18px", borderRadius: 12,
        border: "1px solid var(--line)", background: "var(--card)",
        display: "flex", alignItems: "center", gap: "12px 14px", flexWrap: "wrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0,
          background: "var(--made-tint)", border: "1px solid var(--made-line)", color: "var(--made)",
        }}
      >
        <Icon.Film size={19} />
      </span>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 650, color: "var(--ink)", marginBottom: 2 }}>Recorded it? Edit the video here.</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-mute)" }}>
          Upload your recording. We cut it line by line to this script, keep your best takes, and set up the B-roll and captions.
        </div>
      </div>
      <Btn kind="primary" onClick={open} disabled={busy} style={compact ? { flex: "1 1 100%" } : undefined}>
        {busy ? "Opening…" : "Edit video"}
      </Btn>
      {error && <div role="alert" style={{ flexBasis: "100%", fontSize: 12.5, color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}
