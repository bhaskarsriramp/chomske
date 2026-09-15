import { useRef, useState } from "react";
import { Btn, Bar, Icon, Nudge, Range, Section, Segmented, Spinner, fmtTime } from "./ui";
import { ASPECTS, anchorAt, newId, fitFor, splitPanes } from "./model";

/**
 * B-roll: photos and clips over the creator's video, and the files they come from.
 *
 * ── THREE WAYS TO SHOW ONE ───────────────────────────────────────────────────
 *   Full screen   replaces the picture for a moment: stock footage, a product.
 *   Split screen  takes one part of the frame, the creator keeps the other:
 *                 an article, a table, a tweet, read out while they talk.
 *   Overlay       sits on the picture, dragged and resized on the preview:
 *                 a logo, a price tag, a transparent "VALID TILL" graphic.
 *
 * ── A SCRIPT'S PLAN ARRIVES FILLED IN, THE FOOTAGE DOES NOT ───────────────────
 * For a video cut to a script, every cutaway the shoot pack named is already a
 * slot on the right line, with what it should show and where to get it. Slots
 * with nothing in them still show in the preview as a label, so an unfilled plan
 * is visible rather than silently becoming no B-roll at all.
 */
export default function BrollPanel({
  tl, lay, mediaById, media, uploads, checklist = [], time, waiting = {}, term = "B-roll",
  selectedId, onSelect, onChange, onSeek, onAddFiles, onRetryUpload, onDismissUpload, onRemoveMedia,
  onAssignWhenReady, onUploadAt, isNarrow,
}) {
  const [picking, setPicking] = useState(null);
  const slotUpload = useRef(null);
  const libraryUpload = useRef(null);
  const newUpload = useRef(null);
  const uploadFor = useRef(null);
  const [W, H] = ASPECTS[tl.aspect] || ASPECTS["9:16"];
  const across = W > H;

  const placed = new Map(lay.broll.map((b) => [b.id, b]));
  const clipsById = new Map(lay.clips.map((c) => [c.id, c]));
  const assets = media.filter((m) => m.kind === "asset" && (m.type === "image" || m.type === "video"));
  const readyAssets = assets.filter((a) => a.status === "ready");
  const pending = uploads.filter((u) => u.kind === "asset" && !/^audio\//.test(u.file?.type || "") && !(u.mediaId && assets.some((a) => a.id === u.mediaId)));
  const slots = [...(tl.broll || [])].sort((a, b) => (placed.get(a.id)?.start ?? 1e9) - (placed.get(b.id)?.start ?? 1e9));
  const filled = slots.filter((s) => s.media).length;

  const update = (id, fn, key) => onChange((d) => {
    const b = d.broll.find((x) => x.id === id);
    if (b) fn(b, d);
  }, key);

  const boxOf = (b) => (b.layout === "split" ? splitPanes(b, W, H).broll : { w: W, h: H });

  const assign = (slotId, mediaId) => {
    const m = mediaById.get(mediaId);
    update(slotId, (b) => {
      b.media = mediaId;
      b.media_in = 0;
      if (!b.label || b.label === "B-roll" || b.label === "Media") b.label = nameOf(m?.filename);
      const box = boxOf(b);
      b.fit = fitFor(m, box.w, box.h);
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
      d.broll.push({
        id, shot: null, label: term, source: "", clip: at.clip.id, offset: Math.round(at.offset * 10) / 10,
        duration: Math.max(0.5, Math.min(3, remaining)), media: null, media_in: 0, fit: "contain",
        layout: "full", side: "top", ratio: 0.5, x: null, y: null, w: null,
      });
    });
    onSelect(id);
    setPicking(id);
  };

  const setLayout = (s, m, layoutKind) => update(s.id, (b) => {
    b.layout = layoutKind;
    if (layoutKind === "pip") {
      if (b.w === null || b.w === undefined) b.w = 0.6;
      if (b.x === null || b.x === undefined) b.x = 0.5;
      if (b.y === null || b.y === undefined) b.y = 0.32;
    } else {
      const box = boxOf(b);
      b.fit = fitFor(m, box.w, box.h);
    }
  });

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
        title={slots.length ? `On your video · ${filled} of ${slots.length} filled` : "On your video"}
        right={
          <span style={{ display: "flex", gap: 6 }}>
            <Btn size="s" kind="primary" icon={<Icon.Upload size={14} />} onClick={() => newUpload.current?.click()} disabled={!lay.duration}>
              {term === "Media" ? "Add media" : "Add"} at {fmtTime(time, false)}
            </Btn>
            {readyAssets.length > 0 && <Btn size="s" onClick={addAtPlayhead} disabled={!lay.duration}>From library</Btn>}
          </span>
        }
      >
        {!slots.length && (
          <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0, lineHeight: 1.6 }}>
            Move the playhead to the moment you talk about something, then add a photo or a clip there.
            Show it full screen, split the screen with it, or put it on top of your video and drag it into place.
            {!isNarrow && ` You can also click the ${term} row of the timeline.`}
          </p>
        )}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {slots.map((s) => {
            const on = s.id === selectedId;
            const pos = placed.get(s.id);
            const clip = clipsById.get(s.clip);
            const m = s.media ? mediaById.get(s.media) : null;
            const clipLen = clip && clip.start !== null ? clip.end - clip.start : 0;
            const kind = s.layout || "full";
            const inFlight = !m && waiting[s.id];
            return (
              <li key={s.id}>
                <div
                  onClick={() => { onSelect(s.id); if (pos?.start !== null && pos?.start !== undefined) onSeek(pos.start + 0.01); }}
                  style={{ borderRadius: 12, border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`, background: "var(--card)", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", gap: 10, padding: "10px 12px", alignItems: "center" }}>
                    <span style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", flexShrink: 0, display: "grid", placeItems: "center", background: m ? "#000" : "var(--made-tint)", color: "var(--made)", border: m ? "none" : "1px dashed #CFCBC4" }}>
                      {m ? <img src={m.thumb_url || m.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : inFlight ? <Spinner size={16} /> : <Icon.Camera size={18} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--ink)", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis" }}>{s.label || term}</div>
                      {s.source && <div style={{ fontSize: 12, color: "var(--ink-body)", lineHeight: 1.45 }}>{s.source}</div>}
                      <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2 }}>
                        {inFlight ? "Uploading…" : m ? { full: "Full screen", split: "Split screen", pip: "Overlay" }[kind] : clip?.line ? `Line ${clip.line}` : "Empty"}
                        {pos?.start !== null && pos?.start !== undefined ? ` · ${fmtTime(pos.start, false)}–${fmtTime(pos.end, false)}` : " · its part is turned off"}
                      </div>
                    </div>
                    {!m && !inFlight && (
                      <Btn size="s" kind={picking === s.id ? "primary" : "ghost"} onClick={(e) => { e.stopPropagation(); onSelect(s.id); setPicking(picking === s.id ? null : s.id); }}>
                        {picking === s.id ? "Pick below" : "Add"}
                      </Btn>
                    )}
                  </div>

                  {on && (
                    <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid var(--line)", padding: "10px 12px 12px", display: "grid", gap: 12, cursor: "default" }}>
                      {m && (
                        <div>
                          <div style={label}>Show it</div>
                          <div role="group" aria-label="How to show it" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6 }}>
                            {[
                              ["full", "Full screen", Icon.Full, "Replaces your video for a moment"],
                              ["split", "Split screen", Icon.Split, "Shares the screen with you"],
                              ["pip", "Overlay", Icon.Overlay, "Sits on your video. Drag and resize it on the preview"],
                            ].map(([v, text, LayoutIcon, title]) => {
                              const active = kind === v;
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  aria-pressed={active}
                                  title={title}
                                  onClick={() => setLayout(s, m, v)}
                                  style={{
                                    display: "grid", justifyItems: "center", gap: 4, padding: "8px 4px", borderRadius: 10, cursor: "pointer",
                                    border: `1.5px solid ${active ? "var(--ink)" : "var(--line)"}`, background: active ? "var(--made-tint)" : "var(--card)",
                                    color: active ? "var(--ink)" : "var(--ink-body)", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                                  }}
                                >
                                  <span style={across ? { transform: "rotate(-90deg)" } : undefined}><LayoutIcon size={22} /></span>
                                  {text}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {m && kind === "split" && (
                        <div style={{ display: "grid", gap: 8 }}>
                          <Segmented
                            size="s"
                            label="Which part"
                            value={s.side === "bottom" ? "bottom" : "top"}
                            onChange={(v) => update(s.id, (b) => { b.side = v; })}
                            options={[
                              { value: "top", label: across ? `${term} left, you right` : `${term} on top, you below` },
                              { value: "bottom", label: across ? `You left, ${term.toLowerCase()} right` : `You on top, ${term.toLowerCase()} below` },
                            ]}
                          />
                          <SliderRow label={`${term} takes`} value={s.ratio ?? 0.5} min={0.3} max={0.7} step={0.05} onChange={(v) => update(s.id, (b) => { b.ratio = v; }, `ratio:${s.id}`)} />
                        </div>
                      )}

                      {m && kind === "pip" && (
                        <div style={{ display: "grid", gap: 8 }}>
                          <SliderRow label="Size" value={s.w ?? 0.6} min={0.15} max={1} step={0.05} onChange={(v) => update(s.id, (b) => { b.w = v; }, `w:${s.id}`)} />
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ flex: "1 1 180px", fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.5 }}>
                              Drag it on the video to move it. Pull its yellow corner to resize.
                            </span>
                            <Btn size="s" onClick={() => update(s.id, (b) => { b.x = 0.5; b.y = 0.5; })}>Centre it</Btn>
                          </div>
                        </div>
                      )}

                      {m && kind !== "pip" && (
                        <Segmented
                          size="s"
                          label="Fit"
                          value={s.fit}
                          onChange={(v) => update(s.id, (b) => { b.fit = v; })}
                          options={[
                            { value: "contain", label: "Show all of it", title: "The whole picture, over a blurred copy. Best for screenshots and tables." },
                            { value: "cover", label: "Fill the space", title: "Cropped to fill. Best for footage." },
                          ]}
                        />
                      )}

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center" }}>
                        <Nudge label="Starts" value={s.offset} step={0.5} min={0} max={Math.max(0, clipLen - 0.3)} format={(v) => `+${v.toFixed(1)}s`} onChange={(v) => update(s.id, (b) => { b.offset = v; }, `off:${s.id}`)} />
                        <Nudge label="Lasts" value={s.duration} step={0.5} min={0.5} max={m?.type === "video" ? Math.max(0.5, (m.duration || 0) - (s.media_in || 0)) : 60} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => update(s.id, (b) => { b.duration = v; }, `dur:${s.id}`)} />
                        {m?.type === "video" && (
                          <Nudge label="From" value={s.media_in || 0} step={0.5} min={0} max={Math.max(0, (m.duration || 0) - 0.5)} onChange={(v) => update(s.id, (b) => { b.media_in = v; }, `min:${s.id}`)} />
                        )}
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <Btn size="s" icon={<Icon.Image />} onClick={() => setPicking(picking === s.id ? null : s.id)}>
                          {m ? "Change" : "From library"}
                        </Btn>
                        <Btn size="s" icon={<Icon.Upload size={14} />} onClick={() => { uploadFor.current = s.id; slotUpload.current?.click(); }}>Upload</Btn>
                        {m && <Btn size="s" onClick={() => update(s.id, (b) => { b.media = null; b.media_in = 0; })}>Clear</Btn>}
                        <Btn size="s" onClick={() => { const at = anchorAt(lay, time); if (at) update(s.id, (b) => { b.clip = at.clip.id; b.offset = Math.round(at.offset * 10) / 10; }); }} disabled={!lay.duration}>Move to playhead</Btn>
                        <Btn size="s" kind="danger" icon={<Icon.Trash />} onClick={() => onChange((d) => { d.broll = d.broll.filter((b) => b.id !== s.id); })}>Delete</Btn>
                      </div>
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
            Tap an image or clip to use it.{" "}
            <button type="button" onClick={() => setPicking(null)} style={{ border: "none", background: "none", padding: 0, font: "inherit", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>Cancel</button>
          </div>
        )}
        {!assets.length && !pending.length && (
          <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0, lineHeight: 1.6 }}>
            Screenshots, logos, product shots and clips you upload appear here. JPG, PNG (transparent ones too), WebP, MP4 or MOV.
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
                    <span style={{ display: "block", fontSize: 11, color: "var(--ink-mute)", marginBottom: 5 }}>
                      {u.waiting ? `Offline · ${Math.round(u.progress * 100)}%` : `${Math.round(u.progress * 100)}%`}
                    </span>
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

      <input ref={libraryUpload} type="file" multiple accept={IMAGE_OR_VIDEO} style={{ display: "none" }} onChange={(e) => files(e, (list) => onAddFiles(list, "asset"))} />
      <input ref={newUpload} type="file" accept={IMAGE_OR_VIDEO} style={{ display: "none" }} onChange={(e) => files(e, (list) => onUploadAt(time, list))} />
      <input
        ref={slotUpload}
        type="file"
        accept={IMAGE_OR_VIDEO}
        style={{ display: "none" }}
        onChange={(e) => files(e, (list) => {
          const slot = uploadFor.current;
          onAddFiles(list.slice(0, 1), "asset", { onMedia: (mediaId) => onAssignWhenReady({ type: "broll", slot, media: mediaId }) });
        })}
      />
    </div>
  );
}

export const IMAGE_OR_VIDEO = ".jpg,.jpeg,.png,.webp,.mp4,.mov,.m4v,.webm";

export const nameOf = (filename) => String(filename || "B-roll").replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 120) || "B-roll";

function SliderRow({ label: text, value, min, max, step, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--ink-mute)", width: 78, flexShrink: 0 }}>{text}</span>
      <div style={{ flex: 1 }}>
        <Range label={text} value={value} min={min} max={max} step={step} onChange={onChange} />
      </div>
      <span style={{ width: 40, textAlign: "right", fontSize: 12.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{Math.round(value * 100)}%</span>
    </div>
  );
}

const label = { fontSize: 12, color: "var(--ink-mute)", marginBottom: 6 };

const tile = {
  position: "relative", aspectRatio: "1 / 1", borderRadius: 9, overflow: "hidden",
  background: "#ECEAE6", border: "1px solid var(--line)",
};
