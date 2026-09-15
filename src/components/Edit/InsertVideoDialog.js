import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useIsMobile from "../../hooks/useIsMobile";
import { Btn, Icon, Notice, fmtBytes } from "./ui";

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|3gp)$/i;

/**
 * A video put between two parts of the edit, from the "+" between them on the
 * timeline.
 *
 * Only the file is chosen here. The upload, and placing the video once the
 * server has prepared it, belong to the workspace (Workspace.js), so this closes
 * the moment it is submitted and editing carries on while the file goes up.
 */
export default function InsertVideoDialog({ where, accept, maxMb, onSubmit, onClose }) {
  const isPhone = useIsMobile(600);
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const limit = maxMb ? maxMb * 1024 * 1024 : 0;
  const choose = (f) => {
    if (!f) return;
    if (!(String(f.type).startsWith("video/") || VIDEO_EXT.test(f.name))) {
      setError("That isn't a video. Use MP4, MOV or WebM.");
      return;
    }
    if (limit && f.size > limit) {
      setError(`That file is ${fmtBytes(f.size)}. Videos can be up to ${fmtBytes(limit)}.`);
      return;
    }
    setError("");
    setFile(f);
  };

  return createPortal(
    <div
      onClick={onClose}
      className="hg-fade"
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,15,15,.45)", display: "flex", justifyContent: "center", alignItems: isPhone ? "flex-end" : "center", padding: isPhone ? 0 : 18 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a video"
        className="hg-sheet-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isPhone ? "100%" : "min(460px, 100%)", background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: isPhone ? "16px 16px 0 0" : 16, padding: isPhone ? "18px 16px calc(20px + env(safe-area-inset-bottom))" : 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 750, letterSpacing: "-.02em", color: "var(--ink)" }}>Add a video</h3>
            <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 3 }}>{where}</div>
          </div>
          <Btn ref={closeRef} aria-label="Close" size="s" onClick={onClose} icon={<Icon.Close size={15} />} style={{ width: 34, height: 34, padding: 0 }} />
        </div>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer?.files?.[0]); }}
          style={{
            width: "100%", display: "grid", justifyItems: "center", gap: 6, padding: "22px 16px", borderRadius: 12, cursor: "pointer",
            fontFamily: "inherit", color: "var(--ink)", border: `1.5px dashed ${over ? "var(--ink)" : "#CFCBC4"}`,
            background: over ? "var(--made-tint)" : "var(--paper)", transition: "background .12s ease, border-color .12s ease",
          }}
        >
          <Icon.Upload size={20} />
          <span style={{ fontSize: 14, fontWeight: 650 }}>{isPhone ? "Choose a video" : "Drop a video here, or choose one"}</span>
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>MP4, MOV or WebM{limit ? `, up to ${fmtBytes(limit)}` : ""}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept={accept || "video/*"}
          style={{ display: "none" }}
          onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }}
        />

        {file && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", color: "var(--ink-body)" }}>
            <Icon.Film size={16} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
            <span style={{ fontSize: 12, color: "var(--ink-mute)", flexShrink: 0 }}>{fmtBytes(file.size)}</span>
          </div>
        )}
        {error && <div style={{ marginTop: 10 }}><Notice tone="bad">{error}</Notice></div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" icon={<Icon.Plus size={14} />} disabled={!file} onClick={() => onSubmit(file)}>Add video</Btn>
        </div>
      </div>
    </div>,
    document.body
  );
}
