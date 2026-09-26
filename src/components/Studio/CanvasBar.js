/**
 * CanvasBar.js: the frame around the demo, set from the row under the preview.
 *
 * ── WHY IT LEFT THE INSPECTOR ────────────────────────────────────────────────
 * Shape, size, corners, shadow and background change the whole picture, and a
 * creator adjusting them is watching the picture. In a tab on the far side of
 * the screen every nudge meant looking away from the thing being nudged. Under
 * the preview they sit where the eye already is, the way every video tool puts
 * its framing controls.
 *
 * The sliders are short on purpose: this row also holds play, the time, Cut
 * here and full screen. The exact value appears above a slider while it is
 * hovered or dragged, not beside it, so it costs the row no width.
 *
 * ── THE BACKGROUND IS A DIALOG ───────────────────────────────────────────────
 * Ten gradients, a palette and a creator's own images do not fit in a row.
 * Choices apply the moment they are picked, so the preview changes behind the
 * dialog, which is dimmed only lightly for that reason; Done just closes it.
 *
 * ── "NO BACKGROUND" MEANS THE RECORDING AS IT WAS ────────────────────────────
 * Not only the background switched off. With the size, corners or shadow still
 * set, "no background" would leave the video inset on black with rounded
 * corners, which is a background by any other name. So it puts the whole frame
 * back: no background, full size, square corners, no shadow. The shape is left
 * alone; that is a separate choice with its own control.
 *
 * ── TURNING A BACKGROUND ON MAKES ROOM FOR IT ────────────────────────────────
 * At full size the video covers the whole frame, so a background picked there
 * would change nothing on screen. Switching one on from none therefore brings
 * the video to 90% at the same time, in the same undo step. Only then: a
 * creator who has since chosen a size, 100% included, keeps it while trying
 * other backgrounds.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn, Segmented, Icon } from "./ui";
import { GRADIENTS, backgroundCss } from "./model";
import { uploadBackground, deleteBackground } from "./studioApi";

const SHAPES = [
  // First and default: the recording's own shape, at its own size. Anything
  // else scales the picture to fit and softens the text.
  { value: "source", label: "As recorded" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  // Hidden for now, kept to bring back.
  // { value: "1:1", label: "1:1" },
  // { value: "4:5", label: "4:5" },
];

const SOLIDS = ["#101318", "#1C1E22", "#0B2B3A", "#12281A", "#2B1A14", "#F3F1EC", "#E8EDF2", "#FFFFFF"];

// Must match the server (backend services/studio/backgrounds.js). Checked here
// first so a wrong file is refused before it is sent, not after.
const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];
const UPLOAD_MAX_MB = 10;

const pct = (v) => `${Math.round(v * 100)}%`;

export default function CanvasBar({ tl, edit, backgrounds, onUploaded, onDeleted }) {
  const c = tl.canvas || {};
  const bg = c.background || { kind: "none" };
  const set = (fields, label) => edit({ canvas: { ...c, ...fields } }, label);
  const [picking, setPicking] = useState(false);

  // Choosing a background (see the header on making room for it).
  const pickBackground = (next) => {
    const turningOn = bg.kind === "none" && next.kind !== "none" && !(c.padding > 0);
    set({ background: next, ...(turningOn ? { padding: 0.05 } : null) }, "Background");
  };

  // Back to the recording exactly as recorded (see the header). One undo step.
  const reset = () => set({ background: { kind: "none" }, padding: 0, radius: 0, shadow: 0 }, "No background");
  const plain = bg.kind === "none" && !(c.padding > 0) && !(c.radius > 0) && (c.shadow ?? 0.5) === 0;

  // Stored as padding, the margin on each side. Shown as the video's size, so
  // dragging right makes the video bigger, which is what "size" means.
  const size = 1 - 2 * (c.padding ?? 0);

  return (
    <div className="st-canvasbar">
      <Segmented size="xs" label="Shape" value={c.aspect || "source"} onChange={(v) => set({ aspect: v }, "Aspect")} options={SHAPES} />
      <MiniSlider
        label="Size"
        min={0.56}
        max={1}
        step={0.01}
        value={size}
        onChange={(v) => set({ padding: Math.round(((1 - v) / 2) * 1000) / 1000 }, "Video size")}
        format={pct}
      />
      <MiniSlider
        label="Corners"
        min={0}
        max={56}
        step={1}
        value={c.radius ?? 0}
        onChange={(v) => set({ radius: v }, "Corner radius")}
        format={(v) => `${Math.round(v)}px`}
      />
      <MiniSlider
        label="Shadow"
        min={0}
        max={1}
        step={0.05}
        value={c.shadow ?? 0.5}
        onChange={(v) => set({ shadow: v }, "Shadow")}
        format={(v) => (v === 0 ? "None" : pct(v))}
      />
      <Btn size="s" aria-haspopup="dialog" onClick={() => setPicking(true)} icon={<Swatch bg={bg} backgrounds={backgrounds} />}>
        Background
      </Btn>

      {picking && (
        <BackgroundDialog
          bg={bg}
          plain={plain}
          backgrounds={backgrounds}
          onPick={pickBackground}
          onReset={reset}
          onUploaded={onUploaded}
          onDeleted={onDeleted}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** A short slider with its name beside it and its value above it on demand. */
function MiniSlider({ label, value, min, max, step, onChange, format }) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  const shown = format(value);
  return (
    <div className="st-mini">
      <label htmlFor={id} className="st-mini-label">
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="st-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${fill}%` }}
      />
      <span className="st-mini-value" aria-hidden="true">
        {shown}
      </span>
    </div>
  );
}

/** The current background, small enough to sit in a button. */
function Swatch({ bg, backgrounds, size = 16 }) {
  const style = { width: size, height: size, borderRadius: 5, flexShrink: 0, border: "1px solid rgba(15,15,15,.14)" };
  if (bg.kind === "image") {
    const b = (backgrounds || []).find((x) => x.id === bg.value);
    return <span style={{ ...style, background: b ? `#000 center / cover url("${b.thumb_url}")` : "#000" }} />;
  }
  if (bg.kind === "none") {
    // A slash through an empty square: nothing behind the video.
    return (
      <span style={{ ...style, background: "linear-gradient(135deg, transparent 45%, var(--bad) 45% 55%, transparent 55%), var(--card)" }} />
    );
  }
  return <span style={{ ...style, background: backgroundCss(bg) }} />;
}

/* ────────────────────────────────────────────────────────────────────────────
   The background dialog
   ──────────────────────────────────────────────────────────────────────────── */

function BackgroundDialog({ bg, plain, backgrounds, onPick, onReset, onUploaded, onDeleted, onClose }) {
  const [tab, setTab] = useState(bg.kind === "solid" ? "solid" : bg.kind === "image" ? "upload" : "gradient");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // The uploaded image being asked "delete?" about, and the one being deleted.
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const fileRef = useRef(null);
  const doneRef = useRef(null);
  const colorId = useId();

  useEffect(() => {
    doneRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || uploading || deletingId) return;
      // Escape backs out of a "delete?" first, and only then out of the dialog.
      if (confirmId) setConfirmId(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, uploading, deletingId, confirmId]);

  /**
   * Delete an uploaded image for good, files and all. If this demo was using
   * it, the demo goes back to no background rather than pointing at nothing.
   * Other demos that used it get the same treatment when they are next drawn.
   */
  const remove = async (b) => {
    setDeletingId(b.id);
    setError("");
    try {
      await deleteBackground(b.id);
      if (bg.kind === "image" && bg.value === b.id) onReset();
      onDeleted?.(b.id);
      setConfirmId(null);
    } catch (err) {
      // Already gone (another tab): it goes from the list all the same.
      if (err?.response?.status === 404) {
        onDeleted?.(b.id);
        setConfirmId(null);
      } else {
        setError(err?.response?.data?.message || "That image couldn't be deleted. Please try again.");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setError("");
    if (!UPLOAD_TYPES.includes(file.type)) {
      setError("Choose a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
      setError(`That image is over ${UPLOAD_MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const b = await uploadBackground(file);
      onUploaded?.(b);
      onPick({ kind: "image", value: b.id });
    } catch (err) {
      setError(err?.response?.data?.message || "That image couldn't be uploaded. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const tile = (on) => ({
    padding: 0, cursor: "pointer", borderRadius: 10, overflow: "hidden",
    border: "none", outline: on ? "2px solid var(--ink)" : "1px solid var(--line)", outlineOffset: on ? 2 : 0,
  });

  return createPortal(
    <div
      className="hg-fade"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 16,
        // Light, so the preview behind stays readable while choices apply to it.
        background: "rgba(15,15,15,.22)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Background"
        className="hg-sheet-up"
        style={{
          width: "min(480px, 100%)", maxHeight: "min(640px, 88vh)", display: "flex", flexDirection: "column",
          borderRadius: 16, border: "1px solid var(--line)", background: "var(--card)", boxShadow: "var(--shadow-modal)",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px 12px" }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Background</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close"
            style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: "var(--ink-mute)", cursor: "pointer" }}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        <div style={{ padding: "0 18px" }}>
          <Segmented
            full
            size="s"
            label="Background type"
            value={tab}
            onChange={setTab}
            options={[
              { value: "gradient", label: "Gradient" },
              { value: "solid", label: "Solid" },
              { value: "upload", label: "Upload" },
            ]}
          />
        </div>

        <div className="st-scroll" style={{ flex: 1, minHeight: 0, padding: "16px 18px" }}>
          {tab === "gradient" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
              {Object.entries(GRADIENTS).map(([name, stops]) => {
                const on = bg.kind === "gradient" && bg.value === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={`${name} gradient`}
                    aria-pressed={on}
                    onClick={() => onPick({ kind: "gradient", value: name })}
                    style={{ ...tile(on), aspectRatio: "1", background: `linear-gradient(135deg, ${stops[0]}, ${stops[1]} 55%, ${stops[2]})` }}
                  />
                );
              })}
            </div>
          )}

          {tab === "solid" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
              {SOLIDS.map((hex) => {
                const on = bg.kind === "solid" && String(bg.value).toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    aria-label={`Solid ${hex}`}
                    aria-pressed={on}
                    onClick={() => onPick({ kind: "solid", value: hex })}
                    style={{ ...tile(on), aspectRatio: "1", background: hex, boxShadow: "inset 0 0 0 1px rgba(15,15,15,.08)" }}
                  />
                );
              })}
              {/* Any other colour. The native picker, so it is the system's own
                  and works with a keyboard and an eyedropper where there is one. */}
              <label
                htmlFor={colorId}
                title="Any colour"
                style={{
                  ...tile(bg.kind === "solid" && !SOLIDS.some((h) => h.toLowerCase() === String(bg.value).toLowerCase())),
                  aspectRatio: "1", display: "grid", placeItems: "center", position: "relative",
                  background: "conic-gradient(#f5484d, #f5c542, #4cd07d, #3ba7f5, #a064f5, #f5484d)",
                }}
              >
                <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 99, background: "var(--card)", color: "var(--ink)" }}>
                  <Icon name="plus" size={13} />
                </span>
                <input
                  id={colorId}
                  type="color"
                  value={bg.kind === "solid" && /^#[0-9a-f]{6}$/i.test(bg.value) ? bg.value : "#101318"}
                  onChange={(e) => onPick({ kind: "solid", value: e.target.value })}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                />
              </label>
            </div>
          )}

          {tab === "upload" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{
                    aspectRatio: "16 / 10", borderRadius: 10, cursor: uploading ? "default" : "pointer",
                    border: "1.5px dashed var(--line-strong)", background: "var(--paper)", color: "var(--ink-body)",
                    display: "grid", placeItems: "center", alignContent: "center", gap: 5, fontFamily: "inherit",
                    fontSize: 12, fontWeight: 650,
                  }}
                >
                  <Icon name="upload" size={17} />
                  {uploading ? "Uploading…" : "Upload image"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={UPLOAD_TYPES.join(",")}
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  style={{ display: "none" }}
                />

                {backgrounds === null &&
                  [0, 1].map((i) => <span key={i} className="st-bg-loading" style={{ aspectRatio: "16 / 10", borderRadius: 10 }} />)}

                {(backgrounds || []).map((b) => {
                  const on = bg.kind === "image" && bg.value === b.id;
                  const asking = confirmId === b.id;
                  const deleting = deletingId === b.id;
                  return (
                    <div key={b.id} className="st-bg-tile">
                      <button
                        type="button"
                        aria-label="Uploaded background"
                        aria-pressed={on}
                        disabled={asking}
                        onClick={() => onPick({ kind: "image", value: b.id })}
                        style={{ ...tile(on), display: "block", width: "100%", aspectRatio: "16 / 10", background: `#000 center / cover url("${b.thumb_url}")` }}
                      />
                      {!asking ? (
                        <button
                          type="button"
                          className="st-bg-del"
                          title="Delete this image"
                          aria-label="Delete this image"
                          onClick={() => setConfirmId(b.id)}
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      ) : (
                        // Asked on the tile itself: one image, one question, and
                        // no second dialog stacked on the first.
                        <div className="st-bg-confirm" role="group" aria-label="Delete this image?">
                          <span>Delete this image?</span>
                          <span style={{ display: "flex", gap: 6 }}>
                            <button type="button" className="is-yes" disabled={deleting} onClick={() => remove(b)}>
                              {deleting ? "Deleting…" : "Delete"}
                            </button>
                            {/* Focus lands on Keep: Enter must never be the delete. */}
                            <button type="button" autoFocus disabled={deleting} onClick={() => setConfirmId(null)}>
                              Keep
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--ink-mute)" }}>
                PNG, JPEG or WebP, up to {UPLOAD_MAX_MB} MB. Images you upload are kept on your account for every demo
                until you delete them.
              </p>
            </>
          )}

          {error && (
            <p role="alert" style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--bad)" }}>
              {error}
            </p>
          )}
        </div>

        <footer style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px 16px", borderTop: "1px solid var(--line)" }}>
          <Btn
            size="s"
            icon={<Icon name="close" size={13} />}
            disabled={plain || uploading || !!deletingId}
            onClick={onReset}
            title="Back to the recording as it is: no background, full size, square corners, no shadow"
          >
            No background
          </Btn>
          <Btn ref={doneRef} size="s" kind="primary" onClick={onClose} disabled={uploading} style={{ marginLeft: "auto" }}>
            Done
          </Btn>
        </footer>
      </div>
    </div>,
    document.body
  );
}
