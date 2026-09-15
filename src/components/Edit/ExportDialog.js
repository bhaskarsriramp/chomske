import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import useOnline from "../../hooks/useOnline";
import { useCredits } from "../../state/CreditsContext";
import { startRender, renderDownloadUrl, deleteRender } from "./editApi";
import { ASPECTS, segmentsOf } from "./model";
import { Btn, Bar, Icon, Notice, Section, Segmented, Switch, fmtBytes, fmtTime } from "./ui";

/**
 * Export: the settings, the price, the last check, and the files.
 *
 * ── THE PRICE SHOWN IS THE PRICE CHARGED ─────────────────────────────────────
 * Export is priced from the SAVED edit's length, times what the settings cost
 * (1440p, 4K and 50/60 fps are multiples of the base price; the multipliers
 * come from the server's /edit/config). Pressing Export first saves whatever is
 * still pending; if that save changed the price, nothing is charged and the new
 * price is put on the button to be pressed again. The server enforces the same
 * rule (expected_cost).
 *
 * ── THE LAST CHECK IS ABOUT WHAT IS MISSING ──────────────────────────────────
 * Empty B-roll slots export as the creator talking, which may be fine, and is
 * worth one line before paying rather than after watching the result. A server
 * that reports an older export engine than this page was built for would draw
 * the edit without its captions and media, so that is said first, loudly.
 */

/** The export engine this page expects (backend/services/edit/exportOptions.js EXPORT_ENGINE). */
export const EXPORT_ENGINE = 3;

const DEFAULTS = { resolution: 1080, fps: 30, video_mbps: 0, audio_kbps: 192, codec: "h264", speed: "fast", loudness: false, captions: "burn", srt: false };
const FALLBACK = {
  engine: 0,
  resolutions: [720, 1080],
  frame_rates: [24, 25, 30, 50, 60],
  video_mbps: [0, 2, 4, 8, 12, 16, 25, 40, 60],
  audio_kbps: [128, 192, 256, 320],
  codecs: ["h264"],
  speeds: ["fast", "balanced", "best"],
  multipliers: { r1440: 1.5, r2160: 2, high_fps: 1.5 },
  defaults: DEFAULTS,
};
const STORE = "hg-export-options";
const RES_LABEL = { 720: "720p", 1080: "1080p", 1440: "1440p", 2160: "4K" };
// Rough sizes for "Auto", which is constant quality and so has no fixed bitrate.
const TYPICAL_MBPS = { 720: 3, 1080: 6, 1440: 12, 2160: 25 };
// YouTube's recommended upload bitrates for SDR at 24–30 fps (half as much again at 50/60).
const SUGGESTED_MBPS = { 720: 5, 1080: 8, 1440: 16, 2160: 40 };

const PRESETS = [
  { id: "social", label: "Shorts & Reels", sub: "1080p · 30 fps", set: { resolution: 1080, fps: 30, video_mbps: 0, audio_kbps: 192, codec: "h264", speed: "fast" } },
  { id: "youtube", label: "YouTube HQ", sub: "1440p · 30 fps", set: { resolution: 1440, fps: 30, video_mbps: 0, audio_kbps: 256, codec: "h264", speed: "balanced" } },
  { id: "best", label: "Best quality", sub: "4K · 60 fps", set: { resolution: 2160, fps: 60, video_mbps: 0, audio_kbps: 320, codec: "h264", speed: "balanced" } },
  { id: "small", label: "Small file", sub: "720p · for WhatsApp", set: { resolution: 720, fps: 30, video_mbps: 2, audio_kbps: 128, codec: "h264", speed: "balanced" } },
];

function cleanOptions(o, cfg) {
  const has = (list, v) => list.includes(Number(v));
  const top = Math.max(...cfg.resolutions);
  return {
    resolution: has(cfg.resolutions, o?.resolution) ? Number(o.resolution) : Math.min(DEFAULTS.resolution, top),
    fps: has(cfg.frame_rates, o?.fps) ? Number(o.fps) : DEFAULTS.fps,
    video_mbps: has(cfg.video_mbps, o?.video_mbps) ? Number(o.video_mbps) : 0,
    audio_kbps: has(cfg.audio_kbps, o?.audio_kbps) ? Number(o.audio_kbps) : DEFAULTS.audio_kbps,
    codec: cfg.codecs.includes(o?.codec) ? o.codec : "h264",
    speed: cfg.speeds.includes(o?.speed) ? o.speed : "fast",
    loudness: o?.loudness === true,
    captions: o?.captions === "none" ? "none" : "burn",
    srt: o?.srt === true,
  };
}

/** The same multiplier the server charges (exportOptions.js exportMultiplier). */
function multiplier(o, m) {
  let k = 1;
  if (o.resolution >= 2160) k *= m.r2160;
  else if (o.resolution >= 1440) k *= m.r1440;
  if (o.fps > 30) k *= m.high_fps;
  return k;
}
const priceOf = (base, o, m) => Math.ceil(base * multiplier(o, m) - 1e-9);

const even = (n) => Math.max(2, 2 * Math.round(n / 2));
const pixels = (aspect, res) => {
  const [w, h] = ASPECTS[aspect] || ASPECTS["9:16"];
  return [even((w * res) / 1080), even((h * res) / 1080)];
};

function readStored() {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) || "null");
  } catch {
    return null;
  }
}

export default function ExportDialog({ project, tl, lay, price, config, languages = [], nativeLabel = "", term = "B-roll", priceNow, onFlush, onAspect, onData, onClose }) {
  const isPhone = useIsMobile(600);
  const online = useOnline();
  const { balance, setBalance, openBuy, canBuy } = useCredits();
  const cfg =useMemo(() => ({ ...FALLBACK, ...(config?.export || {}) }), [config]);
  const [opts, setOpts] = useState(() => cleanOptions({ ...DEFAULTS, ...(config?.export?.defaults || {}), ...(readStored() || {}) }, { ...FALLBACK, ...(config?.export || {}) }));
  const [base, setBase] = useState(price);
  const [pinned, setPinned] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const closeRef = useRef(null);

  useEffect(() => { setBase(price); }, [price]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => { setOpts((o) => cleanOptions(o, cfg)); }, [cfg]);
  useEffect(() => {
    try { window.localStorage.setItem(STORE, JSON.stringify(opts)); } catch { /* private mode */ }
  }, [opts]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][aria-label="Buy credits"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (fields) => {
    setNote("");
    setOpts((o) => cleanOptions({ ...o, ...fields }, cfg));
  };

  const key = JSON.stringify(opts);
  const shown = pinned && pinned.key === key && pinned.base === base ? pinned.cost : priceOf(base, opts, cfg.multipliers);
  const renders = [...(project.renders || [])].reverse();
  const running = renders.find((r) => r.status === "queued" || r.status === "rendering");
  const emptySlots = lay.broll.filter((b) => b.start !== null && !b.media).length;
  const slots = lay.broll.filter((b) => b.start !== null).length;
  const tooExpensive = typeof balance === "number" && shown > balance;
  const cap = tl.captions || {};
  const hasCaptions = cap.mode !== "off" && (segmentsOf(tl).length > 0 || cap.source === "script");
  const captionWords = cap.mode === "off"
    ? "off"
    : opts.captions === "none"
    ? "left out of the video"
    : cap.mode === "tr"
    ? `${languages.find((l) => l.code === cap.lang)?.label || cap.lang} (translated), ${cap.style}`
    : `${cap.mode === "roman" ? "Roman" : nativeLabel || "original letters"}, ${cap.style}`;

  const [W, H] = pixels(tl.aspect, opts.resolution);
  const sourceShort = useMemo(() => {
    const used = new Set((tl.clips || []).map((c) => c.media));
    return (project.media || [])
      .filter((m) => m.kind === "recording" && used.has(m.id) && m.width > 0 && m.height > 0)
      .reduce((n, m) => Math.max(n, Math.min(m.width, m.height)), 0);
  }, [project.media, tl.clips]);
  const upscaled = sourceShort > 0 && opts.resolution > sourceShort * 1.05;
  const videoMbps = opts.video_mbps || TYPICAL_MBPS[opts.resolution] * (opts.fps > 30 ? 1.5 : 1) * (opts.codec === "hevc" ? 0.6 : 1);
  const estimate = ((videoMbps * 1e6 + opts.audio_kbps * 1e3) * lay.duration) / 8;
  const suggested = Math.round(SUGGESTED_MBPS[opts.resolution] * (opts.fps > 30 ? 1.5 : 1));
  const stale = !!config && (config.export?.engine || 0) < EXPORT_ENGINE;
  const presetOn = (p) => Object.entries(p.set).every(([k, v]) => opts[k] === (k === "resolution" ? Math.min(v, Math.max(...cfg.resolutions)) : v));
  const m = cfg.multipliers;

  async function go() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const saved = await onFlush();
      if (saved === false) {
        setError("Your latest changes aren't saved yet. Once they are, export again.");
        return;
      }
      const now = priceNow();
      if (now !== base) {
        setBase(now);
        setNote(`Your edit changed, so this export is now ${priceOf(now, opts, m)} credits. Press Export again to confirm.`);
        return;
      }
      const d = await startRender(project.id, shown, opts);
      if (typeof d.balance === "number") setBalance(d.balance);
      onData(d);
    } catch (err) {
      const b = err?.response?.data;
      if (b?.insufficient_credits) setBalance(b.balance);
      else if (b?.price_changed) {
        setPinned({ key, base, cost: b.cost });
        setNote(b.message + " Press Export again to confirm.");
      } else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function download(r, file = "") {
    setError("");
    try {
      window.location.href = await renderDownloadUrl(project.id, r.id, file);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(r) {
    try { onData(await deleteRender(project.id, r.id)); } catch (err) { setError(errorMessage(err)); }
  }

  const label = busy ? "Starting…" : running ? "Export running…" : !online ? "Offline" : tooExpensive ? "Not enough credits" : `Export · ${shown} credit${shown === 1 ? "" : "s"}`;
  const select = {
    width: "100%", fontSize: 13, fontFamily: "inherit", color: "var(--ink)", padding: "8px 10px",
    borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)", minHeight: 36,
  };

  return createPortal(
    <div onClick={onClose} className="hg-fade" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,15,15,.45)", display: "flex", justifyContent: "center", alignItems: isPhone ? "flex-end" : "center", padding: isPhone ? 0 : 18 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export video"
        className="hg-sheet-up hg-scroll"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isPhone ? "100%" : "min(580px, 100%)", maxHeight: isPhone ? "92vh" : "90vh", overflowY: "auto",
          background: "var(--card)", border: "1px solid var(--line)", borderRadius: isPhone ? "16px 16px 0 0" : 16,
          padding: isPhone ? "18px 16px calc(20px + env(safe-area-inset-bottom))" : 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 750, letterSpacing: "-.02em", color: "var(--ink)" }}>Export video</h3>
          <Btn ref={closeRef} aria-label="Close" size="s" onClick={onClose} icon={<Icon.Close size={15} />} style={{ width: 34, height: 34, padding: 0 }} />
        </div>

        {stale && (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="bad">
              The server is running an older version of the editor, so an export now would come out without captions, photos, clips or text.
              Restart the backend server, then export.
            </Notice>
          </div>
        )}

        <Section title="Frame">
          <Segmented
            full
            label="Frame"
            value={tl.aspect}
            onChange={onAspect}
            options={[
              { value: "9:16", label: "9:16 Shorts" },
              { value: "16:9", label: "16:9 YouTube" },
              { value: "1:1", label: "1:1" },
              { value: "4:5", label: "4:5" },
            ]}
          />
        </Section>

        <Section title="Quality">
          <div role="group" aria-label="Quality preset" style={{ display: "grid", gridTemplateColumns: isPhone ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: 6 }}>
            {PRESETS.map((p) => {
              const on = presetOn(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set(p.set)}
                  style={{
                    textAlign: "left", padding: "9px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`, background: on ? "var(--paper)" : "var(--card)",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>{p.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: 2 }}>{p.sub}</div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Video">
          <Field label="Resolution" hint={`${W} × ${H}`}>
            <Segmented
              full
              label="Resolution"
              value={opts.resolution}
              onChange={(v) => set({ resolution: v })}
              options={cfg.resolutions.map((r) => ({ value: r, label: RES_LABEL[r] || `${r}p`, title: pixels(tl.aspect, r).join(" × ") }))}
            />
            {upscaled && (
              <span style={{ fontSize: 12, color: "#8A5A0F" }}>
                Your video was filmed at {sourceShort}p, so {RES_LABEL[opts.resolution]} is scaled up: a bigger file, not more detail.
              </span>
            )}
          </Field>
          <Field label="Frame rate" hint={opts.fps > 30 ? "Smoother only if you filmed at 50 or 60" : ""}>
            <Segmented full label="Frame rate" value={opts.fps} onChange={(v) => set({ fps: v })} options={cfg.frame_rates.map((f) => ({ value: f, label: `${f} fps` }))} />
          </Field>
          <Field label="Video bitrate" hint={`YouTube suggests ${suggested} Mbps here`}>
            <select aria-label="Video bitrate" value={opts.video_mbps} onChange={(e) => set({ video_mbps: Number(e.target.value) })} style={select}>
              {cfg.video_mbps.map((v) => (
                <option key={v} value={v}>{v ? `${v} Mbps` : "Auto: best quality for the size (recommended)"}</option>
              ))}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "1fr 1fr", gap: "0 12px" }}>
            <Field label="Codec">
              <Segmented
                full
                label="Codec"
                value={opts.codec}
                onChange={(v) => set({ codec: v })}
                options={[
                  { value: "h264", label: "H.264", title: "Plays everywhere" },
                  ...(cfg.codecs.includes("hevc") ? [{ value: "hevc", label: "H.265", title: "About 40% smaller, for newer phones and YouTube" }] : []),
                ]}
              />
            </Field>
            <Field label="Encoding">
              <Segmented
                full
                label="Encoding"
                value={opts.speed}
                onChange={(v) => set({ speed: v })}
                options={[
                  { value: "fast", label: "Fast" },
                  { value: "balanced", label: "Balanced", title: "Smaller file, slower export" },
                  { value: "best", label: "Best", title: "Smallest file, slowest export" },
                ]}
              />
            </Field>
          </div>
        </Section>

        <Section title="Audio">
          <Field label="Audio bitrate">
            <Segmented full label="Audio bitrate" value={opts.audio_kbps} onChange={(v) => set({ audio_kbps: v })} options={cfg.audio_kbps.map((k) => ({ value: k, label: `${k} kbps` }))} />
          </Field>
          <Toggle label="Even out the loudness" sub="−14 LUFS, the level YouTube and Instagram play at" on={opts.loudness} onChange={(v) => set({ loudness: v })} />
        </Section>

        <Section title="Captions">
          {!hasCaptions ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "0 0 10px" }}>
              {cap.mode === "off" ? "Captions are turned off in this edit." : "This edit has no captions yet."}
            </p>
          ) : (
            <Field label="In the video">
              <Segmented
                full
                label="Captions in the video"
                value={opts.captions}
                onChange={(v) => set({ captions: v })}
                options={[{ value: "burn", label: "Burned in" }, { value: "none", label: "Leave out" }]}
              />
            </Field>
          )}
          <Toggle label="Subtitle file (.srt)" sub="To upload to YouTube, or to caption the video elsewhere" on={opts.srt} onChange={(v) => set({ srt: v })} />
        </Section>

        <Section title="In this export">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6, fontSize: 13.5, color: "var(--ink-body)" }}>
            <li>
              Length <strong style={{ color: "var(--ink)" }}>{fmtTime(lay.duration, false)}</strong>, {RES_LABEL[opts.resolution]} {opts.fps} fps {opts.codec === "hevc" ? "H.265" : "H.264"} MP4
              <span style={{ color: "var(--ink-mute)" }}> · about {fmtBytes(estimate)}{opts.video_mbps ? "" : ", depending on the picture"}</span>
            </li>
            <li>Captions: <strong style={{ color: "var(--ink)" }}>{captionWords}</strong>{opts.srt ? " · with an .srt file" : ""}</li>
            <li>
              {term}: <strong style={{ color: "var(--ink)" }}>{slots ? `${slots - emptySlots} of ${slots} filled` : "none"}</strong>
              {emptySlots > 0 && <span style={{ color: "#8A5A0F" }}> · empty ones show you talking</span>}
            </li>
            <li>Music: <strong style={{ color: "var(--ink)" }}>{(tl.audio || []).length ? `${tl.audio.length} track${tl.audio.length === 1 ? "" : "s"}` : "none"}</strong>
              {(tl.texts || []).length > 0 && <> · Text: <strong style={{ color: "var(--ink)" }}>{tl.texts.length}</strong></>}
              {opts.loudness && " · loudness evened out"}
            </li>
          </ul>
        </Section>

        {!online && (
          <div style={{ marginBottom: 12 }}>
            <Notice tone="warn">
              You're offline. An export that is already running carries on on our servers, and shows here as soon as you're back.
            </Notice>
          </div>
        )}
        {note && <div style={{ marginBottom: 12 }}><Notice tone="warn">{note}</Notice></div>}
        {error && <div style={{ marginBottom: 12 }}><Notice tone="bad">{error}</Notice></div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn kind="primary" size="l" disabled={busy || !!running || !online || tooExpensive || !(lay.duration > 0)} onClick={go} style={{ flex: isPhone ? "1 1 100%" : undefined }}>
            {label}
          </Btn>
          {tooExpensive && canBuy && <Btn size="l" onClick={openBuy} style={{ flex: isPhone ? "1 1 100%" : undefined }}>Buy credits</Btn>}
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: "8px 0 18px", lineHeight: 1.55 }}>
          Charged per started minute of the finished video, refunded if the export fails.
          1440p costs {m.r1440}×, 4K {m.r2160}×, and 50 or 60 fps {m.high_fps}× more. Exports are kept as long as the project's files.
        </p>

        {renders.length > 0 && (
          <Section title="Exports">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {renders.map((r) => {
                const o = r.options;
                const d = r.drew;
                return (
                  <li key={r.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>
                          {r.aspect}
                          {o && ` · ${RES_LABEL[o.resolution] || `${o.resolution}p`} · ${o.fps} fps${o.codec === "hevc" ? " · H.265" : ""}`}
                          {" · "}{fmtTime(r.duration, false)}
                          {r.status === "done" && <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}> · {fmtBytes(r.size)}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: r.status === "failed" ? "var(--bad)" : "var(--ink-mute)", marginTop: 2 }}>
                          {r.status === "done" ? `Ready · ${new Date(r.finished_at).toLocaleString()}`
                            : r.status === "failed" ? r.error
                            : `${r.stage || "Queued"} · ${Math.round((r.progress || 0) * 100)}%`}
                        </div>
                        {r.status === "done" && (
                          <div data-drew style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2 }}>
                            {d ? `Has ${drewWords(d, term)}` : "Made by an older version of the editor, which may have left out captions and media."}
                          </div>
                        )}
                      </div>
                      {r.status === "done" && <Btn size="s" kind="primary" icon={<Icon.Download size={13} />} disabled={!online} onClick={() => download(r)}>Download</Btn>}
                      {r.status === "done" && r.has_srt && <Btn size="s" icon={<Icon.Captions size={13} />} disabled={!online} onClick={() => download(r, "srt")}>.srt</Btn>}
                      {(r.status === "done" || r.status === "failed") && (
                        <Btn size="s" kind="quiet" aria-label="Delete export" icon={<Icon.Trash />} onClick={() => remove(r)} style={{ padding: 6 }} />
                      )}
                    </div>
                    {(r.status === "queued" || r.status === "rendering") && <div style={{ marginTop: 8 }}><Bar value={r.progress || 0.02} /></div>}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </div>
    </div>,
    document.body
  );
}

function drewWords(d, term) {
  const kinds = [d.full && `${d.full} full screen`, d.split && `${d.split} split`, d.pip && `${d.pip} overlay`].filter(Boolean).join(", ");
  return [
    `${d.captions} caption${d.captions === 1 ? "" : "s"}`,
    `${d.media} ${term === "Media" ? "media" : term}${kinds ? ` (${kinds})` : ""}`,
    `${d.texts} text`,
    d.music ? `${d.music} music` : null,
    d.subtitles ? "subtitles" : null,
  ].filter(Boolean).join(" · ");
}

function Field({ label, hint = "", children }) {
  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
        {hint && <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, sub, on, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: 1 }}>{sub}</div>
      </div>
      <Switch on={on} label={label} onChange={onChange} />
    </div>
  );
}
