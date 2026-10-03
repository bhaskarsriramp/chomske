/**
 * ExportDrawer.js: choosing what the file should be, in a drawer at the
 * editor's right.
 *
 * ── PRESETS ARE THE INTERFACE ────────────────────────────────────────────────
 * Nobody making a product demo wants to choose a bitrate. They want "the one
 * for YouTube" or "the one for LinkedIn". Each preset is a complete set of
 * options with a name someone would say out loud; the individual controls are
 * underneath, folded away, for the one person in fifty who needs them.
 *
 * ── A VIDEO NOT YET PAID FOR IS PAID FOR HERE ────────────────────────────────
 * A first-time creator's free video, or one opened unedited, has not been
 * paid for (backend videoBilling.js). Its first export is where it is: the
 * button carries the price, and the watermark comes off with it.
 *
 * ── INCLUDED, EXCEPT 4K (2026-10-03) ─────────────────────────────────────────
 * The video was paid for when Clipo started on it, so an export up to 1440p is
 * just "Export", as many times as wanted. A 4K export takes a bigger machine
 * for several times as long and costs extra (/studio/config
 * pricing.fourk_credits_per_min), which is said under the button before it is
 * pressed. When the balance will not cover it, the packs are right here:
 * buying and then exporting never leaves the screen. The server prices it the
 * same way and refuses a number it disagrees with, so nobody pays a figure
 * they did not see.
 *
 * ── A DRAWER, NOT A DIALOG ───────────────────────────────────────────────────
 * It slides over the editor's right side (ui.js Drawer `page`) with no
 * backdrop, so the preview stays in view and can still be played beside it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { startRender, renderDownloadUrl, deleteRender } from "./studioApi";
import { Btn, Segmented, Toggle, Icon, Badge, Drawer } from "./ui";
import VoiceSyncBar from "./VoiceSync";
import { fmtTime, fmtBytes } from "./model";
import { useCredits } from "../../state/CreditsContext";
import { PackList } from "../Billing/BuyCredits";

export default function ExportDrawer({
  open, demo, config, outputSeconds, onClose, onChanged, beforeExport,
  // How many blurs are not applied yet, and how many are applying
  // (follow.mjs applyState), and how to apply the ones that are not.
  blurs = { unapplied: 0, applying: 0 }, onApplyBlurs,
  // The voiceover behind the captions (StudioEditor voiceState), and how to
  // bring it up to date (VoiceSync.js).
  voice = null, onUpdateVoice,
}) {
  const { balance, setBalance, refresh, rules, openBuy } = useCredits();
  const [preset, setPreset] = useState(demo.renders?.[0]?.options?.preset || "youtube");
  const [advanced, setAdvanced] = useState(false);
  const [over, setOver] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Memoised rather than defaulted inline: `config?.export?.presets || []`
  // allocates a NEW empty array on every render when config has not arrived,
  // which makes it a changing dependency and re-runs the price arithmetic on
  // every keystroke anywhere in the drawer.
  const presets = useMemo(() => config?.export?.presets || [], [config]);
  const pricing = useMemo(() => config?.pricing || {}, [config]);

  const options = useMemo(() => {
    const p = presets.find((x) => x.id === preset);
    return { preset, ...(p?.options || {}), ...over };
  }, [preset, presets, over]);

  /** Credits on top of the video's price: a 4K export only (creditPricing.js exportExtraCredits). */
  const extra = useMemo(() => {
    const per = Number(pricing.fourk_credits_per_min) || 0;
    if (!(Number(options.resolution) >= 2160) || per <= 0) return 0;
    return Math.max(1, Math.ceil(((outputSeconds || 0) * per) / 60 - 1e-9));
  }, [options.resolution, outputSeconds, pricing]);
  // The video's own price, when this export is what pays for it.
  const unpaid = demo.billing?.paid === false;
  const price = unpaid ? Number(demo.billing?.price) || 0 : 0;
  const cost = price + extra;
  const short = cost > 0 && typeof balance === "number" && balance < cost;
  const fallback = presets.find((p) => p.id === "youtube");

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const run = async () => {
    if (short) return;
    setBusy(true);
    setError("");
    try {
      // Anything unsaved goes first: the render reads the STORED timeline, and
      // exporting a version the creator can see on screen but the server has
      // never been told about is the most confusing possible outcome.
      await beforeExport?.();
      const res = await startRender(demo.id, cost, options);
      if (typeof res?.balance === "number") setBalance(res.balance);
      else if (cost > 0) refresh();
      onChanged?.();
      setBusy(false);
      onClose();
    } catch (err) {
      const d = err?.response?.data;
      setError(d?.message || "We couldn't start that export.");
      setBusy(false);
    }
  };

  /**
   * ── BLURS FIRST ────────────────────────────────────────────────────────────
   * A blur that is not applied is drawn standing still while what it covers
   * scrolls away, which is how a secret ends up in the file. So when there are
   * any, the export offers to apply them first and then starts by itself once
   * they are done (`queued`). It never blocks: "Export as it is" is always
   * there, and a blur that could not be applied stops the wait and says so
   * rather than exporting it silently.
   */
  const [queued, setQueued] = useState(false);
  const blurBlocked = blurs.unapplied + blurs.applying;
  // The voiceover the same way: offered first, waited for, never forced.
  const voiceBehind = !!voice?.stale && !voice?.updating;
  const voiceUpdating = !!voice?.updating;
  const blocked = blurBlocked + (voiceBehind || voiceUpdating ? 1 : 0);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!queued || busy || blurs.applying > 0 || voiceUpdating) return undefined;
    if (voice?.failed) {
      setQueued(false);
      return undefined;
    }
    if (blurs.unapplied === 0 && !voice?.stale) {
      setQueued(false);
      runRef.current();
      return undefined;
    }
    // The update finished but the new voiceover is still on its way to this
    // page: wait for it a little, then give up waiting rather than for ever.
    const t = setTimeout(() => setQueued(false), 10000);
    return () => clearTimeout(t);
  }, [queued, busy, blurs.applying, blurs.unapplied, voiceUpdating, voice?.stale, voice?.failed]);
  const applyThenExport = () => {
    if (blurs.unapplied > 0) onApplyBlurs?.();
    if (voiceBehind) onUpdateVoice?.();
    setQueued(true);
  };
  const firstSteps = [blurs.unapplied > 0 ? "Apply blurs" : "", voiceBehind ? (blurs.unapplied > 0 ? "update voice-over" : "Update voice-over") : ""].filter(Boolean);

  const running = (demo.renders || []).filter((r) => r.status === "queued" || r.status === "rendering");
  const finished = (demo.renders || []).filter((r) => r.status === "done" || r.status === "failed");

  const footer = (
    <>
      {short && (
        <div className="st-export-short" role="status">
          <div>
            <strong>Need {cost - balance} more credits</strong>
            <p>
              {unpaid
                ? `Exporting this video uses ${cost} credits${extra ? `, ${extra} of them for 4K` : ""}. You have ${balance}.`
                : `A 4K export of this video uses ${extra} credits. You have ${balance}.`}
            </p>
          </div>
          {rules?.packs?.length ? (
            <PackList
              rules={rules}
              onGranted={(b) => {
                if (typeof b === "number") setBalance(b);
                refresh();
              }}
            />
          ) : (
            <Btn kind="primary" onClick={openBuy}>Buy credits</Btn>
          )}
          {/* Only where 1080p would actually fit the balance. */}
          {fallback && extra > 0 && balance >= price && (
            <button
              type="button"
              onClick={() => {
                setPreset(fallback.id);
                setOver({});
              }}
              style={{
                justifySelf: "start", font: "inherit", fontSize: 12, fontWeight: 600, color: "var(--ink-mute)",
                background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline",
              }}
            >
              Export in 1080p instead
            </button>
          )}
        </div>
      )}
      <div className="st-export-go">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {short ? null : blocked > 0 ? (
            <Btn
              kind="primary"
              size="l"
              onClick={applyThenExport}
              disabled={busy || queued}
              icon={queued ? <span className="st-spin is-light" aria-hidden="true" /> : <Icon name={blurBlocked > 0 ? "blur" : "mic"} size={15} />}
            >
              {queued
                ? blurs.applying > 0
                  ? "Applying blurs…"
                  : "Updating the voice-over…"
                : firstSteps.length
                  ? `${firstSteps.join(" and ")}, then export${cost ? ` · ${cost} credits` : ""}`
                  : `Export when ready${cost ? ` · ${cost} credits` : ""}`}
            </Btn>
          ) : (
            <Btn kind="primary" size="l" onClick={run} disabled={busy} icon={<Icon name="download" size={15} />}>
              {busy ? "Starting…" : unpaid ? `Export · ${cost} credits` : "Export"}
            </Btn>
          )}
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
            {fmtTime(outputSeconds, false)} · {options.resolution}p{options.fps >= 60 ? " 60fps" : ""}
          </span>
        </div>
        {!short && unpaid && (
          <span className="st-export-note">
            Exporting pays for this video and removes the watermark.{extra > 0 ? ` 4K adds ${extra} credits.` : ""}
          </span>
        )}
        {!short && !unpaid && extra > 0 && <span className="st-export-note">4K uses {extra} extra credits.</span>}
        {blocked > 0 && !short && (
          <button
            type="button"
            onClick={() => {
              setQueued(false);
              run();
            }}
            disabled={busy}
            style={{
              justifySelf: "start", font: "inherit", fontSize: 12, fontWeight: 600, color: "var(--ink-mute)",
              background: "none", border: 0, padding: 0, cursor: busy ? "default" : "pointer", textDecoration: "underline",
            }}
          >
            {busy ? "Starting…" : "Export as it is"}
          </button>
        )}
      </div>
    </>
  );

  return (
    <Drawer open={open} page title="Export" sub={demo.title || "Your video"} label="Export" onClose={onClose} footer={footer}>
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
              value={options.speed || config?.export?.defaults?.speed || "fast"}
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

      <VoiceSyncBar voice={voice} action={false} note={queued && voiceUpdating ? "The export starts by itself when it's done." : ""} />

      {blurBlocked > 0 && (
        <div
          role="status"
          style={{
            display: "flex", alignItems: "flex-start", gap: 9,
            padding: "11px 13px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-body)",
            border: `1px solid ${blurs.applying > 0 ? "var(--line)" : "#F1D6A8"}`,
            background: blurs.applying > 0 ? "var(--made-tint)" : "#FFF7E8",
          }}
        >
          {blurs.applying > 0 && <span className="st-spin" aria-hidden="true" style={{ marginTop: 2 }} />}
          <span>
            {blurs.applying > 0
              ? `Applying ${blurs.applying === 1 ? "a blur" : `${blurs.applying} blurs`}…` +
                (queued ? " The export starts by itself when it's done." : "")
              : `${blurs.unapplied === 1 ? "A blur isn't" : `${blurs.unapplied} blurs aren't`} applied yet, so ` +
                `${blurs.unapplied === 1 ? "it stays" : "they stay"} where you put ${blurs.unapplied === 1 ? "it" : "them"} ` +
                "and won't move with the page."}
          </span>
        </div>
      )}

      {(running.length > 0 || finished.length > 0) && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "grid", gap: 9 }}>
          <Label>Exports</Label>
          {[...running, ...finished].map((r) => (
            <RenderRow key={r.id} demoId={demo.id} render={r} onChanged={onChanged} />
          ))}
        </div>
      )}
    </Drawer>
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

  /**
   * ── AN EXPORT THAT NEVER RAN HAS NO SIZE ─────────────────────────────────
   * width and height are written when the render finishes, so a failed one
   * carries zeroes and this read "youtube · 0×0" — which looks like an export
   * that was somehow configured at no size at all, rather than one that never
   * produced a frame. The size is only news once there is a file.
   */
  const size = render.width > 0 && render.height > 0 ? ` · ${render.width}×${render.height}` : "";
  const label = `${render.options?.label || render.options?.preset || "Export"}${size}`;

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
