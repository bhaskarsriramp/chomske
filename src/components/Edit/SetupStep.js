import { useState, useRef } from "react";
import { errorMessage } from "../../api";
import { useCredits } from "../../state/CreditsContext";
import { startAnalysis, removeMedia, reorderRecordings } from "./editApi";
import { Btn, Bar, Icon, Notice, Spinner, fmtBytes, fmtTime } from "./ui";
import { hasIndic } from "./model";

/**
 * Step one: the recording goes in.
 *
 * ── WHAT THE CREATOR NEEDS TO HEAR BEFORE UPLOADING ──────────────────────────
 * That mistakes are fine. The most likely reason somebody does not use this is
 * that they think they have to deliver the script perfectly, in order, in one
 * take, and so they edit elsewhere the way they always have. The copy says the
 * opposite in the first sentence: pause, redo a line, say it twice, we keep the
 * last good one.
 *
 * ── SEVERAL FILES ARE ONE RECORDING ──────────────────────────────────────────
 * Phones split long recordings and creators record in parts. Every file here is
 * matched as one continuous take in the order shown, which the arrows change.
 */
export default function SetupStep({ data, config, isNarrow, uploads, onAddFiles, onRetryUpload, onDismissUpload, onData, onReload, hasEdit, onBackToEdit }) {
  const { project, script } = data;
  const { balance, setBalance, openBuy, canBuy } = useCredits();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  const recordings = project.media.filter((m) => m.kind === "recording").sort((a, b) => a.order - b.order);
  const local = uploads.filter((u) => u.kind === "recording");
  const pendingLocal = local.filter((u) => !u.mediaId || !recordings.some((r) => r.id === u.mediaId));

  const ready = recordings.filter((r) => r.status === "ready");
  const preparing = recordings.some((r) => r.status === "uploaded" || r.status === "processing") || local.some((u) => u.status !== "failed");
  const cost = project.pricing?.analyse || 0;
  const tooExpensive = typeof balance === "number" && cost > balance;
  const canMatch = ready.length > 0 && !preparing && !busy && cost > 0 && !tooExpensive;

  async function match() {
    setBusy(true);
    setError("");
    try {
      const d = await startAnalysis(project.id, cost);
      if (typeof d.balance === "number") setBalance(d.balance);
      onData(d);
    } catch (err) {
      const body = err?.response?.data;
      if (body?.insufficient_credits) setBalance(body.balance);
      else {
        setError(errorMessage(err));
        if (body?.price_changed || body?.preparing) onReload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setError("");
    try { onData(await removeMedia(project.id, id)); } catch (err) { setError(errorMessage(err)); }
  }

  async function move(id, dir) {
    const ids = recordings.map((r) => r.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { onData(await reorderRecordings(project.id, ids)); } catch (err) { setError(errorMessage(err)); }
  }

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(f.name));
    if (files.length) onAddFiles(files, "recording");
  };

  const lines = script?.lines || [];
  const minutes = Math.max(1, Math.ceil((project.pricing?.analyse_seconds || 0) / 60));

  const label = busy
    ? "Starting…"
    : preparing
    ? "Preparing your video…"
    : !ready.length
    ? "Upload your recording first"
    : tooExpensive
    ? "Not enough credits"
    : `Match to my script · ${cost} credits`;

  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div
        style={{
          maxWidth: 1080, margin: "0 auto", padding: isNarrow ? "18px 16px 120px" : "28px 24px 120px",
          display: "grid", gap: isNarrow ? 18 : 28,
          gridTemplateColumns: isNarrow ? "minmax(0,1fr)" : "minmax(0,1.25fr) minmax(0,1fr)",
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: isNarrow ? 21 : 25, fontWeight: 750, letterSpacing: "-.025em", color: "var(--ink)", margin: "0 0 8px" }}>
            Upload your recording
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 18px" }}>
            Read the script to camera, in one go or in parts. Pause between lines, redo any line
            you stumble on, say it twice if you like: we find every line and keep your last good take.
          </p>

          {hasEdit && (
            <div style={{ marginBottom: 14 }}>
              <Notice tone="warn" action={<Btn size="s" onClick={onBackToEdit}>Back to my edit</Btn>}>
                Matching again replaces your current edit: trims, B-roll, music and text.
              </Notice>
            </div>
          )}
          {project.status === "failed" && project.error && (
            <div style={{ marginBottom: 14 }}><Notice tone="bad">{project.error}</Notice></div>
          )}
          {error && <div style={{ marginBottom: 14 }}><Notice tone="bad">{error}</Notice></div>}

          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            style={{
              border: `1.5px dashed ${drag ? "var(--ink)" : "#CFCBC4"}`, borderRadius: 14,
              background: drag ? "var(--made-tint)" : "var(--card)", padding: isNarrow ? "22px 16px" : "30px 20px",
              textAlign: "center", transition: "background .12s ease, border-color .12s ease",
            }}
          >
            <span style={{ display: "inline-grid", placeItems: "center", width: 46, height: 46, borderRadius: 12, background: "var(--made-tint)", color: "var(--made)", marginBottom: 10 }}>
              <Icon.Upload size={22} />
            </span>
            <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>
              {isNarrow ? "Choose your recording" : "Drop your recording here"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginBottom: 14 }}>
              MP4 or MOV, up to {config?.limits?.max_upload_mb ? `${Math.round(config.limits.max_upload_mb / 102.4) / 10} GB` : "2 GB"} a file.
              {" "}Several files are matched in the order below.
            </div>
            <Btn kind="primary" onClick={() => input.current?.click()} icon={<Icon.Upload size={16} />}>Choose video</Btn>
            <input
              ref={input}
              type="file"
              multiple
              accept={config?.accept?.recording || "video/*"}
              style={{ display: "none" }}
              onChange={(e) => { onAddFiles(e.target.files, "recording"); e.target.value = ""; }}
            />
          </div>

          {(recordings.length > 0 || pendingLocal.length > 0) && (
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 8 }}>
              {pendingLocal.map((u) => (
                <UploadRow key={u.key} upload={u} onRetry={() => onRetryUpload(u.key)} onDismiss={() => onDismissUpload(u.key)} />
              ))}
              {recordings.map((m, i) => (
                <RecordingRow
                  key={m.id}
                  media={m}
                  index={i}
                  count={recordings.length}
                  upload={local.find((u) => u.mediaId === m.id)}
                  onRemove={() => remove(m.id)}
                  onUp={() => move(m.id, -1)}
                  onDown={() => move(m.id, 1)}
                />
              ))}
            </ul>
          )}
        </div>

        <aside style={{ minWidth: 0 }}>
          <details open={!isNarrow} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
            <summary style={{ cursor: "pointer", padding: "12px 14px", fontSize: 13, fontWeight: 650, color: "var(--ink)", listStyle: "none", display: "flex", justifyContent: "space-between" }}>
              <span>What you're reading</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-mute)" }}>{lines.length} lines</span>
            </summary>
            <ol style={{ margin: 0, padding: "0 14px 12px", listStyle: "none", maxHeight: isNarrow ? 320 : 460, overflowY: "auto" }} className="hg-scroll">
              {lines.map((l) => {
                const text = l.roman || l.text;
                return (
                  <li key={l.n} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 11.5, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>{l.n}</span>
                    <span className={hasIndic(text) ? "indic" : undefined} style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-body)" }}>{text}</span>
                  </li>
                );
              })}
            </ol>
          </details>

          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "var(--made-tint)", border: "1px solid var(--made-line)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>For the cleanest cut</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.65, color: "var(--ink-body)" }}>
              <li>Take a breath between lines. The pauses are where we cut.</li>
              <li>Messed up? Stop, and say the whole line again.</li>
              <li>Quiet room, phone close. Background music makes lines harder to find.</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* The ask, pinned where a thumb reaches it. */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2,
          background: "var(--card)", borderTop: "1px solid var(--line)",
          padding: isNarrow ? "10px 16px calc(10px + env(safe-area-inset-bottom))" : "12px 24px",
        }}
      >
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: "8px 14px", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-mute)" }}>
            {ready.length
              ? `${ready.length} recording${ready.length === 1 ? "" : "s"}, ${fmtTime(project.pricing?.analyse_seconds || 0, false)} in all. ${project.pricing?.analyse_per_min || ""} credits per started minute (${minutes} min). Refunded if matching fails.`
              : "Matching is charged per minute of recording, and refunded if it fails."}
          </div>
          <div style={{ display: "flex", gap: 8, flex: isNarrow ? "1 1 100%" : "0 0 auto" }}>
            {tooExpensive && canBuy && ready.length > 0 && !preparing && (
              <Btn size="l" onClick={openBuy} style={{ flex: isNarrow ? 1 : undefined }}>Buy credits</Btn>
            )}
            <Btn kind="primary" size="l" disabled={!canMatch} onClick={match} style={{ flex: isNarrow ? 1 : undefined }}>
              {preparing && !busy && <Spinner size={14} />}
              {label}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Thumb({ src }) {
  return (
    <span style={{ width: 44, height: 56, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#ECEAE6", display: "grid", placeItems: "center", color: "var(--ink-mute)" }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon.Film size={18} />}
    </span>
  );
}

const rowStyle = {
  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
  background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12,
};

function UploadRow({ upload, onRetry, onDismiss }) {
  const failed = upload.status === "failed";
  return (
    <li style={rowStyle}>
      <Thumb />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{upload.name}</div>
        <div style={{ fontSize: 12, color: failed ? "var(--bad)" : "var(--ink-mute)", margin: "2px 0 6px" }}>
          {failed ? upload.error : upload.status === "starting" ? "Starting upload…" : `Uploading ${Math.round(upload.progress * 100)}% of ${fmtBytes(upload.size)}`}
        </div>
        {!failed && <Bar value={upload.progress} />}
      </div>
      {failed && (
        <span style={{ display: "flex", gap: 6 }}>
          <Btn size="s" onClick={onRetry}>Retry</Btn>
          <Btn size="s" kind="quiet" onClick={onDismiss} aria-label="Dismiss" icon={<Icon.Close size={14} />} />
        </span>
      )}
    </li>
  );
}

function RecordingRow({ media, index, count, upload, onRemove, onUp, onDown }) {
  const s = media.status;
  const status = upload && upload.status !== "failed"
    ? upload.status === "finishing" ? "Upload done, preparing…" : `Uploading ${Math.round(upload.progress * 100)}%`
    : s === "uploading"
    ? "Upload didn't finish. Remove it and upload again."
    : s === "uploaded" || s === "processing"
    ? "Preparing a preview…"
    : s === "failed"
    ? media.error || "We couldn't read this file."
    : `Ready · ${fmtTime(media.duration, false)} · ${fmtBytes(media.size)}`;

  return (
    <li style={rowStyle}>
      {count > 1 && (
        <span style={{ fontSize: 12, fontWeight: 650, color: "var(--ink-mute)", width: 16, textAlign: "center" }}>{index + 1}</span>
      )}
      <Thumb src={media.thumb_url} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{media.filename}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 2, color: s === "failed" || s === "uploading" ? "var(--bad)" : s === "ready" ? "var(--ok)" : "var(--ink-mute)" }}>
          {(s === "uploaded" || s === "processing") && <Spinner size={11} />}
          {s === "ready" && <Icon.Check size={12} />}
          <span>{status}</span>
        </div>
        {upload && upload.status === "uploading" && <div style={{ marginTop: 6 }}><Bar value={upload.progress} /></div>}
      </div>
      <span style={{ display: "flex", gap: 2 }}>
        {count > 1 && (
          <>
            <Btn size="s" kind="quiet" aria-label="Move up" disabled={index === 0} onClick={onUp} icon={<Icon.Up />} style={{ padding: 6 }} />
            <Btn size="s" kind="quiet" aria-label="Move down" disabled={index === count - 1} onClick={onDown} icon={<Icon.Down />} style={{ padding: 6 }} />
          </>
        )}
        {s !== "processing" && s !== "uploaded" && !(upload && upload.status !== "failed") && (
          <Btn size="s" kind="quiet" aria-label="Remove recording" onClick={onRemove} icon={<Icon.Trash />} style={{ padding: 6 }} />
        )}
      </span>
    </li>
  );
}
