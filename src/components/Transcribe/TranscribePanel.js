import { useState, useEffect, useRef, useCallback } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Skeleton from "../Shell/Skeleton";
import { useVoices } from "../../state/VoiceContext";
import { voiceLabel } from "../Shell/VoiceSelect";

/**
 * My voice — the videos that teach us how this creator talks.
 *
 * ── ONE SCREEN, SEVERAL VOICES ───────────────────────────────────────────────
 * A creator can keep more than one voice set: their Hindi channel and their
 * English one, or their own work and a client's. Each holds its OWN videos and
 * its own analysis, because a profile built from both is a voice that is
 * nobody's — the failure the mixed-language warning below already had to warn
 * about, now solved rather than flagged.
 *
 * Everything on this screen is about the selected set. The selector is at the
 * top rather than tucked into a menu: which voice you are adding a video to is
 * the single most consequential thing on the page, and a video added to the
 * wrong set costs a transcription to undo.
 *
 * ── WHY ANALYSIS IS A BUTTON, NOT AUTOMATIC ──────────────────────────────────
 * Profiling on every added URL would re-analyse the whole set five times while
 * someone pastes five links, paying four times for a profile that is thrown away.
 * Worse, the intermediate profiles are wrong: a voice built from video one is a
 * different voice from one built from all five, so the output would change under
 * the user for reasons they cannot see. Adding is cheap and incremental;
 * analysing is one deliberate act over the finished set.
 *
 * Transcription still happens per video on add, because that is the part that
 * genuinely is per-video and it lets someone read each transcript as they go.
 */
export default function TranscribePanel({ onQuota, onVoiceChange }) {
  const isPhone = useIsMobile(680);
  const isNarrow = useIsMobile(1100);

  const {
    voices, activeId, active: activeVoice, max: maxVoices,
    setActive: selectVoice, refresh: refreshVoices, loading: voicesLoading,
  } = useVoices();

  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openVideo, setOpenVideo] = useState(null);
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState(null);      // slots, ready_count, mixed_languages
  const [copied, setCopied] = useState(false);

  const [voice, setVoice] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysed, setAnalysed] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmVoiceDelete, setConfirmVoiceDelete] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [creating, setCreating] = useState(false);

  const pollRef = useRef(null);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/transcribe", {
        params: { limit: 20, ...(activeId ? { voice: activeId } : {}) },
      });
      setHistory(data.transcripts || []);
      setMeta({
        slots: data.slots,
        ready: data.ready_count || 0,
        mixed: data.mixed_languages,
        maxSeconds: data.max_seconds || 60,
      });
      onQuota?.(data.quota || null);
    } catch { /* secondary — never block the main flow on it */ }
  }, [onQuota, activeId]);

  const loadVoice = useCallback(async () => {
    try {
      const { data } = await api.get("/script/voice", {
        params: activeId ? { voice: activeId } : {},
      });
      setVoice(data);
    } catch { /* the panel degrades to "not built yet" */ }
  }, [activeId]);

  // Held until the voice list arrives. Fetching against "whatever the server
  // thinks is default" and then again against the real selection would show one
  // set's videos for a moment before swapping to another's — the exact confusion
  // this screen has to avoid.
  useEffect(() => {
    if (voicesLoading) return;
    loadHistory();
    loadVoice();
  }, [loadHistory, loadVoice, voicesLoading]);

  // Switching voices switches everything on screen. The open transcript belongs
  // to the set that was selected a moment ago.
  useEffect(() => {
    clearInterval(pollRef.current);
    setOpenVideo(null);
    setAnalysed(false);
    setError("");
  }, [activeId]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const startPolling = useCallback((id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/transcribe/${id}`);
        setOpenVideo(data.transcript);
        if (data.transcript.status !== "processing") {
          clearInterval(pollRef.current);
          loadHistory();
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setError(errorMessage(err, "Lost track of that video. Try opening it from the list."));
      }
    }, 3000);
  }, [loadHistory]);

  async function handleSubmit(e) {
    e?.preventDefault();
    if (submitting) return;
    setError("");
    setCopied(false);

    const value = url.trim();
    if (!value) return setError("Paste a YouTube link first.");

    setSubmitting(true);
    try {
      // The set is named explicitly. Letting the server pick would mean a video
      // landing in whichever set it considers default — and paying to transcribe
      // it into the wrong one.
      const { data } = await api.post("/transcribe", { url: value, voice: activeId || undefined });
      setOpenVideo(data.transcript);
      setUrl("");
      setAnalysed(false);   // the set changed, so the last analysis is behind
      if (data.transcript.status === "processing") startPolling(data.transcript.id);
      else loadHistory();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
      loadHistory();
    }
  }

  async function doDelete() {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/transcribe/${confirmDelete.id}`);
      if (openVideo?.id === confirmDelete.id) setOpenVideo(null);
      setConfirmDelete(null);
      setAnalysed(false);
      await loadHistory();
      await loadVoice();
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete that video."));
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function analyseVoice() {
    if (analysing || !activeId) return;
    setError("");
    setAnalysing(true);
    try {
      const { data } = await api.post(`/voices/${activeId}/analyse`);
      setVoice((v) => ({ ...(v || {}), profile: data.profile, stale: false }));
      setAnalysed(true);
      // Refreshes the shared list, which is what surfaces `needs_name` — the
      // shell watches for it and puts up the naming dialog. That is deliberately
      // NOT this component's job: an analysis can finish after the creator has
      // navigated away, and the demand for a name has to follow them.
      await refreshVoices();
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't analyse your voice. Please try again."));
    } finally {
      setAnalysing(false);
    }
  }

  /* ── Voice sets ─────────────────────────────────────────────────────────── */

  async function addVoice() {
    if (creating) return;
    setError("");
    setCreating(true);
    try {
      const { data } = await api.post("/voices", {});
      await refreshVoices();
      // Switch to it immediately. Creating a voice and staying on the old one
      // would mean the next video pasted goes to the wrong place.
      if (data?.voice?.id) selectVoice(data.voice.id);
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't add another voice."));
    } finally {
      setCreating(false);
    }
  }

  async function doRename(name) {
    const clean = String(name || "").trim();
    if (!clean || !activeId) return;
    setRenaming(false);
    try {
      await api.patch(`/voices/${activeId}`, { name: clean });
      await refreshVoices();
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't rename that voice."));
    }
  }

  async function doDeleteVoice() {
    if (!confirmVoiceDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/voices/${confirmVoiceDelete.id}`);
      setConfirmVoiceDelete(null);
      const list = await refreshVoices();
      // Land on something real. The deleted set may have been the selection.
      if (list?.length) selectVoice(list[0].id);
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete that voice."));
      setConfirmVoiceDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  function copyText() {
    if (!openVideo?.text) return;
    navigator.clipboard.writeText(openVideo.text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => setError("Couldn't copy. Select the text and copy it manually.")
    );
  }

  const gut = isPhone ? 16 : 30;
  const full = meta?.slots ? meta.slots.left <= 0 : false;
  const canAnalyse = (meta?.ready || 0) > 0;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, width: "100%" }}>
      <section
        className="hg-scroll"
        style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, padding: `${isPhone ? 18 : 28}px ${gut}px ${isPhone ? 40 : 60}px` }}
      >
        <h1 style={{ fontSize: isPhone ? 21 : 25, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 5px" }}>
          My voice
        </h1>
        <p style={{ fontSize: isPhone ? 14 : 14.5, color: "var(--ink-body)", margin: "0 0 18px", lineHeight: 1.6 }}>
          Add up to {meta?.slots?.max || 5} of your own short videos, under {meta?.maxSeconds || 60} seconds
          each. We read how you open, the words you keep in English and how you sign off,
          then write new scripts that sound like you.
        </p>

        <VoiceBar
          voices={voices}
          activeId={activeId}
          max={maxVoices}
          creating={creating}
          onSelect={selectVoice}
          onAdd={addVoice}
          onRename={() => setRenaming(true)}
          onDelete={() => setConfirmVoiceDelete(activeVoice)}
          isPhone={isPhone}
        />

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: isPhone ? "column" : "row", gap: 9 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/shorts/…"
            aria-label="YouTube video URL"
            disabled={submitting || full}
            style={{
              flex: 1, minWidth: 0, fontSize: 14.5, padding: "13px 15px",
              border: "1px solid var(--line)", borderRadius: 11,
              background: full ? "#F2F2F2" : "var(--card)",
              color: "var(--ink)", outline: "none",
            }}
          />
          <button
            type="submit"
            className="hg-btn-primary"
            disabled={submitting || full}
            style={{
              fontSize: 14.5, fontWeight: 600, padding: "13px 22px", borderRadius: 11,
              border: "none", background: "var(--primary)", color: "#fff",
              cursor: submitting || full ? "default" : "pointer",
              opacity: submitting || full ? 0.55 : 1, whiteSpace: "nowrap",
            }}
          >
            {submitting ? "Adding…" : "Add video"}
          </button>
        </form>

        {/* Held back until the real count arrives. Rendering five empty dots and
            "0 of 5 added" while the request is in flight tells someone who has
            four videos that they have none. */}
        {!meta?.slots && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 9 }}>
            <Skeleton variant="rectangular" width={63} height={7} style={{ borderRadius: 99 }} />
            <Skeleton variant="text" width={104} height={10} />
          </div>
        )}

        {meta?.slots && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <SlotDots used={meta.slots.used} max={meta.slots.max} />
            <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
              {full
                ? `All ${meta.slots.max} slots used. Delete one to add another.`
                : `${meta.slots.used} of ${meta.slots.max} added`}
            </span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 13, padding: "12px 14px", borderRadius: 10,
              background: "#FCE8E6", border: "1px solid #F5C7C3",
              color: "var(--bad)", fontSize: 13.5, lineHeight: 1.55,
            }}
          >
            {error}
          </div>
        )}

        {meta?.mixed && (
          <div
            style={{
              marginTop: 13, padding: "12px 14px", borderRadius: 10,
              // Amber, not red. Nothing has failed here; they are being told
              // the result will be worse than it could be, which is a different
              // thing from the delete-failed box eleven lines up.
              background: "#FBF5E8", border: "1px solid #EEDCB6",
              fontSize: 13, lineHeight: 1.6, color: "var(--ink-body)",
            }}
          >
            <strong style={{ color: "var(--ink)" }}>These videos are in different languages</strong>{" "}
            ({meta.mixed.join(", ")}). A voice profile is one person, so mixing languages
            blends them into a voice that is nobody's. Keep one creator's videos here.
          </div>
        )}

        <AnalyseBlock
          voice={voice}
          voiceName={activeVoice ? voiceLabel(activeVoice) : ""}
          canAnalyse={canAnalyse}
          readyCount={meta?.ready || 0}
          analysing={analysing}
          analysed={analysed}
          onAnalyse={analyseVoice}
        />

        {openVideo && (
          <Result
            t={openVideo}
            isPhone={isPhone}
            onCopy={copyText}
            copied={copied}
            onRetry={() => { setUrl(openVideo.url); setOpenVideo(null); }}
          />
        )}

        {isNarrow && history.length > 0 && (
          <div style={{ marginTop: 34 }}>
            <RailHeading>Your videos</RailHeading>
            <VideoList items={history} activeId={openVideo?.id} onOpen={setOpenVideo} onDelete={setConfirmDelete} />
          </div>
        )}
      </section>

      {!isNarrow && (
        <aside
          className="hg-scroll"
          style={{
            flex: "0 0 clamp(280px, 24%, 400px)", minHeight: 0,
            borderLeft: "1px solid var(--line)", background: "var(--paper)",
            padding: "28px 20px 60px",
          }}
        >
          <RailHeading>Your videos</RailHeading>
          {history.length ? (
            <VideoList items={history} activeId={openVideo?.id} onOpen={setOpenVideo} onDelete={setConfirmDelete} />
          ) : (
            <p style={{ fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.6, margin: 0 }}>
              Videos you add will collect here.
            </p>
          )}
        </aside>
      )}

      {confirmDelete && (
        <ConfirmDialog
          item={confirmDelete}
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={doDelete}
        />
      )}

      {renaming && activeVoice && (
        <RenameDialog
          voice={activeVoice}
          onCancel={() => setRenaming(false)}
          onSave={doRename}
        />
      )}

      {confirmVoiceDelete && (
        <DeleteVoiceDialog
          voice={confirmVoiceDelete}
          busy={deleting}
          onCancel={() => setConfirmVoiceDelete(null)}
          onConfirm={doDeleteVoice}
        />
      )}
    </div>
  );
}

/* ── The voice selector ────────────────────────────────────────────────────
   Pills rather than a dropdown on this one screen: here the choice is the
   subject of the page, not a filter on it, and pills show the state of every
   set at once — how full each is, which is analysed, which still needs work.
   A dropdown would hide exactly that. */

function VoiceBar({ voices, activeId, max, creating, onSelect, onAdd, onRename, onDelete, isPhone }) {
  if (!voices.length) return null;

  const single = voices.length === 1;
  const activeVoice = voices.find((v) => v.id === activeId) || voices[0];

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        {voices.map((v) => {
          const on = v.id === activeId;
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              aria-pressed={on}
              className={on ? undefined : "hg-pill"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 13px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
                background: on ? "var(--ink)" : "var(--card)",
                color: on ? "#fff" : "var(--ink-body)",
                fontSize: 13.5, fontWeight: on ? 650 : 500, maxWidth: "100%",
              }}
            >
              {/* Analysed or not, at a glance. A set with videos but no analysis
                  cannot write anything, and that is worth seeing before you pick
                  it rather than after. */}
              <span
                aria-hidden="true"
                style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: v.built ? (on ? "#7BE3AD" : "var(--made)") : on ? "rgba(255,255,255,.4)" : "#D2D2D2",
                }}
              />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {voiceLabel(v)}
              </span>
              <span style={{ fontSize: 11.5, opacity: on ? 0.72 : 0.6, flexShrink: 0 }}>
                {v.videos.used}/{v.videos.max}
              </span>
            </button>
          );
        })}

        {voices.length < max && (
          <button
            onClick={onAdd}
            disabled={creating}
            className="hg-pill"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 13px", borderRadius: 999,
              cursor: creating ? "default" : "pointer",
              border: "1px dashed var(--line)", background: "transparent",
              color: "var(--ink-mute)", fontSize: 13.5, fontWeight: 500,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>+</span>
            {creating ? "Adding…" : isPhone ? "Voice" : "Another voice"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.55 }}>
          {single
            ? "Videos you add here teach this voice. Add another voice for a second channel or language."
            : `Adding to “${voiceLabel(activeVoice)}”. Each voice keeps its own videos.`}
        </span>

        <span style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
          <TinyLink onClick={onRename}>Rename</TinyLink>
          {/* Deleting the only voice is refused by the server anyway — not
              offering it here saves someone finding that out the hard way. */}
          {!single && <TinyLink onClick={onDelete} danger>Delete voice</TinyLink>}
        </span>
      </div>
    </div>
  );
}

function TinyLink({ onClick, danger, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none", background: "none", padding: 0, cursor: "pointer",
        fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
        color: danger ? "var(--bad)" : "var(--ink-mute)",
        textDecoration: "underline", textUnderlineOffset: 3,
      }}
    >
      {children}
    </button>
  );
}

/** Renaming, unlike the first naming, is entirely optional — so this one closes. */
function RenameDialog({ voice, onCancel, onSave }) {
  const [name, setName] = useState(voice.name || "");
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <>
      <div onClick={onCancel} className="hg-fade" style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,.4)", zIndex: 70 }} />
      <form
        onSubmit={(e) => { e.preventDefault(); onSave(name); }}
        role="dialog"
        aria-modal="true"
        aria-label="Rename voice"
        className="hg-dialog-in"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 71, width: "min(400px, calc(100vw - 32px))",
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", padding: 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.5)",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 12, letterSpacing: "-0.02em" }}>
          Rename this voice
        </div>
        <input
          ref={ref}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          aria-label="Voice name"
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 15, padding: "11px 13px",
            border: "1px solid var(--line)", borderRadius: 10, background: "var(--card)",
            color: "var(--ink)", outline: "none", fontFamily: "inherit",
          }}
        />
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.55, margin: "10px 0 0" }}>
          Scripts you already wrote keep the name they were made under.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onCancel}
            className="hg-btn-ghost"
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className={name.trim() ? "hg-btn-primary" : undefined}
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10, border: "none",
              background: name.trim() ? "var(--primary)" : "#E5E5E5",
              color: name.trim() ? "#fff" : "var(--ink-mute)",
              cursor: name.trim() ? "pointer" : "default",
            }}
          >
            Save
          </button>
        </div>
      </form>
    </>
  );
}

function DeleteVoiceDialog({ voice, busy, onCancel, onConfirm }) {
  return (
    <>
      <div onClick={busy ? undefined : onCancel} className="hg-fade" style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,.4)", zIndex: 70 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete voice"
        className="hg-dialog-in"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 71, width: "min(440px, calc(100vw - 32px))",
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", padding: 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.5)",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em" }}>
          Delete “{voiceLabel(voice)}”?
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 6px" }}>
          Its {voice.videos?.used || 0} video{(voice.videos?.used || 0) === 1 ? "" : "s"} and what we
          learned from them go with it.
        </p>
        {/* Said plainly, because it is the question someone actually has before
            they press this. */}
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-mute)", margin: "0 0 18px" }}>
          Scripts you wrote in this voice are <strong style={{ color: "var(--ink)" }}>kept</strong> — they
          stay in My scripts with the name they were written under.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            className="hg-btn-ghost"
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: busy ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--bad)", background: "var(--bad)", color: "#fff",
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Deleting…" : "Delete voice"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function SlotDots({ used, max }) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }} aria-hidden="true">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 7, height: 7, borderRadius: "50%",
            // Not the accent. Red is breaking news, errors and Delete in this
            // app; a filled voice slot is progress, and it reads as a warning
            // in red. --made is the "you built something" hue, same as the
            // scripts count on the dashboard.
            background: i < used ? "var(--made)" : "#DCDCDC",
          }}
        />
      ))}
    </span>
  );
}

function AnalyseBlock({ voice, voiceName, canAnalyse, readyCount, analysing, analysed, onAnalyse }) {
  const profile = voice?.profile;
  // Behind if the profile never saw the current set — either the server says so,
  // or a video was added or deleted since it last ran.
  const stale = profile && (voice?.stale || profile.transcript_count !== readyCount);

  return (
    <section
      style={{
        marginTop: 22, padding: 18, borderRadius: "var(--radius)",
        background: "var(--card)",
        border: `1px solid ${stale ? "#F7CFCF" : "var(--line)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>
            {profile
              ? voiceName ? `“${voiceName}” — what we learned` : "Your voice profile"
              : "Analyse this voice"}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-body)" }}>
            {!canAnalyse
              ? "Add at least one video, then analyse."
              : stale
              ? `Your videos changed since this was built. Re-analyse to use all ${readyCount}.`
              : profile
              ? `${profile.language_label || "Learned"} · from ${profile.transcript_count} video${profile.transcript_count === 1 ? "" : "s"}`
              : `Ready to analyse ${readyCount} video${readyCount === 1 ? "" : "s"}. This runs once, not per video.`}
          </div>
          {profile && !stale && profile.confidence === "thin" && (
            <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 6, lineHeight: 1.55 }}>
              One video is a hint, not a voice. Three or more is where scripts start
              genuinely sounding like you.
            </div>
          )}
        </div>

        <button
          onClick={onAnalyse}
          disabled={!canAnalyse || analysing}
          className={!canAnalyse || analysing ? undefined : "hg-btn-primary"}
          style={{
            fontSize: 14, fontWeight: 600, padding: "11px 18px", borderRadius: 11,
            border: "none", flexShrink: 0,
            background: !canAnalyse || analysing ? "#E5E5E5" : "var(--primary)",
            color: !canAnalyse || analysing ? "var(--ink-mute)" : "#fff",
            cursor: !canAnalyse || analysing ? "default" : "pointer",
          }}
        >
          {analysing ? "Analysing…" : profile ? "Re-analyse" : "Analyse my voice"}
        </button>
      </div>

      {analysed && !analysing && profile && (
        <div
          className="hg-rise"
          style={{
            marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)",
            display: "flex", flexDirection: "column", gap: 9,
          }}
        >
          {profile.sample_openings?.length > 0 && (
            <ProfileRow label="How you open">
              <span className="indic">“{profile.sample_openings[0]}”</span>
            </ProfileRow>
          )}
          {profile.signature_phrases?.length > 0 && (
            <ProfileRow label="Your phrases">
              <span className="indic">{profile.signature_phrases.slice(0, 6).join(" · ")}</span>
            </ProfileRow>
          )}
          {profile.sentiment && <ProfileRow label="Your stance">{profile.sentiment}</ProfileRow>}
        </div>
      )}
    </section>
  );
}

function ProfileRow({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>{children}</div>
    </div>
  );
}

function ConfirmDialog({ item, busy, onCancel, onConfirm }) {
  return (
    <>
      <div
        onClick={busy ? undefined : onCancel}
        className="hg-fade"
        style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,.4)", zIndex: 70 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete video"
        className="hg-dialog-in"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 71, width: "min(420px, calc(100vw - 32px))",
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", padding: 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.5)",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em" }}>
          Delete this video?
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 6px" }}>
          <span className="indic" style={{ fontWeight: 600, color: "var(--ink)" }}>
            {item.title || item.url}
          </span>
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 0 18px" }}>
          Its transcript goes too, and it frees a slot. Your voice profile keeps working
          until you re-analyse without it.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            className="hg-btn-ghost"
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: busy ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--bad)", background: "var(--bad)", color: "#fff",
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </>
  );
}

function RailHeading({ children }) {
  return (
    <h2
      style={{
        fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
        textTransform: "uppercase", color: "var(--ink-mute)", margin: "0 0 11px",
      }}
    >
      {children}
    </h2>
  );
}

function VideoList({ items, activeId, onOpen, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((it) => {
        const on = it.id === activeId;
        return (
          <div
            key={it.id}
            className={on ? undefined : "hg-row"}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 10px 12px",
              background: on ? "#F2F2F2" : "var(--card)",
              border: `1px solid ${on ? "#D0D0D0" : "var(--line)"}`,
              borderRadius: 10,
            }}
          >
            <button
              onClick={() => onOpen(it)}
              style={{
                flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
                border: "none", background: "transparent", padding: 0,
              }}
            >
              <span
                className="indic"
                style={{
                  display: "block", fontSize: 13.5, fontWeight: 500, color: "var(--ink)",
                  lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {it.title || it.url}
              </span>
              <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--ink-mute)", marginTop: 3 }}>
                <StatusTag status={it.status} />
                {it.duration_seconds != null && <span>{it.duration_seconds}s</span>}
                {it.language_label && <span>· {it.language_label}</span>}
              </span>
            </button>

            <button
              onClick={() => onDelete(it)}
              aria-label={`Delete ${it.title || "video"}`}
              title="Delete"
              className="hg-icon-btn"
              style={{
                flexShrink: 0, display: "grid", placeItems: "center",
                width: 30, height: 30, borderRadius: 8,
                border: "1px solid transparent", background: "transparent",
                color: "var(--ink-mute)", cursor: "pointer",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Result({ t, isPhone, onCopy, copied, onRetry }) {
  if (t.status === "processing") return <Processing />;

  if (t.status === "failed") {
    return (
      <div style={{ marginTop: 22, padding: 19, borderRadius: "var(--radius)", background: "#FCE8E6", border: "1px solid #F5C7C3" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--bad)", marginBottom: 6 }}>
          Couldn't read this video
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-body)" }}>
          {t.error || "Something went wrong."}
        </div>
        <button
          onClick={onRetry}
          className="hg-btn-ghost"
          style={{
            marginTop: 13, fontSize: 13, fontWeight: 600, padding: "8px 14px",
            borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)",
            color: "var(--ink-body)", cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      className="hg-rise"
      style={{
        marginTop: 22, background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: "var(--radius)", overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap", padding: "13px 17px",
          borderBottom: "1px solid var(--line)", background: "#F9F9F9",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {t.title && (
            <div
              className="indic"
              style={{
                fontSize: 14.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {t.title}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: t.title ? 6 : 0, flexWrap: "wrap" }}>
            {t.language_label && (
              <span
                style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                  color: "var(--made)", background: "var(--made-tint)", border: "1px solid var(--made-line)",
                }}
              >
                {t.language_label}
              </span>
            )}
            {t.duration_seconds != null && (
              <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{t.duration_seconds}s</span>
            )}
            <a href={t.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--ink-mute)", textDecoration: "none" }}>
              open on YouTube ↗
            </a>
          </div>
        </div>

        <button
          onClick={onCopy}
          className="hg-btn-ghost"
          style={{
            fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 9,
            border: "1px solid var(--line)", background: "var(--card)",
            color: copied ? "var(--ok)" : "var(--ink-body)", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {copied ? "Copied" : "Copy transcript"}
        </button>
      </div>

      <div
        className="indic"
        style={{
          padding: isPhone ? 18 : 26, fontSize: isPhone ? 15.5 : 16.5,
          color: "var(--ink)", whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}
      >
        {t.text}
      </div>
    </div>
  );
}

function Processing() {
  return (
    <div
      style={{
        marginTop: 22, padding: 24, borderRadius: "var(--radius)",
        background: "var(--card)", border: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 14,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18, height: 18, borderRadius: "50%",
          border: "2px solid var(--line)", borderTopColor: "var(--made)",
          animation: "hg-spin .8s linear infinite", flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Listening to the video…</div>
        <div style={{ fontSize: 13, color: "var(--ink-mute)", marginTop: 3 }}>
          A few seconds for a Short. You can leave this page open.
        </div>
      </div>
    </div>
  );
}

function StatusTag({ status }) {
  const map = {
    done:       { label: "Ready",   color: "var(--ok)",     bg: "#E6F4EA",            border: "#B7E1C4" },
    // "Working" was red, which put it in the same colour as "Failed" two rows
    // down and made a healthy queue look like a screen full of problems.
    processing: { label: "Working", color: "var(--made)", bg: "var(--made-tint)", border: "var(--made-line)" },
    failed:     { label: "Failed",  color: "var(--bad)",    bg: "#FCE8E6",            border: "#F5C7C3" },
  };
  const s = map[status] || map.processing;
  return (
    <span
      style={{
        fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
        color: s.color, background: s.bg, border: `1px solid ${s.border}`,
        whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}
