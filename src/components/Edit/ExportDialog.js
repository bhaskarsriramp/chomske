import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import { useCredits } from "../../state/CreditsContext";
import { startRender, renderDownloadUrl, deleteRender } from "./editApi";
import { Btn, Bar, Icon, Notice, Section, Segmented, fmtBytes, fmtTime } from "./ui";

/**
 * Export: the price, the last check, and the files.
 *
 * ── THE PRICE SHOWN IS THE PRICE CHARGED ─────────────────────────────────────
 * Export is priced from the SAVED edit's length. Pressing Export first saves
 * whatever is still pending; if that save changed the length enough to change
 * the price, nothing is charged and the new price is put on the button to be
 * pressed again. The server enforces the same rule (expected_cost).
 *
 * ── THE LAST CHECK IS ABOUT WHAT IS MISSING ──────────────────────────────────
 * Empty B-roll slots export as the creator talking, which may be fine, and is
 * worth one line before paying rather than after watching the result.
 */
export default function ExportDialog({ project, tl, lay, price, languages = [], nativeLabel = "", term = "B-roll", priceNow, onFlush, onAspect, onData, onClose }) {
  const isPhone = useIsMobile(600);
  const { balance, setBalance, openBuy, canBuy } = useCredits();
  const [shown, setShown] = useState(price);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const closeRef = useRef(null);

  useEffect(() => { setShown(price); }, [price]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][aria-label="Buy credits"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const renders = [...(project.renders || [])].reverse();
  const running = renders.find((r) => r.status === "queued" || r.status === "rendering");
  const emptySlots = lay.broll.filter((b) => b.start !== null && !b.media).length;
  const slots = lay.broll.filter((b) => b.start !== null).length;
  const tooExpensive = typeof balance === "number" && shown > balance;
  const cap = tl.captions || {};
  const captionWords = cap.mode === "off"
    ? "off"
    : cap.mode === "tr"
    ? `${languages.find((l) => l.code === cap.lang)?.label || cap.lang} (translated), ${cap.style}`
    : `${cap.mode === "roman" ? "Roman" : nativeLabel || "original letters"}, ${cap.style}`;

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
      if (now !== shown) {
        setShown(now);
        setNote(`Your edit changed, so this export is now ${now} credits. Press Export again to confirm.`);
        return;
      }
      const d = await startRender(project.id, now);
      if (typeof d.balance === "number") setBalance(d.balance);
      onData(d);
    } catch (err) {
      const b = err?.response?.data;
      if (b?.insufficient_credits) setBalance(b.balance);
      else if (b?.price_changed) {
        setShown(b.cost);
        setNote(b.message + " Press Export again to confirm.");
      } else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function download(r) {
    setError("");
    try {
      window.location.href = await renderDownloadUrl(project.id, r.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(r) {
    try { onData(await deleteRender(project.id, r.id)); } catch (err) { setError(errorMessage(err)); }
  }

  const label = busy ? "Starting…" : running ? "Export running…" : tooExpensive ? "Not enough credits" : `Export · ${shown} credits`;

  return createPortal(
    <div onClick={onClose} className="hg-fade" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,15,15,.45)", display: "flex", justifyContent: "center", alignItems: isPhone ? "flex-end" : "center", padding: isPhone ? 0 : 18 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export video"
        className="hg-sheet-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isPhone ? "100%" : "min(520px, 100%)", maxHeight: isPhone ? "92vh" : "88vh", overflowY: "auto",
          background: "var(--card)", border: "1px solid var(--line)", borderRadius: isPhone ? "16px 16px 0 0" : 16,
          padding: isPhone ? "18px 16px calc(20px + env(safe-area-inset-bottom))" : 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 750, letterSpacing: "-.02em", color: "var(--ink)" }}>Export video</h3>
          <Btn ref={closeRef} aria-label="Close" size="s" onClick={onClose} icon={<Icon.Close size={15} />} style={{ width: 34, height: 34, padding: 0 }} />
        </div>

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

        <Section title="In this export">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6, fontSize: 13.5, color: "var(--ink-body)" }}>
            <li>Length <strong style={{ color: "var(--ink)" }}>{fmtTime(lay.duration, false)}</strong>, 1080p MP4</li>
            <li>Captions: <strong style={{ color: "var(--ink)" }}>{captionWords}</strong></li>
            <li>
              {term}: <strong style={{ color: "var(--ink)" }}>{slots ? `${slots - emptySlots} of ${slots} filled` : "none"}</strong>
              {emptySlots > 0 && <span style={{ color: "#8A5A0F" }}> · empty ones show you talking</span>}
            </li>
            <li>Music: <strong style={{ color: "var(--ink)" }}>{(tl.audio || []).length ? `${tl.audio.length} track${tl.audio.length === 1 ? "" : "s"}` : "none"}</strong>
              {(tl.texts || []).length > 0 && <> · Text: <strong style={{ color: "var(--ink)" }}>{tl.texts.length}</strong></>}
            </li>
          </ul>
        </Section>

        {note && <div style={{ marginBottom: 12 }}><Notice tone="warn">{note}</Notice></div>}
        {error && <div style={{ marginBottom: 12 }}><Notice tone="bad">{error}</Notice></div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn kind="primary" size="l" disabled={busy || !!running || tooExpensive || !(lay.duration > 0)} onClick={go} style={{ flex: isPhone ? "1 1 100%" : undefined }}>
            {label}
          </Btn>
          {tooExpensive && canBuy && <Btn size="l" onClick={openBuy} style={{ flex: isPhone ? "1 1 100%" : undefined }}>Buy credits</Btn>}
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: "8px 0 18px", lineHeight: 1.55 }}>
          Charged per started minute of the finished video, refunded if the export fails. Exports are kept as long as the project's files.
        </p>

        {renders.length > 0 && (
          <Section title="Exports">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {renders.map((r) => (
                <li key={r.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>
                        {r.aspect} · {fmtTime(r.duration, false)}
                        {r.status === "done" && <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}> · {fmtBytes(r.size)}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: r.status === "failed" ? "var(--bad)" : "var(--ink-mute)", marginTop: 2 }}>
                        {r.status === "done" ? `Ready · ${new Date(r.finished_at).toLocaleString()}`
                          : r.status === "failed" ? r.error
                          : `${r.stage || "Queued"} · ${Math.round((r.progress || 0) * 100)}%`}
                      </div>
                    </div>
                    {r.status === "done" && <Btn size="s" kind="primary" icon={<Icon.Download size={13} />} onClick={() => download(r)}>Download</Btn>}
                    {(r.status === "done" || r.status === "failed") && (
                      <Btn size="s" kind="quiet" aria-label="Delete export" icon={<Icon.Trash />} onClick={() => remove(r)} style={{ padding: 6 }} />
                    )}
                  </div>
                  {(r.status === "queued" || r.status === "rendering") && <div style={{ marginTop: 8 }}><Bar value={r.progress || 0.02} /></div>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>,
    document.body
  );
}
