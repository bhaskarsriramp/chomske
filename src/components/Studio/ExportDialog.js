/**
 * ExportDialog.js: choosing what the file should be, and paying for it.
 *
 * ── PRESETS ARE THE INTERFACE ────────────────────────────────────────────────
 * Nobody making a product demo wants to choose a bitrate. They want "the one
 * for YouTube" or "the one for LinkedIn". Each preset is a complete set of
 * options with a name someone would say out loud; the individual controls are
 * underneath, folded away, for the one person in fifty who needs them.
 *
 * ── THE PRICE ON THE BUTTON IS THE PRICE CHARGED ─────────────────────────────
 * The cost is worked out here from the same multipliers the server uses
 * (/studio/config), and sent back with the request. If the server disagrees —
 * the edit changed length while this was open, or the rate changed — nothing is
 * charged and the new price comes back. Nobody pays a number they did not see.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { startRender, renderDownloadUrl, deleteRender } from "./studioApi";
import { Btn, Segmented, Toggle, Icon, Badge } from "./ui";
import { fmtTime, fmtBytes } from "./model";

export default function ExportDialog({ demo, config, outputSeconds, onClose, onChanged, beforeExport }) {
  const closeRef = useRef(null);
  const [preset, setPreset] = useState(demo.renders?.[0]?.options?.preset || "youtube");
  const [advanced, setAdvanced] = useState(false);
  const [over, setOver] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Memoised rather than defaulted inline: `config?.export?.presets || []`
  // allocates a NEW empty array on every render when config has not arrived,
  // which makes it a changing dependency and re-runs the price arithmetic on
  // every keystroke anywhere in the dialog.
  const presets = useMemo(() => config?.export?.presets || [], [config]);
  const pricing = useMemo(() => config?.pricing || {}, [config]);

  const options = useMemo(() => {
    const p = presets.find((x) => x.id === preset);
    return { preset, ...(p?.options || {}), ...over };
  }, [preset, presets, over]);

  const cost = useMemo(() => {
    const perMin = pricing.export_per_min || 8;
    const base = perMin * Math.max(1, Math.ceil((outputSeconds || 0) / 60));
    const m = pricing.multipliers || {};
    let k = 1;
    if (options.resolution === 1440) k *= m.r1440 || 1.5;
    if (options.resolution === 2160) k *= m.r2160 || 2.5;
    if (options.fps >= 60) k *= m.fps60 || 1.6;
    if (options.speed === "best") k *= m.best || 1.3;
    if (options.codec === "hevc") k *= m.hevc || 1.4;
    return Math.max(1, Math.ceil(base * k));
  }, [options, outputSeconds, pricing]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      // Anything unsaved goes first: the render reads the STORED timeline, and
      // exporting a version the creator can see on screen but the server has
      // never been told about is the most confusing possible outcome.
      await beforeExport?.();
      await startRender(demo.id, cost, options);
      onChanged?.();
      onClose();
    } catch (err) {
      const d = err?.response?.data;
      setError(d?.message || "We couldn't start that export.");
      setBusy(false);
    }
  };

  const running = (demo.renders || []).filter((r) => r.status === "queued" || r.status === "rendering");
  const finished = (demo.renders || []).filter((r) => r.status === "done" || r.status === "failed");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 20,
        background: "rgba(4,5,9,.72)", backdropFilter: "blur(6px)",
      }}
    >
      <div
        className="st-scroll"
        style={{
          width: "min(560px, 100%)", maxHeight: "86vh",
          borderRadius: 18, border: "1px solid var(--line)", background: "var(--paper)",
          boxShadow: "0 40px 100px -30px rgba(0,0,0,.9)",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px 14px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--paper)", zIndex: 1 }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Export</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 8, border: "none", background: "transparent", color: "var(--ink-mute)", cursor: "pointer" }}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        <div style={{ padding: 20, display: "grid", gap: 18 }}>
          <div>
            <Label>For</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {presets.map((p) => {
                const on = p.id === preset;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setPreset(p.id);
                      setOver({});
                    }}
                    style={{
                      textAlign: "left", padding: "11px 13px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                      border: "1px solid", borderColor: on ? "var(--ink)" : "var(--line)",
                      background: on ? "var(--made-tint)" : "var(--card)",
                      color: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 660, color: "var(--ink)" }}>{p.label}</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: "var(--ink-mute)" }}>{p.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            style={{
              display: "flex", alignItems: "center", gap: 7, border: "none", background: "transparent", padding: 0,
              color: "var(--ink-mute)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 620, cursor: "pointer",
            }}
          >
            <Icon name="chevron" size={13} style={{ transform: advanced ? "rotate(90deg)" : "none", transition: "transform var(--dur-pop) var(--ease-out)" }} />
            {advanced ? "Fewer settings" : "More settings"}
          </button>

          {advanced && (
            <div style={{ display: "grid", gap: 15, padding: 15, borderRadius: 13, background: "rgba(0,0,0,.25)", border: "1px solid var(--line)" }}>
              <Row label="Shape">
                <Segmented
                  size="xs"
                  value={options.aspect}
                  onChange={(v) => setOver((o) => ({ ...o, aspect: v }))}
                  // "source" is not a ratio and reads as nonsense next to
                  // "16:9", so it is named for what it does.
                  options={(config?.timeline?.aspects || ["16:9"]).map((a) => ({ value: a, label: a === "source" ? "As recorded" : a }))}
                />
              </Row>
              <Row label="Resolution">
                <Segmented
                  size="xs"
                  value={options.resolution}
                  onChange={(v) => setOver((o) => ({ ...o, resolution: v }))}
                  options={(config?.export?.resolutions || [1080]).map((r) => ({ value: r, label: `${r}p` }))}
                />
              </Row>
              <Row label="Frame rate">
                <Segmented
                  size="xs"
                  value={options.fps}
                  onChange={(v) => setOver((o) => ({ ...o, fps: v }))}
                  options={(config?.export?.frame_rates || [30]).map((f) => ({ value: f, label: `${f}` }))}
                />
              </Row>
              <Row label="Quality">
                <Segmented
                  size="xs"
                  value={options.speed || "balanced"}
                  onChange={(v) => setOver((o) => ({ ...o, speed: v }))}
                  options={[
                    { value: "fast", label: "Fast" },
                    { value: "balanced", label: "Balanced" },
                    { value: "best", label: "Best" },
                  ]}
                />
              </Row>
              {options.format !== "gif" && (
                <Toggle
                  label="Burn in captions"
                  hint="An .srt file is written beside the video either way."
                  checked={options.captions !== false}
                  onChange={(v) => setOver((o) => ({ ...o, captions: v }))}
                />
              )}
            </div>
          )}

          {error && (
            <div style={{ padding: "11px 13px", borderRadius: 10, border: "1px solid #F5C7C3", background: "#FCE8E6", color: "var(--bad)", fontSize: 12.5, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn kind="primary" size="l" onClick={run} disabled={busy} icon={<Icon name="download" size={15} />}>
              {busy ? "Starting…" : `Export · ${cost} credits`}
            </Btn>
            <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
              {fmtTime(outputSeconds, false)} · {options.resolution}p{options.fps >= 60 ? " 60fps" : ""}
            </span>
          </div>

          {(running.length > 0 || finished.length > 0) && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "grid", gap: 9 }}>
              <Label>Exports</Label>
              {[...running, ...finished].map((r) => (
                <RenderRow key={r.id} demoId={demo.id} render={r} onChanged={onChanged} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RenderRow({ demoId, render, onChanged }) {
  const [busy, setBusy] = useState(false);

  const download = async (file) => {
    setBusy(true);
    try {
      const url = await renderDownloadUrl(demoId, render.id, file);
      window.open(url, "_blank", "noopener");
    } catch {
      /* the list below will say if it has gone */
    }
    setBusy(false);
  };

  const label = `${render.options?.label || render.options?.preset || "Export"} · ${render.width}×${render.height}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 11, border: "1px solid var(--line)", background: "var(--card)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 12.5, fontWeight: 640, color: "var(--ink)" }}>{label}</span>
          {render.stale && render.status === "done" && <Badge tone="warn">Older engine</Badge>}
        </div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--ink-mute)" }}>
          {render.status === "done"
            ? `${fmtBytes(render.size)} · ${fmtTime(render.duration)}`
            : render.status === "failed"
              ? render.error || "Failed"
              : `${render.stage || "Queued"} ${Math.round((render.progress || 0) * 100)}%`}
        </div>
        {(render.status === "rendering" || render.status === "queued") && (
          <div className="st-bar" style={{ marginTop: 7 }}>
            <i style={{ width: `${Math.round((render.progress || 0) * 100)}%` }} />
          </div>
        )}
      </div>

      {render.status === "done" && (
        <>
          <Btn size="xs" onClick={() => download("")} disabled={busy}>
            Download
          </Btn>
          {render.drew?.captions > 0 && (
            <Btn size="xs" kind="quiet" onClick={() => download("srt")} disabled={busy} title="Subtitle file">
              .srt
            </Btn>
          )}
        </>
      )}
      <button
        type="button"
        title="Remove"
        onClick={async () => {
          setBusy(true);
          await deleteRender(demoId, render.id).catch(() => {});
          onChanged?.();
        }}
        style={{ width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 7, border: "none", background: "transparent", color: "var(--ink-mute)", cursor: "pointer" }}
      >
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ minWidth: 88, fontSize: 11.5, fontWeight: 650, color: "var(--ink-mute)" }}>{label}</span>
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ marginBottom: 9, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
      {children}
    </div>
  );
}
