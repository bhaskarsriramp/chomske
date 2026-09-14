import { useRef, useState } from "react";
import { Btn, Bar, Icon, Nudge, Section, Segmented, Spinner, fmtTime } from "./ui";
import { anchorAt, newId } from "./model";

/**
 * B-roll: the slots the shot list planned, and the files that fill them.
 *
 * ── THE PLAN ARRIVES FILLED IN, THE FOOTAGE DOES NOT ─────────────────────────
 * Every cutaway the shoot pack named is already a slot on the right line, with
 * what it should show and where to get it. What is left for the creator is the
 * part only they can do: find the screenshot, and drop it in. Slots with nothing
 * in them still show in the preview as a label, so an unfilled plan is visible
 * rather than silently becoming no B-roll at all.
 */
export default function BrollPanel({
  tl, lay, mediaById, media, uploads, checklist = [], time,
  selectedId, onSelect, onChange, onSeek, onAddFiles, onRetryUpload, onDismissUpload, onRemoveMedia,
  onAssignWhenReady, config, isNarrow,
}) {
  const [picking, setPicking] = useState(null);
  const slotUpload = useRef(null);
  const libraryUpload = useRef(null);
  const uploadFor = useRef(null);

  const placed = new Map(lay.broll.map((b) => [b.id, b]));
  const clipsById = new Map(lay.clips.map((c) => [c.id, c]));
  const assets = media.filter((m) => m.kind === "asset" && (m.type === "image" || m.type === "video"));
  const pending = uploads.filter((u) => u.kind === "asset" && !/^audio\//.test(u.file?.type || "") && !(u.mediaId && assets.some((a) => a.id === u.mediaId)));
  const slots = [...(tl.broll || [])].sort((a, b) => (placed.get(a.id)?.start ?? 1e9) - (placed.get(b.id)?.start ?? 1e9));
  const filled = slots.filter((s) => s.media).length;

  const update = (id, fn, key) => onChange((d) => {
    const b = d.broll.find((x) => x.id === id);
    if (b) fn(b, d);
  }, key);

  const assign = (slotId, mediaId) => {
    const m = mediaById.get(mediaId);
    update(slotId, (b) => {
      b.media = mediaId;
      b.media_in = 0;
      if (m?.type === "video" && m.duration) b.duration = Math.min(b.duration, m.duration);
    });
    setPicking(null);
  };

  const addAtPlayhead = () => {
    const at = anchorAt(lay, time);
    if (!at) return;
    const id = newId("br");
    const remaining = at.clip.end - at.clip.start - at.offset;
    onChange((d) => {
      d.broll.push({ id, shot: null, label: "B-roll", source: "", clip: at.clip.id, offset: Math.round(at.offset * 10) / 10, duration: Math.max(0.5, Math.min(3, remaining)), media: null, media_in: 0, fit: "contain" });
    });
    onSelect(id);
    setPicking(id);
  };

  const moveToPlayhead = (id) => {
    const at = anchorAt(lay, time);
    if (!at) return;
    update(id, (b) => { b.clip = at.clip.id; b.offset = Math.round(at.offset * 10) / 10; });
  };

  const files = (e, handler) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (list.length) handler(list);
  };

  return (
    <div>
      {checklist.length > 0 && (
        <details style={{ marginBottom: 14, borderRadius: 10, border: "1px solid var(--made-line)", background: "var(--made-tint)" }}>
          <summary style={{ cursor: "pointer", padding: "9px 12px", fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>
            Your shot list said to have these ready · {checklist.length}
          </summary>
          <ul style={{ margin: 0, padding: "0 12px 10px 30px", fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-body)" }}>
            {checklist.map((c, i) => (
              <li key={i}>{c.item}{c.note ? <span style={{ color: "var(--ink-mute)" }}> · {c.note}</span> : null}</li>
            ))}
          </ul>
        </details>
      )}

      <Section
        title={`Slots · ${filled} of ${slots.length} filled`}
        right={<Btn size="s" icon={<Icon.Plus />} onClick={addAtPlayhead} disabled={!lay.duration}>Add at playhead</Btn>}
      >
        {!slots.length && (
          <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0, lineHeight: 1.6 }}>
            No cutaways planned for this script. Move the playhead to where you want one and press Add at playhead.
          </p>
        )}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {slots.map((s) => {
            const on = s.id === selectedId;
            const pos = placed.get(s.id);
            const clip = clipsById.get(s.clip);
            const m = s.media ? mediaById.get(s.media) : null;
            const clipLen = clip && clip.start !== null ? clip.end - clip.start : 0;
            return (
              <li key={s.id}>
                <div
                  onClick={() => { onSelect(s.id); if (pos?.start !== null && pos?.start !== undefined) onSeek(pos.start); }}
                  style={{ borderRadius: 12, border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`, background: "var(--card)", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", gap: 10, padding: "10px 12px", alignItems: "center" }}>
                    <span style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", flexShrink: 0, display: "grid", placeItems: "center", background: m ? "#000" : "var(--made-tint)", color: "var(--made)", border: m ? "none" : "1px dashed #CFCBC4" }}>
                      {m ? <img src={m.thumb_url || m.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon.Camera size={18} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--ink)", lineHeight: 1.35 }}>{s.label || "B-roll"}</div>
                      {s.source && <div style={{ fontSize: 12, color: "var(--ink-body)", lineHeight: 1.45 }}>{s.source}</div>}
                      <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2 }}>
                        {clip?.line ? `Line ${clip.line}` : "Extra clip"}
                        {pos?.start !== null && pos?.start !== undefined ? ` · ${fmtTime(pos.start, false)}–${fmtTime(pos.end, false)}` : " · its line is turned off"}
                      </div>
                    </div>
                    {!m && (
                      <Btn size="s" kind={picking === s.id ? "primary" : "ghost"} onClick={(e) => { e.stopPropagation(); onSelect(s.id); setPicking(picking === s.id ? null : s.id); }}>
                        {picking === s.id ? "Pick below" : "Add"}
                      </Btn>
                    )}
                  </div>

                  {on && (
                    <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid var(--line)", padding: "10px 12px 12px", display: "grid", gap: 10, cursor: "default" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <Btn size="s" icon={<Icon.Image />} onClick={() => setPicking(picking === s.id ? null : s.id)}>
                          {m ? "Change" : "From library"}
                        </Btn>
                        <Btn size="s" icon={<Icon.Upload size={14} />} onClick={() => { uploadFor.current = s.id; slotUpload.current?.click(); }}>Upload</Btn>
                        {m && <Btn size="s" onClick={() => update(s.id, (b) => { b.media = null; b.media_in = 0; })}>Clear</Btn>}
                        <Btn size="s" onClick={() => moveToPlayhead(s.id)} disabled={!lay.duration}>Move to playhead</Btn>
                        <Btn size="s" kind="danger" icon={<Icon.Trash />} onClick={() => onChange((d) => { d.broll = d.broll.filter((b) => b.id !== s.id); })}>Delete</Btn>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center" }}>
                        <Nudge label="Starts" value={s.offset} step={0.5} min={0} max={Math.max(0, clipLen - 0.3)} format={(v) => `+${v.toFixed(1)}s`} onChange={(v) => update(s.id, (b) => { b.offset = v; }, `off:${s.id}`)} />
                        <Nudge label="Lasts" value={s.duration} step={0.5} min={0.5} max={m?.type === "video" ? Math.max(0.5, (m.duration || 0) - (s.media_in || 0)) : 60} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => update(s.id, (b) => { b.duration = v; }, `dur:${s.id}`)} />
                        {m?.type === "video" && (
                          <Nudge label="From" value={s.media_in || 0} step={0.5} min={0} max={Math.max(0, (m.duration || 0) - 0.5)} onChange={(v) => update(s.id, (b) => { b.media_in = v; }, `min:${s.id}`)} />
                        )}
                      </div>
                      {m && (
                        <Segmented
                          size="s"
                          label="Fit"
                          value={s.fit}
                          onChange={(v) => update(s.id, (b) => { b.fit = v; })}
                          options={[
                            { value: "contain", label: "Show all of it", title: "The whole image, over a blurred copy. Best for screenshots." },
                            { value: "cover", label: "Fill the frame", title: "Cropped to fill. Best for footage." },
                          ]}
                        />
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title={`Library · ${assets.length}`}
        right={<Btn size="s" icon={<Icon.Upload size={14} />} onClick={() => libraryUpload.current?.click()}>Upload</Btn>}
      >
        {picking && (
          <div style={{ fontSize: 12.5, color: "var(--ink)", background: "var(--made-tint)", border: "1px solid var(--made-line)", borderRadius: 9, padding: "7px 10px", marginBottom: 8 }}>
            Tap an image or clip to put it in the slot.{" "}
            <button type="button" onClick={() => setPicking(null)} style={{ border: "none", background: "none", padding: 0, font: "inherit", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>Cancel</button>
          </div>
        )}
        {!assets.length && !pending.length && (
          <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0, lineHeight: 1.6 }}>
            Screenshots, logos, product shots and clips you upload appear here. JPG, PNG, WebP, MP4 or MOV.
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${isNarrow ? 3 : 4}, minmax(0,1fr))`, gap: 8 }}>
          {pending.map((u) => (
            <div key={u.key} style={tile}>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 8, textAlign: "center" }}>
                {u.status === "failed" ? (
                  <span style={{ fontSize: 11, color: "var(--bad)", lineHeight: 1.35 }}>
                    Failed
                    <span style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
                      <Btn size="s" onClick={() => onRetryUpload(u.key)} style={{ padding: "3px 7px", minHeight: 0 }}>Retry</Btn>
                      <Btn size="s" kind="quiet" onClick={() => onDismissUpload(u.key)} aria-label="Dismiss" style={{ padding: "3px 5px", minHeight: 0 }} icon={<Icon.Close size={12} />} />
                    </span>
                  </span>
                ) : (
                  <span style={{ width: "80%" }}>
                    <span style={{ display: "block", fontSize: 11, color: "var(--ink-mute)", marginBottom: 5 }}>{Math.round(u.progress * 100)}%</span>
                    <Bar value={u.progress} />
                  </span>
                )}
              </div>
            </div>
          ))}
          {assets.map((a) => {
            const ready = a.status === "ready";
            return (
              <div key={a.id} style={{ ...tile, outline: picking && ready ? "2px solid var(--ink)" : "none", cursor: picking && ready ? "pointer" : "default" }}
                onClick={() => { if (picking && ready) assign(picking, a.id); }}
              >
                {ready && (a.thumb_url || a.image_url) && <img src={a.thumb_url || a.image_url} alt={a.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                {!ready && (
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 6, textAlign: "center", fontSize: 11, color: a.status === "failed" ? "var(--bad)" : "var(--ink-mute)" }}>
                    {a.status === "failed" ? a.error || "Couldn't read" : <Spinner size={14} />}
                  </div>
                )}
                <span style={{ position: "absolute", left: 5, bottom: 5, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 5, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 10.5 }}>
                  {a.type === "video" ? <><Icon.Camera size={10} /> {fmtTime(a.duration, false)}</> : <Icon.Image size={10} />}
                </span>
                {!picking && a.status !== "processing" && a.status !== "uploaded" && (
                  <button
                    type="button"
                    aria-label={`Delete ${a.filename}`}
                    onClick={(e) => { e.stopPropagation(); onRemoveMedia(a.id); }}
                    style={{ position: "absolute", right: 4, top: 4, width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(0,0,0,.55)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}
                  >
                    <Icon.Close size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <input ref={libraryUpload} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.m4v,.webm" style={{ display: "none" }} onChange={(e) => files(e, (list) => onAddFiles(list, "asset"))} />
      <input
        ref={slotUpload}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.m4v,.webm"
        style={{ display: "none" }}
        onChange={(e) => files(e, (list) => {
          const slot = uploadFor.current;
          onAddFiles(list.slice(0, 1), "asset", { onMedia: (mediaId) => onAssignWhenReady({ type: "broll", slot, media: mediaId }) });
        })}
      />
    </div>
  );
}

const tile = {
  position: "relative", aspectRatio: "1 / 1", borderRadius: 9, overflow: "hidden",
  background: "#ECEAE6", border: "1px solid var(--line)",
};
