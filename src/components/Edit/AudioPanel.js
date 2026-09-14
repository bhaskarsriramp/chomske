import { useRef } from "react";
import { Btn, Bar, Icon, Nudge, Range, Section, Spinner, fmtTime } from "./ui";
import { newId } from "./model";

/**
 * Sound: the creator's voice level, and music under it.
 *
 * Music starts quiet (25%) with a fade at both ends, because the default a
 * creator gets is the default most of them keep, and music fighting the voice is
 * the single most common reason a Short gets scrolled past.
 */
export default function AudioPanel({ tl, lay, media, uploads, time, onChange, onAddFiles, onRemoveMedia, onRetryUpload, onDismissUpload, onAssignWhenReady }) {
  const input = useRef(null);
  const audioAssets = media.filter((m) => m.kind === "asset" && m.type === "audio");
  const pending = uploads.filter((u) => u.kind === "asset" && /^audio\//.test(u.file?.type || "") && !(u.mediaId && audioAssets.some((a) => a.id === u.mediaId)));
  const byId = new Map(media.map((m) => [m.id, m]));

  const addTrack = (m) => onChange((d) => {
    d.audio = [...(d.audio || []), {
      id: newId("au"), media: m.id, start: 0, in: 0,
      duration: Math.max(1, Math.min(m.duration || 0, lay.duration || m.duration || 30)),
      volume: 0.25, fade_in: 1, fade_out: 2,
    }];
  });

  const update = (id, fn, key) => onChange((d) => {
    const a = d.audio.find((x) => x.id === id);
    if (a) fn(a);
  }, key);

  return (
    <div>
      <Section title="Your voice">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon.Wave />
          <div style={{ flex: 1 }}>
            <Range label="Voice volume" value={tl.voice_volume ?? 1} min={0} max={2} step={0.05} onChange={(v) => onChange((d) => { d.voice_volume = v; }, "voice")} />
          </div>
          <span style={{ width: 44, textAlign: "right", fontSize: 12.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{Math.round((tl.voice_volume ?? 1) * 100)}%</span>
        </div>
      </Section>

      <Section title={`Music · ${(tl.audio || []).length}`} right={<Btn size="s" icon={<Icon.Upload size={14} />} onClick={() => input.current?.click()}>Upload</Btn>}>
        {!(tl.audio || []).length && (
          <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: "0 0 10px", lineHeight: 1.6 }}>
            Add a track that's yours to use. MP3, M4A or WAV. It plays under your voice at a quarter volume.
          </p>
        )}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {(tl.audio || []).map((a) => {
            const m = byId.get(a.media);
            return (
              <li key={a.id} style={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)", padding: "10px 12px", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon.Music />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m?.filename || "Music"}
                  </span>
                  <Btn size="s" kind="quiet" aria-label="Remove track" icon={<Icon.Trash />} onClick={() => onChange((d) => { d.audio = d.audio.filter((x) => x.id !== a.id); })} style={{ padding: 6 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-mute)", width: 48 }}>Volume</span>
                  <div style={{ flex: 1 }}>
                    <Range label="Music volume" value={a.volume} min={0} max={1} step={0.05} onChange={(v) => update(a.id, (x) => { x.volume = v; }, `vol:${a.id}`)} />
                  </div>
                  <span style={{ width: 40, textAlign: "right", fontSize: 12.5, fontWeight: 600 }}>{Math.round(a.volume * 100)}%</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
                  <Nudge label="Starts" value={a.start} step={0.5} min={0} max={Math.max(0, lay.duration - 0.5)} onChange={(v) => update(a.id, (x) => { x.start = v; }, `st:${a.id}`)} />
                  <Nudge label="Lasts" value={a.duration} step={1} min={1} max={Math.max(1, (m?.duration || 600) - (a.in || 0))} format={(v) => fmtTime(v, false)} onChange={(v) => update(a.id, (x) => { x.duration = v; }, `du:${a.id}`)} />
                  <Nudge label="From" value={a.in || 0} step={1} min={0} max={Math.max(0, (m?.duration || 0) - 1)} format={(v) => fmtTime(v, false)} onChange={(v) => update(a.id, (x) => { x.in = v; }, `in:${a.id}`)} />
                  <Nudge label="Fade in" value={a.fade_in} step={0.5} min={0} max={10} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => update(a.id, (x) => { x.fade_in = v; }, `fi:${a.id}`)} />
                  <Nudge label="Fade out" value={a.fade_out} step={0.5} min={0} max={10} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => update(a.id, (x) => { x.fade_out = v; }, `fo:${a.id}`)} />
                </div>
                <Btn size="s" onClick={() => update(a.id, (x) => { x.start = Math.round(time * 10) / 10; })} style={{ justifySelf: "start" }}>Start at playhead ({fmtTime(time)})</Btn>
              </li>
            );
          })}
        </ul>
      </Section>

      {(audioAssets.length > 0 || pending.length > 0) && (
        <Section title="Uploaded audio">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {pending.map((u) => (
              <li key={u.key} style={row}>
                <Icon.Music />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                  {u.status === "failed"
                    ? <span style={{ fontSize: 12, color: "var(--bad)" }}>{u.error}</span>
                    : <span style={{ display: "block", marginTop: 5 }}><Bar value={u.progress} /></span>}
                </span>
                {u.status === "failed" && <><Btn size="s" onClick={() => onRetryUpload(u.key)}>Retry</Btn><Btn size="s" kind="quiet" aria-label="Dismiss" onClick={() => onDismissUpload(u.key)} icon={<Icon.Close size={13} />} /></>}
              </li>
            ))}
            {audioAssets.map((m) => (
              <li key={m.id} style={row}>
                <Icon.Music />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.filename}
                  <span style={{ color: "var(--ink-mute)" }}>{m.status === "ready" ? ` · ${fmtTime(m.duration, false)}` : ""}</span>
                </span>
                {m.status === "ready" && <Btn size="s" icon={<Icon.Plus />} onClick={() => addTrack(m)}>Add</Btn>}
                {(m.status === "processing" || m.status === "uploaded") && <Spinner size={13} />}
                {m.status === "failed" && <span style={{ fontSize: 12, color: "var(--bad)" }}>{m.error || "Couldn't read"}</span>}
                {m.status !== "processing" && m.status !== "uploaded" && (
                  <Btn size="s" kind="quiet" aria-label={`Delete ${m.filename}`} icon={<Icon.Trash />} onClick={() => onRemoveMedia(m.id)} style={{ padding: 6 }} />
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <input
        ref={input}
        type="file"
        accept=".mp3,.m4a,.aac,.wav,.ogg,audio/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          e.target.value = "";
          if (list.length) onAddFiles(list.slice(0, 1), "asset", { onMedia: (mediaId) => onAssignWhenReady({ type: "audio", media: mediaId }) });
        }}
      />
    </div>
  );
}

const row = { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)" };
