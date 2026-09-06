import { useState, useEffect, useRef, useCallback } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Skeleton from "../Shell/Skeleton";
import Chevron from "../Shell/Chevron";
import { useProfiles } from "../../state/ProfileContext";

/**
 * My voice: the videos that teach us how this creator talks.
 *
 * ── ONE VOICE PER CHANNEL ────────────────────────────────────────────────────
 * Everything on this screen belongs to the profile they are working in. A
 * creator running a Hindi tech channel and an English one keeps two profiles,
 * and each has its OWN five videos and its own single voice, because a voice
 * built from both is a voice that is nobody's.
 *
 * Which channel that is, is shown by the app bar above every screen
 * (Shell/TopBar.js) rather than by a picker here. Adding a video to the wrong
 * channel costs a transcription to undo, so it should be a thing you cannot
 * help seeing, not one you have to go and check.
 *
 * ── WHY THIS SCREEN IS ONE COLUMN AND TWO NUMBERED STEPS ────────────────────
 * It used to be a wide two-pane layout: a URL box and a lone "Re-analyse"
 * button on the left, the videos in a rail off to the right. On the first
 * visit that reads fine, because there is one obvious thing to do. On every
 * visit after, it does not. A creator coming back met a button offering to
 * re-analyse, with the set it would run over sitting in a different column,
 * and no way to see what the last analysis had actually produced.
 *
 * So the screen is now the order the job is done in, top to bottom:
 *
 *   1  Your videos   what the voice is learned from, with thumbnails, so the
 *                    set is a thing you look at rather than a count you trust
 *   2  Your voice    what we learned from them, and the one button that
 *                    (re)builds it
 *
 * The analyse button sits directly under the list it consumes, so pressing it
 * is the last step of something visible instead of an isolated act. And what
 * the analysis found is on the page permanently, not only in the seconds after
 * it ran, which is what made a second visit feel like a dead end.
 *
 * ── WHY ANALYSIS IS A BUTTON, NOT AUTOMATIC ──────────────────────────────────
 * Profiling on every added URL would re-analyse the whole set five times while
 * someone pastes five links, paying four times for a profile that is thrown
 * away. Worse, the intermediate profiles are wrong: a voice built from video
 * one is a different voice from one built from all five, so the output would
 * change under the user for reasons they cannot see. Adding is cheap and
 * incremental; analysing is one deliberate act over the finished set.
 *
 * Transcription still happens per video on add, because that is the part that
 * genuinely is per-video and it lets someone read each transcript as they go.
 */
export default function TranscribePanel({ onQuota, onVoiceChange, onGoProfiles }) {
  const isPhone = useIsMobile(680);

  const {
    profiles, activeId, active: activeProfile,
    refresh: refreshProfiles, loading: profilesLoading,
  } = useProfiles();

  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openVideo, setOpenVideo] = useState(null);
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState(null);      // slots, ready_count, mixed_languages
  const [copied, setCopied] = useState(false);

  const [voice, setVoice] = useState(null);
  const [analysing, setAnalysing] = useState(false);

  // Opens itself right after an analysis, because that is the one moment the
  // creator is actively asking "so what did you find". On a later visit it
  // starts shut: the summary line is what most people came for.
  const [learnedOpen, setLearnedOpen] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmVoiceDelete, setConfirmVoiceDelete] = useState(false);
  const [deletingVoice, setDeletingVoice] = useState(false);

  const pollRef = useRef(null);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/transcribe", {
        params: { limit: 20, ...(activeId ? { profile: activeId } : {}) },
      });
      setHistory(data.transcripts || []);
      setMeta({
        slots: data.slots,
        ready: data.ready_count || 0,
        mixed: data.mixed_languages,
        maxSeconds: data.max_seconds || 60,
      });
      onQuota?.(data.quota || null);
    } catch { /* secondary, never block the main flow on it */ }
  }, [onQuota, activeId]);

  const loadVoice = useCallback(async () => {
    try {
      const { data } = await api.get("/script/voice", {
        params: activeId ? { profile: activeId } : {},
      });
      setVoice(data);
    } catch { /* the panel degrades to "not built yet" */ }
  }, [activeId]);

  // Held until the profile list arrives. Fetching against "whatever the server
  // thinks is default" and then again against the real selection would show one
  // channel's videos for a moment before swapping to another's, the exact
  // confusion this screen has to avoid.
  useEffect(() => {
    if (profilesLoading) return;
    loadHistory();
    loadVoice();
  }, [loadHistory, loadVoice, profilesLoading]);

  // Switching channels switches everything on screen. The open transcript
  // belongs to the profile that was selected a moment ago.
  useEffect(() => {
    clearInterval(pollRef.current);
    setOpenVideo(null);
    setLearnedOpen(false);
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
      // The profile is named explicitly. Letting the server pick would mean a
      // video landing in whichever channel it considers default, and paying to
      // transcribe it into the wrong one.
      const { data } = await api.post("/transcribe", { url: value, profile: activeId || undefined });
      setOpenVideo(data.transcript);
      setUrl("");
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
      const { data } = await api.post(`/profiles/${activeId}/analyse`);
      setVoice((v) => ({ ...(v || {}), profile: data.voice, stale: false }));
      setLearnedOpen(true);
      // Refreshes the shared list so every other screen sees this channel's
      // voice as built: the dashboard card, the order panel, the profile page.
      await refreshProfiles();
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't analyse your voice. Please try again."));
    } finally {
      setAnalysing(false);
    }
  }

  async function doDeleteVoice() {
    if (deletingVoice || !activeId) return;
    setDeletingVoice(true);
    setError("");
    try {
      await api.delete(`/profiles/${activeId}/voice`);
      setVoice((v) => ({ ...(v || {}), profile: null, stale: false }));
      setLearnedOpen(false);
      setConfirmVoiceDelete(false);
      await refreshProfiles();
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete this voice."));
      setConfirmVoiceDelete(false);
    } finally {
      setDeletingVoice(false);
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
  const readyCount = meta?.ready || 0;
  const canAnalyse = readyCount > 0;
  const built = voice?.profile || null;
  // Behind if the analysis never saw the current set: either the server says
  // so, or a video was added or deleted since it last ran.
  const stale = !!built && (voice?.stale || built.transcript_count !== readyCount);

  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0, width: "100%" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: `${isPhone ? 18 : 28}px ${gut}px ${isPhone ? 40 : 60}px` }}>
        {/* No profile picker here, the app bar above carries it on every
            screen. See Shell/TopBar.js. */}
        <h1 style={{ fontSize: isPhone ? 21 : 25, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 5px" }}>
          My voice
        </h1>

        <p style={{ fontSize: isPhone ? 14 : 14.5, color: "var(--ink-body)", margin: "0 0 18px", lineHeight: 1.6 }}>
          Add up to {meta?.slots?.max || 5} of your own short videos, under {meta?.maxSeconds || 60} seconds
          each. We read how you open, the words you keep in English and how you sign off,
          then write new scripts that sound like you.
        </p>

        {/* One voice per channel, so a creator who needs a second voice needs a
            second channel, and that is created under Profile where its
            categories get set at the same time. */}
        {activeProfile && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              padding: "11px 14px", borderRadius: 11, marginBottom: 20,
              background: "var(--made-tint)", border: "1px solid var(--made-line)",
            }}
          >
            <span style={{ fontSize: 13.5, color: "var(--ink-body)", lineHeight: 1.5 }}>
              These videos teach{" "}
              <strong style={{ color: "var(--ink)" }}>{activeProfile.name}</strong>
              {profiles.length > 1 ? ". Each channel keeps its own." : ""}
            </span>
            <button
              onClick={onGoProfiles}
              style={{
                marginLeft: "auto", border: "none", background: "none", padding: 0,
                fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", color: "var(--made)",
                cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3,
              }}
            >
              {profiles.length > 1 ? "Manage channels" : "Add another channel"}
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 16, padding: "12px 14px", borderRadius: 10,
              background: "#FCE8E6", border: "1px solid #F5C7C3",
              color: "var(--bad)", fontSize: 13.5, lineHeight: 1.55,
            }}
          >
            {error}
          </div>
        )}

        {/* ── 1. The set ─────────────────────────────────────────────────── */}
        <Step
          n="1"
          title="Your videos"
          aside={
            meta?.slots
              ? `${meta.slots.used} of ${meta.slots.max} added`
              : <Skeleton variant="text" width={78} height={10} />
          }
        >
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

          {full && (
            <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.55 }}>
              All {meta.slots.max} slots used. Delete one below to add another.
            </p>
          )}

          {meta?.mixed && (
            <div
              style={{
                marginTop: 13, padding: "12px 14px", borderRadius: 10,
                // Amber, not red. Nothing has failed here; they are being told
                // the result will be worse than it could be, which is a
                // different thing from an error.
                background: "#FBF5E8", border: "1px solid #EEDCB6",
                fontSize: 13, lineHeight: 1.6, color: "var(--ink-body)",
              }}
            >
              <strong style={{ color: "var(--ink)" }}>These videos are in different languages</strong>{" "}
              ({meta.mixed.join(", ")}). A voice profile is one person, so mixing languages
              blends them into a voice that is nobody's. Keep one creator's videos here.
            </div>
          )}

          {/* Held back until the real list arrives. "No videos yet" shown for
              half a second to someone who has four is a claim, and a wrong one. */}
          {!meta?.slots ? (
            <div style={{ marginTop: 16 }}><VideoSkeleton /></div>
          ) : history.length ? (
            <div style={{ marginTop: 16 }}>
              <VideoList
                items={history}
                activeId={openVideo?.id}
                isPhone={isPhone}
                onOpen={(v) => setOpenVideo((cur) => (cur?.id === v.id ? null : v))}
                onDelete={setConfirmDelete}
              />
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.6, margin: "16px 0 0" }}>
              Nothing added yet. Paste a link to one of your own Shorts above.
            </p>
          )}
        </Step>

        {openVideo && (
          <Result
            t={openVideo}
            isPhone={isPhone}
            onCopy={copyText}
            copied={copied}
            onClose={() => setOpenVideo(null)}
            onRetry={() => { setUrl(openVideo.url); setOpenVideo(null); }}
          />
        )}

        {/* ── 2. What we make of them ────────────────────────────────────── */}
        <Step n="2" title="Your voice">
          <VoiceBlock
            built={built}
            stale={stale}
            readyCount={readyCount}
            canAnalyse={canAnalyse}
            analysing={analysing}
            learnedOpen={learnedOpen}
            onToggleLearned={() => setLearnedOpen((v) => !v)}
            onAnalyse={analyseVoice}
            onDeleteVoice={() => setConfirmVoiceDelete(true)}
            isPhone={isPhone}
          />
        </Step>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this video?"
          label="Delete video"
          busy={deleting}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={doDelete}
        >
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 6px" }}>
            <span className="indic" style={{ fontWeight: 600, color: "var(--ink)" }}>
              {confirmDelete.title || confirmDelete.url}
            </span>
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: 0 }}>
            Its transcript goes too, and it frees a slot. Your voice keeps working
            until you analyse again without it.
          </p>
        </ConfirmDialog>
      )}

      {confirmVoiceDelete && (
        <ConfirmDialog
          title="Delete this voice?"
          label="Delete voice"
          busy={deletingVoice}
          confirmLabel="Delete voice"
          busyLabel="Deleting…"
          onCancel={() => setConfirmVoiceDelete(false)}
          onConfirm={doDeleteVoice}
        >
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 10px" }}>
            Your {history.length === 1 ? "video stays" : "videos stay"} where they are, and you can
            analyse again whenever you like.
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: 0 }}>
            Scripts you have already written keep the voice they were written in. If you
            order a new one before analysing again, we rebuild the voice from these
            videos first, so nothing here blocks writing.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/* ── Layout ────────────────────────────────────────────────────────────── */

/**
 * One numbered step.
 *
 * The number is doing real work, not decoration: it says there is an order to
 * this, and which end of it you are at. Without it the two cards read as two
 * unrelated features that happen to share a page, which is how someone ends up
 * pressing analyse without knowing what it will run over.
 */
function Step({ n, title, aside, children }) {
  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span
          aria-hidden="true"
          style={{
            display: "grid", placeItems: "center", flexShrink: 0,
            width: 22, height: 22, borderRadius: "50%",
            background: "var(--ink)", color: "#fff",
            fontSize: 11.5, fontWeight: 700,
          }}
        >
          {n}
        </span>
        <h2
          style={{
            fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
            textTransform: "uppercase", color: "var(--ink-mute)", margin: 0,
          }}
        >
          {title}
        </h2>
        {aside != null && (
          <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-mute)" }}>{aside}</span>
        )}
      </div>
      <div
        style={{
          padding: 18, borderRadius: "var(--radius)",
          background: "var(--card)", border: "1px solid var(--line)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

/* ── The voice ─────────────────────────────────────────────────────────── */

/**
 * What we learned, and the one button that builds it.
 *
 * The summary line answers the question a returning creator actually has,
 * which is "is this built, and is it built from what I have now". The button
 * label follows from that rather than from whether a profile exists: "Analyse
 * my voice" when there is nothing, "Analyse again" when the set has moved on.
 */
function VoiceBlock({
  built, stale, readyCount, canAnalyse, analysing,
  learnedOpen, onToggleLearned, onAnalyse, onDeleteVoice, isPhone,
}) {
  const label = analysing
    ? "Analysing…"
    : !built
    ? "Analyse my voice"
    : "Analyse again";

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: isPhone ? "stretch" : "center",
          flexDirection: isPhone ? "column" : "row",
          justifyContent: "space-between", gap: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>
            {built ? "Built" : "Not built yet"}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>
            {!canAnalyse
              ? built
                // Built once, and every video it was built from has since been
                // deleted. The voice still works; there is just nothing left to
                // rebuild it from until they add something.
                ? `Learned from ${built.transcript_count} video${built.transcript_count === 1 ? "" : "s"} that are no longer here. Add one above to analyse again.`
                : "Add a video above first. That is what your voice is learned from."
              : stale
              ? `Your videos changed since this was built. Analyse again to use all ${readyCount} of them.`
              : built
              ? `${built.language_label || "Learned"} · from ${built.transcript_count} video${built.transcript_count === 1 ? "" : "s"}`
              : `Ready to read ${readyCount} video${readyCount === 1 ? "" : "s"}. This runs once over the set, not once per video.`}
          </div>
          {built && !stale && built.confidence === "thin" && (
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
            fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
            border: "none", flexShrink: 0, whiteSpace: "nowrap",
            background: !canAnalyse || analysing ? "#E5E5E5" : "var(--primary)",
            color: !canAnalyse || analysing ? "var(--ink-mute)" : "#fff",
            cursor: !canAnalyse || analysing ? "default" : "pointer",
          }}
        >
          {label}
        </button>
      </div>

      {/* ── What we learned ──────────────────────────────────────────────
          On the page permanently once a voice exists, not only in the seconds
          after it was built. A creator coming back a week later wants to check
          what this thing thinks they sound like, and previously there was no
          way to ask. */}
      {built && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <button
            type="button"
            onClick={onToggleLearned}
            aria-expanded={learnedOpen}
            aria-controls="hg-voice-learned"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, width: "100%", padding: 0, border: "none", background: "none",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              fontSize: 13, fontWeight: 650, color: "var(--ink)",
            }}
          >
            <span>What we learned</span>
            <Chevron open={learnedOpen} />
          </button>

          {learnedOpen && (
            <div
              id="hg-voice-learned"
              className="hg-rise"
              style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 11 }}
            >
              {built.sample_openings?.length > 0 && (
                <VoiceRow label="How you open">
                  <span className="indic">“{built.sample_openings[0]}”</span>
                </VoiceRow>
              )}
              {built.sample_closings?.length > 0 && (
                <VoiceRow label="How you close">
                  <span className="indic">“{built.sample_closings[0]}”</span>
                </VoiceRow>
              )}
              {built.signature_phrases?.length > 0 && (
                <VoiceRow label="Your phrases">
                  <span className="indic">{built.signature_phrases.slice(0, 6).join(" · ")}</span>
                </VoiceRow>
              )}
              {built.sentiment && <VoiceRow label="Your stance">{built.sentiment}</VoiceRow>}
              {built.pacing && <VoiceRow label="Your pacing">{built.pacing}</VoiceRow>}
              {built.audience && <VoiceRow label="Talking to">{built.audience}</VoiceRow>}
            </div>
          )}

          {/* Quiet, and last. Destroying work should be findable without being
              the thing your eye lands on. */}
          <button
            onClick={onDeleteVoice}
            style={{
              marginTop: 14, border: "none", background: "none", padding: 0,
              fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", color: "var(--ink-mute)",
              cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            Delete this voice
          </button>
        </div>
      )}
    </div>
  );
}

function VoiceRow({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>{children}</div>
    </div>
  );
}

/* ── The videos ────────────────────────────────────────────────────────── */

function VideoList({ items, activeId, isPhone, onOpen, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => {
        const on = it.id === activeId;
        return (
          <div
            key={it.id}
            className={on ? undefined : "hg-row"}
            style={{
              display: "flex", alignItems: "center", gap: 11, padding: 9,
              background: on ? "#F2F2F2" : "var(--card)",
              border: `1px solid ${on ? "#D0D0D0" : "var(--line)"}`,
              borderRadius: 11,
            }}
          >
            <Thumb src={it.thumbnail} isPhone={isPhone} />

            <button
              onClick={() => onOpen(it)}
              aria-expanded={on}
              style={{
                flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
                border: "none", background: "transparent", padding: 0, fontFamily: "inherit",
              }}
            >
              <span
                className="indic"
                style={{
                  display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)",
                  lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {it.title || it.url}
              </span>
              <span
                style={{
                  display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap",
                  fontSize: 11.5, color: "var(--ink-mute)", marginTop: 5,
                }}
              >
                <StatusTag status={it.status} />
                {it.duration_seconds != null && <span>{formatDuration(it.duration_seconds)}</span>}
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
                width: 32, height: 32, borderRadius: 8,
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

/**
 * The still from the video.
 *
 * Worth the pixels because it is how a creator recognises which of their own
 * Shorts this row is. A title in a script they do not read fluently at a
 * glance, or five titles that all start with the same three words, is not
 * identification; the frame is.
 */
function Thumb({ src, isPhone }) {
  const w = isPhone ? 68 : 92;
  const h = Math.round((w * 9) / 16);
  const [failed, setFailed] = useState(false);

  const box = {
    width: w, height: h, flexShrink: 0, borderRadius: 8,
    background: "#EDEDED", border: "1px solid var(--line)",
    objectFit: "cover", display: "block",
  };

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ ...box, display: "grid", placeItems: "center", color: "#B9B9B9" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="10 8 16 12 10 16 10 8" />
          <rect x="3" y="4" width="18" height="16" rx="3" />
        </svg>
      </span>
    );
  }

  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} style={box} />;
}

function VideoSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "center", gap: 11, padding: 9,
            border: "1px solid var(--line)", borderRadius: 11, background: "var(--card)",
          }}
        >
          <Skeleton variant="rectangular" width={92} height={52} style={{ borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <Skeleton variant="text" width="62%" height={12} />
            <div style={{ height: 7 }} />
            <Skeleton variant="text" width="34%" height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** "51s" under a minute, "1:24" over it. Nobody counts in 84 seconds. */
function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ── The transcript ────────────────────────────────────────────────────── */

function Result({ t, isPhone, onCopy, copied, onRetry, onClose }) {
  if (t.status === "processing") return <Processing />;

  if (t.status === "failed") {
    return (
      <div style={{ marginTop: 16, padding: 19, borderRadius: "var(--radius)", background: "#FCE8E6", border: "1px solid #F5C7C3" }}>
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
        marginTop: 16, background: "var(--card)", border: "1px solid var(--line)",
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
              <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{formatDuration(t.duration_seconds)}</span>
            )}
            <a href={t.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--ink-mute)", textDecoration: "none" }}>
              open on YouTube ↗
            </a>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          <button
            onClick={onClose}
            className="hg-btn-ghost"
            style={{
              fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 9,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Close
          </button>
        </div>
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
        marginTop: 16, padding: 24, borderRadius: "var(--radius)",
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
    done:       { label: "Ready",   color: "var(--ok)",   bg: "#E6F4EA",          border: "#B7E1C4" },
    // "Working" was red, which put it in the same colour as "Failed" two rows
    // down and made a healthy queue look like a screen full of problems.
    processing: { label: "Working", color: "var(--made)", bg: "var(--made-tint)", border: "var(--made-line)" },
    failed:     { label: "Failed",  color: "var(--bad)",  bg: "#FCE8E6",          border: "#F5C7C3" },
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

/* ── Dialogs ───────────────────────────────────────────────────────────── */

function ConfirmDialog({ title, label, children, busy, confirmLabel, busyLabel, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

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
        aria-label={label}
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
          {title}
        </div>
        <div style={{ marginBottom: 18 }}>{children}</div>
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
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
