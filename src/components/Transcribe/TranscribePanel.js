import { useState, useEffect, useCallback } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Skeleton from "../Shell/Skeleton";
import { useProfiles } from "../../state/ProfileContext";
import { useVoice } from "../../state/VoiceContext";
import { useShowcase } from "../../state/ShowcaseContext";
import { useCredits } from "../../state/CreditsContext";
import VoiceAnalysing from "./VoiceAnalysing";

/**
 * My voice: the videos that teach us how this creator talks.
 *
 * ── ONE VOICE PER ACCOUNT ────────────────────────────────────────────────────
 * Every video here teaches the account's single voice. There is nothing to
 * pick and nothing to get wrong, which is the point: adding a video costs a
 * transcription, and a transcription spent on the wrong channel was the one
 * mistake this screen could make. See ProfileContext.js.
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
 * ── ADDING A VIDEO COSTS NOTHING ─────────────────────────────────────────────
 * Pasting a link buys only its title, length and thumbnail. The video is not
 * read, and no expensive model is called, until the creator presses Analyse my
 * voice. Somebody trying five links and changing their mind now costs a fraction
 * of a cent instead of five video reads. See backend/routes/transcribe.js.
 *
 * That also removed the transcript viewer that used to sit under this screen.
 * There is no transcript to show until an analysis has run, and nobody came here
 * to read one: they came to teach the product how they talk.
 *
 * ── SO ANALYSE IS SLOW, AND THIS SCREEN DOES NOT OWN THE WAIT ────────────────
 * It reads every pending video and then analyses them, which runs to minutes.
 * The request cannot be held open that long, so it kicks the work off and the
 * server reports back over the socket.
 *
 * None of that state lives here any more. It lives in state/VoiceContext.js,
 * above the router, for two reasons. The first is a bug this screen had: the
 * poll it relied on was armed by an effect watching the voice row, and the
 * press that started a build did not refetch that row, so the effect never ran,
 * nothing ever polled, and "Analysing…" stayed on screen until the creator
 * hard-refreshed a build that had finished minutes earlier. The second is that
 * a creator does not sit and watch this: they go to Create while it runs, and a
 * wait owned by a panel is a wait that ends somewhere nobody is looking.
 */
export default function TranscribePanel({ onVoiceChange, onGoProfiles, onGoTopics }) {
  const isPhone = useIsMobile(680);

  const {
    activeId, active: activeProfile,
    refresh: refreshProfiles, loading: profilesLoading,
  } = useProfiles();

  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState(null);      // slots, ready_count, mixed_languages

  // ── The voice, and the build, come from above ─────────────────────────────
  // Shared with Create so both screens answer "is there a voice" the same way
  // at the same moment, and so a build survives leaving this screen entirely.
  // `justBuilt` is set only for a build this session watched start, so a
  // returning creator is not congratulated for something they did last week.
  const {
    voice, building: analysing, progress, error: voiceError,
    analyse, refresh: refreshVoice, justBuilt, clearJustBuilt, clearError,
  } = useVoice();

  // Why the analyse button is unavailable, shown on hover and on click. See
  // the button itself for why it is not simply `disabled`.
  const { balance, openBuy, canBuy } = useCredits();

  const [hint, setHint] = useState(false);

  // ── WHICH OF THE TWO VOICES IS ON SCREEN ────────────────────────────────
  // A creator has two: the short-form one, learned from Shorts, and the
  // long-form one, learned from their multi-story videos. They are trained from
  // different videos and used for different script lengths, so the whole screen
  // switches with this rather than trying to show both sets at once.
  const [lane, setLane] = useState("short");

  const [confirmDelete, setConfirmDelete] = useState(null);
  // A showcase visitor may look at everything here and change nothing: the
  // videos and the voice belong to a demo an admin built. Every mutating
  // control is swapped for the invitation to sign up, at which point all of it
  // becomes theirs to edit. See state/ShowcaseContext.js.
  const { isShowcase, openSignUp } = useShowcase();
  const [deleting, setDeleting] = useState(false);
  const [confirmVoiceDelete, setConfirmVoiceDelete] = useState(false);
  const [deletingVoice, setDeletingVoice] = useState(false);

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
        laneSlots: data.lane_slots || null,
        lanes: data.lanes || null,
        shortMax: data.short_max_seconds || 180,
        longMin: data.long_min_seconds || 180,
        longMax: data.long_max_seconds || 900,
        splitSeconds: data.lane_split_seconds || 120,
      });
    } catch { /* secondary, never block the main flow on it */ }
  }, [activeId]);

  // Held until the profile list arrives. Fetching against "whatever the server
  // thinks is default" and then again against the real selection would show one
  // channel's videos for a moment before swapping to another's, the exact
  // confusion this screen has to avoid.
  useEffect(() => {
    if (profilesLoading) return;
    loadHistory();
  }, [loadHistory, profilesLoading]);

  // Switching channels switches everything on screen. The open transcript
  // belongs to the profile that was selected a moment ago.
  useEffect(() => { setError(""); }, [activeId]);

  // The build's own failures arrive on the shared store, from an event or a
  // poll rather than from a request this screen made. Mirrored into the local
  // banner so there is one place errors appear, and handed back so leaving and
  // returning does not replay a failure that has already been read.
  useEffect(() => {
    if (!voiceError) return;
    setError(voiceError);
    clearError();
  }, [voiceError, clearError]);

  // ── WHY THE LIST POLLS ITSELF ─────────────────────────────────────────────
  // A video added a second ago is still being transcribed, and a transcribing
  // video cannot be analysed. Without this the creator adds a link, sees the
  // analyse button stay off, and has no way to know it will come on: the only
  // poll we had followed the open transcript, not the set. `waiting` is a
  // boolean rather than the list itself so this re-arms when the answer
  // changes, not on every refresh.
  // Scoped to the visible lane once the rows carry one. A long video still
  // being read is not a reason to tell somebody on the short tab to wait.
  const waiting = history.some(
    (h) => h.status === "processing" && (h.lane || "short") === lane
  );

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(loadHistory, 4000);
    return () => clearInterval(t);
  }, [waiting, loadHistory]);

  // ── AND WHY IT ALSO FOLLOWS THE BUILD ─────────────────────────────────────
  // The build reads every pending video as its first act, so the rows under
  // this list change state throughout it: pending, then processing, then done
  // with a real title and a language. Refreshed while it runs and once more
  // when it settles, so the list ends the analysis describing what was actually
  // read rather than what was there before it started.
  useEffect(() => {
    if (!analysing) { loadHistory(); return undefined; }
    const t = setInterval(loadHistory, 5000);
    return () => clearInterval(t);
  }, [analysing, loadHistory]);

  async function handleSubmit(e) {
    e?.preventDefault();
    if (isShowcase) return openSignUp("voice");
    if (submitting) return;
    setError("");

    const value = url.trim();
    if (!value) return setError("Paste a YouTube link first.");

    setSubmitting(true);
    try {
      // The profile is named explicitly. Letting the server pick would mean a
      // video landing in whichever channel it considers default, and paying to
      // transcribe it into the wrong one.
      await api.post("/transcribe", { url: value, profile: activeId || undefined });
      setUrl("");
      loadHistory();
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
      setConfirmDelete(null);
      await loadHistory();
      await refreshVoice();
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete that video."));
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  /**
   * Start a build.
   *
   * One line, because the waiting is not this screen's job any more: the store
   * kicks it off, follows it over the socket, polls underneath that as a floor,
   * and holds the result whether or not this panel is still on screen.
   */
  function analyseVoice() {
    if (isShowcase) return openSignUp("voice");
    setError("");
    analyse(lane);
  }

  // A finished build changes the counts the profile list carries, and the other
  // screens read those. The store refreshes the profiles itself; this is the
  // shell's own hook, which is what keeps Create's panels in step.
  useEffect(() => {
    if (justBuilt) onVoiceChange?.();
  }, [justBuilt, onVoiceChange]);

  async function doDeleteVoice() {
    if (deletingVoice || !activeId) return;
    setDeletingVoice(true);
    setError("");
    try {
      await api.delete(`/profiles/${activeId}/voice`);
      setConfirmVoiceDelete(false);
      await loadHistory();
      await refreshVoice();
      await refreshProfiles();
      onVoiceChange?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete this voice."));
      setConfirmVoiceDelete(false);
    } finally {
      setDeletingVoice(false);
    }
  }

  const gut = isPhone ? 16 : 30;
  const isLong = lane === "long";

  // Every count on this screen is the SELECTED lane's count. The server sends
  // both, already separated, so nothing here has to know that lanes are decided
  // by video duration.
  const laneSlot = meta?.laneSlots?.[lane] || null;

  const full = laneSlot ? laneSlot.left <= 0 : false;
  const readyCount = laneSlot ? laneSlot.ready_count : (meta?.ready || 0);

  // The long lane needs three videos before it can build at all: one long video
  // shows one episode's running order, which is not yet a habit.
  const minVideos = isLong ? (laneSlot?.min_videos || 3) : 1;
  const shortReady = !!voice?.lanes?.short?.ready;
  const laneLocked = isLong && !shortReady;
  const canAnalyse = readyCount >= minVideos && !laneLocked;

  const built = isLong ? (voice?.profile?.long || null) : (voice?.profile || null);
  // Behind if the analysis never saw the current set: either the server says
  // so, or a video was added or deleted since it last ran.
  const stale = !!built && ((voice?.lane_stale?.[lane] ?? voice?.stale) || built.transcript_count !== readyCount);

  // Videos shown are the selected lane's videos. A creator on the long tab
  // looking at their five Shorts, with an Analyse button that would ignore all
  // of them, is the confusion this whole screen has to avoid.
  const laneHistory = history.filter((h) => (h.lane || "short") === lane);

  // ── WHEN ANALYSING IS WORTH OFFERING ──────────────────────────────────────
  // Re-reading the same set produces the same voice and costs a model call, so
  // the action is only live when the answer could actually differ: nothing has
  // been built yet, or the set has moved since it was. Everything else is a
  // button that looks like it does something and does not.
  const analyseBlocked = !canAnalyse || (!!built && !stale);

  // ── WHAT THE NEXT ANALYSIS COSTS ──────────────────────────────────────────
  // Priced by the server and served with the voice (GET /script/voice), so this
  // number and the number the charge uses come from the same call. It changes
  // when a video is added or deleted, which is exactly when the store re-reads
  // the voice, so it is live without a poll of its own.
  const price = voice?.analysis || null;
  const cost = price?.cost ?? 0;

  // Compared against the SHARED live balance rather than the copy that rode in
  // with the quote: topping up in the sidebar changes nothing this screen
  // watches, and the button must not stay dead over credits already paid for.
  // Same rule ScriptOrder follows.
  const have = typeof balance === "number" ? balance : voice?.balance;
  const tooExpensive = cost > 0 && typeof have === "number" && have < cost;

  // `waiting` comes first: a video added a moment ago is the likeliest reason
  // someone is prodding a button that will not move, and "add a video" is a
  // maddening thing to be told by a screen that is holding the one you added.
  const blockedReason = laneLocked
    ? "Build your short-form voice first. It teaches us your hook and sign-off, which the long-form one builds on."
    : waiting
    ? "Still reading the video you added. This turns on by itself once it is ready."
    : !canAnalyse
    ? isLong
      ? `Add ${Math.max(0, minVideos - readyCount)} more long video${minVideos - readyCount === 1 ? "" : "s"}, over ${durationWords(meta?.longMin || 180)} each. One long video shows us one episode's running order; ${minVideos} is where we can tell a habit from a one-off.`
      : built
        ? "The videos this voice was built from are gone. Add one below and this turns on."
        : "Add one of your videos below first. That is what your voice is learned from."
    : `This voice is already built from these ${readyCount} video${readyCount === 1 ? "" : "s"}. Add another below, or delete one, and this turns on.`;

  const summaryLine = laneLocked
    ? "Locked until your short-form voice is built."
    : !canAnalyse
    ? built
      // Built once, and every video it was built from has since been deleted.
      // The voice still works; there is nothing left to rebuild it from.
      ? `Learned from ${built.transcript_count} video${built.transcript_count === 1 ? "" : "s"} that are no longer here.`
      : waiting
      ? "Reading the video you added. You can analyse as soon as it is ready."
      : isLong
        ? `Add ${Math.max(0, minVideos - readyCount)} more long video${minVideos - readyCount === 1 ? "" : "s"}, then analyse.`
        : "Add a video below, then analyse."
    : stale
    ? `Your videos changed since this was built. Analyse again to use all ${readyCount} of them.`
    : built
    ? isLong
      // Proof, not a pat on the head. The number of transitions actually
      // captured is what tells a creator the extra three uploads bought
      // something real, and it is the one figure this lane exists to produce.
      ? `From ${built.transcript_count} long video${built.transcript_count === 1 ? "" : "s"}` +
        (built.transition_count ? ` · ${built.transition_count} of your own transitions captured` : " · no repeated transitions found yet")
      : `${voice?.profile?.language_label || "Learned"} · from ${built.transcript_count} video${built.transcript_count === 1 ? "" : "s"}`
    : `Ready to read ${readyCount} video${readyCount === 1 ? "" : "s"}. This runs once over the set, not once per video.`;

  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0, width: "100%" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: `${isPhone ? 18 : 28}px ${gut}px ${isPhone ? 40 : 60}px` }}>
        {/* No profile picker: these videos teach the account's one voice.
            See state/ProfileContext.js. */}
        <h1 style={{ fontSize: isPhone ? 21 : 25, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 5px" }}>
          My voice
        </h1>

        <p style={{ fontSize: isPhone ? 14 : 14.5, color: "var(--ink-body)", margin: "0 0 16px", lineHeight: 1.6 }}>
          {isLong
            // Both bounds, not just the lower one. A creator reading "over 3
            // minutes each" reasonably reaches for their best long video, and
            // finding out only on paste that a 20 minute one is refused is a
            // worse moment than being told the range up front.
            ? `Add up to ${laneSlot?.max || 5} of your longer videos, ${durationRange(meta?.longMin || 180, meta?.longMax || 600)} each. In these you cover several products in a row, and what we learn is the part a Short can never show us: how you move from one story to the next.`
            : `Add up to ${laneSlot?.max || 5} of your own short videos, under ${durationWords(meta?.shortMax || 180)} each. We read how you open, the words you keep in English and how you sign off, then write new scripts that sound like you.`}
        </p>

        {/* ── THE TWO VOICES ──────────────────────────────────────────────
            Presented as two things a creator BUILDS, not as a settings toggle,
            because that is what they are: two analyses over two sets of videos,
            each used for a different length of script.

            ── THE TABS NAME VIDEOS, NOT SCRIPTS ──
            They used to carry the script length each voice writes ("under 2 min
            scripts"), which is a true and useful fact in the wrong place. This
            is the screen where a creator pastes video URLs, so the number they
            need at the moment of choosing a tab is which videos go in it, and
            the old labels sat directly above an input that rejected videos on
            bounds they never mentioned. What each voice WRITES is still said,
            one line below, where it answers the next question instead of
            competing with this one. */}
        <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          {[
            { id: "short", label: "Short-form", sub: `Videos under ${durationShort(meta?.shortMax || 180)}` },
            { id: "long", label: "Long-form", sub: `Videos ${durationRangeShort(meta?.longMin || 180, meta?.longMax || 900)}` },
          ].map((t) => {
            const on = lane === t.id;
            const laneDone = !!voice?.lanes?.[t.id]?.ready;
            // ── LONG-FORM IS LOCKED IN A SHOWCASE ────────────────────────────
            // A showcase is built from five short videos and nothing else: the
            // long lane needs three long ones of its own, which only the
            // creator can add, and adding anything is exactly what they cannot
            // do here. Leaving the card live would open an empty lane whose one
            // instruction is "add three videos", under an Add button that opens
            // a sign-up dialog. The lock reuses the affordance this card
            // already has for the same situation.
            const locked = t.id === "long" && (!shortReady || isShowcase);
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "long" && isShowcase) return openSignUp("voice");
                  setLane(t.id);
                }}
                aria-pressed={on}
                aria-disabled={locked || undefined}
                style={{
                  flex: isPhone ? "1 1 46%" : "0 0 auto",
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: 11,
                  border: `1px solid ${on ? "var(--primary)" : "var(--line)"}`,
                  background: on ? "var(--primary-tint, rgba(0,0,0,0.03))" : "var(--card)",
                  cursor: "pointer",
                  opacity: locked ? 0.6 : 1,
                  minWidth: isPhone ? 0 : 190,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: on ? "var(--primary)" : "var(--ink)" }}>
                    {t.label}
                  </span>
                  {laneDone ? (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ok, #1F7A4D)" }}>BUILT</span>
                  ) : locked ? (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-mute)" }}>LOCKED</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: 2 }}>{t.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Said once, here, rather than as an error the first time they drag the
            duration slider past two minutes and find it refused. */}
        <p style={{ fontSize: isPhone ? 12.5 : 13, color: "var(--ink-mute)", margin: "0 0 18px", lineHeight: 1.6 }}>
          {isLong
            ? laneLocked
              ? "Build the short-form voice first. It teaches your hook and sign-off, which this one builds on."
              : `Under ${Math.round((meta?.splitSeconds || 120) / 60)} minutes you cover one product properly. Past it you cover seven or ten in a row, and that is a different way of talking. Scripts longer than ${Math.round((meta?.splitSeconds || 120) / 60)} minutes are written from this voice.`
            : `Scripts under ${Math.round((meta?.splitSeconds || 120) / 60)} minutes are written from this voice. For longer, multi-story scripts, build the long-form one too.`}
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
            </span>
            {/* Renaming lives on the Profile screen, which a showcase session
                has no access to: the rail does not offer it and the shell
                redirects it away. So this would have been a link to a bounce.
                It asks for the account instead, which is the thing actually
                standing between them and renaming it. */}
            <button
              onClick={isShowcase ? () => openSignUp("voice") : onGoProfiles}
              style={{
                marginLeft: "auto", border: "none", background: "none", padding: 0,
                fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", color: "var(--made)",
                cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3,
              }}
            >
              Rename
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

        {/* ── One card, because it is one job ───────────────────────────
            This was two numbered steps: the videos, then the voice. Splitting
            them made the page look like two features sharing a screen, when
            what a creator has here is a single thing with a single state. The
            voice IS the videos, read; separating them put the button in one
            box and the reason it is or is not available in another.

            So: the state and its one action on top, the way to change the set
            underneath it, and the detail folded away until asked for. */}
        <div
          style={{
            padding: isPhone ? 16 : 20, borderRadius: "var(--radius)",
            background: "var(--card)", border: "1px solid var(--line)",
          }}
        >
          {/* ── WHILE IT RUNS, THE CARD IS THE BUILD ──────────────────────
              Not a greyed button next to a stale summary. What was true before
              the press ("Not built yet", "from 3 videos") is not what a creator
              wants on screen during the two minutes they are waiting, and a
              disabled button is the least informative thing this screen could
              be showing at the one moment it has something to say. See
              VoiceAnalysing.js for why this is the one part of the app that
              moves. */}
          {analysing ? (
            <VoiceAnalysing progress={progress} isPhone={isPhone} videoCount={readyCount} />
          ) : (
          <div
            style={{
              display: "flex", alignItems: isPhone ? "stretch" : "flex-start",
              flexDirection: isPhone ? "column" : "row",
              justifyContent: "space-between", gap: 14,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>
                {built ? "Built" : "Not built yet"}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>
                {summaryLine}
              </div>
              {built && !stale && built.confidence === "thin" && (
                <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 6, lineHeight: 1.55 }}>
                  One video is a hint, not a voice. Three or more is where scripts start
                  genuinely sounding like you.
                </div>
              )}

              {/* ── WHY A REBUILD COSTS SOMETHING ──────────────────────────
                  Said next to the button rather than only on it. A creator who
                  has rebuilt twice for free meets a price the third time, and
                  meeting it as a bare number on a button they have pressed
                  before reads as a change of terms; naming what it pays for,
                  and how many free ones are left before it applies, is the
                  difference. See voiceAnalysisCost on the server. */}
              {!analyseBlocked && price && (
                <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 6, lineHeight: 1.55 }}>
                  {price.free
                    ? price.remaining_free === 1
                      ? "This one is free. After it, re-analysing costs " +
                        `${price.per_video} credits per video, because every video is read again.`
                      : "Free."
                    : `Every video is read again, so this costs ${price.per_video} credits ` +
                      `per video · ${readyCount} × ${price.per_video}.`}
                </div>
              )}
            </div>

            {/* ── WHY THIS IS NOT A `disabled` BUTTON ──────────────────────
                A disabled control cannot be hovered, focused or clicked in
                most browsers, so it cannot explain itself. That is exactly
                backwards here: the whole question a creator has is "why can't
                I press this", and the answer is one sentence long.

                So it LOOKS unavailable and refuses to run, but it still takes
                a pointer and a click, and both say why. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              <button
                onClick={() => { if (tooExpensive) return; analyseBlocked ? setHint(true) : analyseVoice(); }}
                onMouseEnter={() => analyseBlocked && setHint(true)}
                onMouseLeave={() => setHint(false)}
                onFocus={() => analyseBlocked && setHint(true)}
                onBlur={() => setHint(false)}
                aria-disabled={analyseBlocked || tooExpensive}
                aria-describedby={analyseBlocked ? "hg-analyse-hint" : undefined}
                className={analyseBlocked || tooExpensive ? undefined : "hg-btn-primary"}
                style={{
                  fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
                  border: "none", flexShrink: 0, whiteSpace: "nowrap",
                  background: analyseBlocked || tooExpensive ? "#E5E5E5" : "var(--primary)",
                  color: analyseBlocked || tooExpensive ? "var(--ink-mute)" : "#fff",
                  cursor: tooExpensive ? "default" : analyseBlocked ? "help" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {tooExpensive
                  ? "Not enough credits"
                  : `${built ? "Analyse again" : "Analyse my voice"}${cost > 0 ? ` · ${cost} credits` : ""}`}
              </button>

              {tooExpensive && canBuy && (
                <button
                  onClick={openBuy}
                  className="hg-btn-primary"
                  style={{
                    fontSize: 14, fontWeight: 650, padding: "12px 20px", borderRadius: 11,
                    border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer",
                  }}
                >
                  Buy credits
                </button>
              )}
            </div>
          </div>
          )}

          {analyseBlocked && hint && !analysing && (
            <p
              id="hg-analyse-hint"
              role="status"
              className="hg-rise"
              style={{
                fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-body)",
                margin: "12px 0 0", padding: "9px 12px", borderRadius: 9,
                background: "#FBF5E8", border: "1px solid #EEDCB6",
              }}
            >
              {blockedReason}
            </p>
          )}

          {/* ── Change the set ─────────────────────────────────────────── */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>
                Add a video
              </span>
              <span style={{ fontSize: 12.5, color: "var(--ink-mute)", whiteSpace: "nowrap" }}>
                {laneSlot
                  ? `${laneSlot.used} of ${laneSlot.max} ${isLong ? "long" : "short"} added`
                  : <Skeleton variant="text" width={74} height={10} />}
              </span>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: isPhone ? "column" : "row", gap: 9 }}>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/shorts/…"
                aria-label="YouTube video URL"
                disabled={submitting || full}
                style={{
                  flex: 1, minWidth: 0, fontSize: 14.5, padding: "12px 14px",
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
                  fontSize: 14.5, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
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
                All {laneSlot?.max || 5} {isLong ? "long-form" : "short-form"} slots used. Delete one below to add another.
              </p>
            )}

            {meta?.mixed && (
              <div
                style={{
                  marginTop: 11, padding: "11px 13px", borderRadius: 10,
                  // Amber, not red. Nothing has failed here; they are being told
                  // the result will be worse than it could be.
                  background: "#FBF5E8", border: "1px solid #EEDCB6",
                  fontSize: 13, lineHeight: 1.6, color: "var(--ink-body)",
                }}
              >
                <strong style={{ color: "var(--ink)" }}>These videos are in different languages</strong>{" "}
                ({meta.mixed.join(", ")}). A voice profile is one person, so mixing languages
                blends them into a voice that is nobody's. Keep one creator's videos here.
              </div>
            )}

            {/* The set, immediately under the box that changes it. Never
                folded away: what is in here is the whole reason the analyse
                button above is or is not available, and hiding the cause of a
                disabled control behind a disclosure is how the first version
                of this screen confused people. */}
            <div style={{ marginTop: 14 }}>
              <Videos
                items={laneHistory}
                isLong={isLong}
                loading={!meta?.laneSlots}
                isPhone={isPhone}
                onDelete={isShowcase ? () => openSignUp("voice") : setConfirmDelete}
              />
            </div>
          </div>

          {/* ── WHY WHAT WE LEARNED IS NOT ON THIS PAGE ──────────────────
              There used to be a panel here listing the openings, closings,
              signature phrases, stance, pacing and audience the analysis found.
              It read well and it was a mistake. Assembled, those lines ARE a
              working style prompt for this creator: the one asset here that
              cost a paid model call over their own videos, printed on screen
              ready to be copied into a free chat assistant. A product whose
              value is "it sounds like you" cannot hand over the description of
              how they sound.

              The server no longer sends it either (see shapeProfile in
              backend/routes/script.js), because hiding a field the API still
              returns is not hiding it. What stays is the part a creator
              genuinely needs: whether it is built, from how many videos, and
              in which language. */}
          {/* Quiet, and last. Destroying work should be findable without being
              the thing your eye lands on. */}
          {built && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <button
                onClick={() => (isShowcase ? openSignUp("voice") : setConfirmVoiceDelete(true))}
                style={{
                  border: "none", background: "none", padding: 0,
                  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", color: "var(--ink-mute)",
                  cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                Delete this voice
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── The one moment worth interrupting for ───────────────────────────
          A creator has just waited a couple of minutes for something they
          cannot see happening. Ending that silently, with a card that quietly
          changes from "Not built yet" to "Built", wastes the only moment they
          are certain something worked. It also answers the question they have
          next, which is not "what did you learn" but "so what do I do now". */}
      {justBuilt && (
        <SuccessDialog
          info={{ ...justBuilt, name: activeProfile?.name || "" }}
          onGoTopics={onGoTopics}
          onClose={clearJustBuilt}
        />
      )}

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
            This also removes the {history.length === 1 ? "video" : `${history.length} videos`} it was
            learned from. A voice is nothing but its videos read, so starting again means
            starting from an empty list.
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: 0 }}>
            Scripts you have already written keep the voice they were written in, and are
            not affected. You will need to add videos again before this channel can write
            anything new.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * The set, whatever state it is in.
 *
 * One component rather than three call sites deciding between a skeleton, an
 * empty line and a list, because it appears in two places now: on its own
 * before there is a voice, and folded into what we learned once there is.
 */
function Videos({ items, loading, isPhone, onDelete, isLong = false }) {
  // Held back until the real list arrives. "Nothing added yet" shown for half a
  // second to someone who has four videos is a claim, and a wrong one.
  if (loading) return <VideoSkeleton />;

  if (!items.length) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.6, margin: 0 }}>
        {isLong
          ? "Nothing added yet. Paste a link to one of your own longer videos above."
          : "Nothing added yet. Paste a link to one of your own short videos above."}
      </p>
    );
  }

  return <VideoList items={items} isPhone={isPhone} onDelete={onDelete} />;
}

/* ── The videos ────────────────────────────────────────────────────────── */

function VideoList({ items, isPhone, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            display: "flex", alignItems: "center", gap: 11, padding: 9,
            background: "var(--card)", border: "1px solid var(--line)", borderRadius: 11,
          }}
        >
          <Thumb src={it.thumbnail} isPhone={isPhone} />

          <div style={{ flex: 1, minWidth: 0 }}>
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
              {it.status === "failed" && it.error && (
                <span style={{ color: "var(--bad)" }}>· {it.error}</span>
              )}
            </span>
          </div>

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
      ))}
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
/**
 * A duration in prose, for sentences rather than for a badge.
 *
 * formatDuration below gives "2:30", which is right on a row and wrong inside
 * "under 2:30 each". This also exists because the obvious shorthand is a bug:
 * Math.round(seconds / 60) rounds a 150 second ceiling UP to "under 3 minutes",
 * which is not a rounding nicety, it is the product telling a creator they may
 * upload something it will refuse.
 *
 * The ceiling has since moved to a round three minutes and the trap is dormant,
 * not gone: these bounds are environment variables and the next person to set
 * one to a non-round number would reintroduce it silently.
 */
function durationWords(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (!rem) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  if (rem === 30) return `${m}½ minutes`;
  return `${m} min ${rem} sec`;
}

/**
 * The compact form, for a tab label rather than a sentence: "3 min", "2½ min".
 *
 * Shares durationWords' arithmetic rather than reaching for Math.round, which
 * is the same trap: rounding a 150 second bound to "3 min" advertises a length
 * the server refuses. Abbreviating afterwards keeps one implementation of the
 * part that can be wrong.
 */
function durationShort(seconds) {
  return durationWords(seconds).replace(/\s*\bminutes?\b/, " min").replace(/\s*\bseconds\b/, "s").trim();
}

/** The compact range: "3–15 min", dropping the repeated unit. */
function durationRangeShort(from, to) {
  const a = durationShort(from);
  const b = durationShort(to);
  const unit = (w) => w.replace(/^[\d½\s]+/, "");
  return unit(a) === unit(b) ? `${a.replace(unit(a), "").trim()}–${b}` : `${a}–${b}`;
}

/**
 * A range in prose: "3 to 10 minutes", not "3 minutes to 10 minutes".
 *
 * Drops the unit from the lower bound only when both sides carry the same one,
 * so a range that mixes units ("90 seconds to 10 minutes") still reads
 * correctly rather than losing the half it needs.
 */
function durationRange(from, to) {
  const a = durationWords(from);
  const b = durationWords(to);
  const unit = (w) => w.replace(/^[\d½\s]+/, "");
  return unit(a) === unit(b) ? `${a.replace(unit(a), "").trim()} to ${b}` : `${a} to ${b}`;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function StatusTag({ status }) {
  const map = {
    // Added but not read. Neutral on purpose: nothing has happened to it yet,
    // and a green tick here would imply work that has not been done.
    pending:    { label: "Added",   color: "var(--ink-mute)", bg: "#F2F2F2",      border: "var(--line)" },
    processing: { label: "Reading", color: "var(--made)", bg: "var(--made-tint)", border: "var(--made-line)" },
    done:       { label: "Read",    color: "var(--ok)",   bg: "#E6F4EA",          border: "#B7E1C4" },
    failed:     { label: "Failed",  color: "var(--bad)",  bg: "#FCE8E6",          border: "#F5C7C3" },
  };
  const s = map[status] || map.pending;
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

function SuccessDialog({ info, onGoTopics, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const n = info.videos || 0;

  return (
    <>
      <div
        onClick={onClose}
        className="hg-fade"
        style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,.4)", zIndex: 70 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Voice ready"
        className="hg-dialog-in"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 71, width: "min(440px, calc(100vw - 32px))",
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", padding: 24,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.5)",
          textAlign: "center",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "grid", placeItems: "center", width: 48, height: 48, margin: "0 auto 14px",
            borderRadius: "50%", background: "#E6F4EA", border: "1px solid #B7E1C4", color: "var(--ok)",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>

        <div style={{ fontSize: 19, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 8 }}>
          {info.name ? `${info.name} sounds like you now` : "Your voice is ready"}
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 4px" }}>
          We read {n} video{n === 1 ? "" : "s"}
          {info.language ? ` in ${info.language}` : ""} and learned how you open, the
          words you keep in English, and how you sign off.
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-mute)", margin: "0 0 20px" }}>
          Every script from here on is written that way. Pick a story and try it.
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onClose}
            className="hg-btn-ghost"
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "11px 16px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer",
            }}
          >
            Stay here
          </button>
          <button
            onClick={() => { onClose?.(); onGoTopics?.(); }}
            className="hg-btn-primary"
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "11px 20px", borderRadius: 10,
              border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer",
            }}
          >
            Find today's topic
          </button>
        </div>
      </div>
    </>
  );
}
