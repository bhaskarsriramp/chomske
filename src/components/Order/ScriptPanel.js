import { useState, useEffect, useRef, useCallback } from "react";
import api, { errorMessage } from "../../api";
import ScriptOrder from "./ScriptOrder";
import { useCredits } from "../../state/CreditsContext";
import { useProfiles } from "../../state/ProfileContext";
import { useVoice } from "../../state/VoiceContext";
import VoiceAnalysing from "../Transcribe/VoiceAnalysing";
import ScriptToggle, { EnglishNote } from "./ScriptToggle";
import UploadPackage from "./UploadPackage";
import ShootPack from "./ShootPack";
import { timeAgo } from "../News/newsUtils";

/**
 * Turn whatever is selected into a script in the creator's own voice.
 *
 * ── ONE PANEL, THREE SCREENS ─────────────────────────────────────────────────
 * It takes EITHER a `storyId` (a ranked story from Discover) or a `sourceId`
 * (material prepared by Import or Idea) and does exactly the same thing with
 * both: order, poll, show the result, offer the copy buttons, handle the
 * refund-shaped failures.
 *
 * Deliberately not two components. Everything below the order button is the
 * payoff screen of the entire product, the script card, the English twin, the
 * upload package, the title ideas, the "check any number before you say it"
 * line, and a second copy of it would start out identical and drift within a
 * month. The backend takes the same view for the same reason: POST /script
 * accepts either id and shares one path after twenty lines.
 *
 * Async and polled, matching /transcribe: writing takes long enough that holding
 * the request open loses to proxy timeouts, and the first script for a new user
 * also pays for building their voice profile.
 *
 * The panel is deliberately honest about how much voice it actually has. A profile
 * learned from one video is a hint, not a voice, and saying so is what stops a
 * thin first result from reading as "this product doesn't work".
 */
export default function ScriptPanel({
  storyId = null,
  // ── A BULLETIN IS ORDERED AS A LIST, IN ORDER ───────────────────────────
  // The creator's running order, which is an editorial decision and travels
  // untouched to the writer. Empty or single means the ordinary one-story path,
  // so every existing caller keeps working without knowing bulletins exist.
  storyIds = null,
  sourceId = null,
  voice,
  onVoiceChange,
  onGoTranscribe,
  onGoVoice,
  compact,
  cta,
  heading = "Your script",
  // What we are doing while they wait. Different per screen because it is
  // genuinely different work: Discover re-reads the coverage, Import may be
  // watching a ten minute video, Idea is usually straight to drafting. A
  // progress line that names the wrong job is worse than none.
  writingNote = "Reading the coverage, then drafting. Around half a minute.",
}) {
  const [script, setScript] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // ── WHAT IS ALREADY ON FILE FOR THIS SUBJECT ────────────────────────────
  // Starts true, before any lookup has been made, and that default is the
  // whole point. The order button carries a price, and rendering it for the
  // half second between opening a story and hearing back is how somebody pays
  // thirty credits for a script they already own. "I don't know yet" and
  // "there is nothing here" have to look different on screen, so they are
  // different states.
  const [lookingUp, setLookingUp] = useState(true);

  // They have seen the script on file and want a different one anyway, at a
  // different length or simply another go. A flag rather than clearing
  // `script`, so backing out of that order returns them to the finished work
  // instead of to an empty panel.
  const [reorder, setReorder] = useState(false);

  // The shoot pack overlay. Not a route: it belongs to one script, and giving
  // it a URL would mean a link that resolves to nothing the moment the panel
  // behind it is showing a different story.
  const [shoot, setShoot] = useState(false);

  // The balance lives in one place for the whole app (see CreditsContext). It
  // is shown in the sidebar and the mobile header at the same time as here, and
  // three components each holding their own copy is three numbers that drift.
  const { setBalance, refresh: refreshCredits } = useCredits();
  const { activeId: profileId } = useProfiles();

  // ── WHY THIS PANEL WATCHES A BUILD IT DID NOT START ───────────────────────
  // The creator presses Analyse on My voice and comes straight here to pick a
  // story, which is the natural thing to do with two minutes to spend. Without
  // this they would find "Add a video first" over videos they have already
  // added and a voice that is being built as they read it, and then find it
  // still saying that after the build landed. The `voice` prop already carries
  // `building`; the progress detail comes from the same store that prop is fed
  // from (state/VoiceContext.js).
  const { progress: voiceProgress } = useVoice();

  const pollRef = useRef(null);

  // A script belongs to one subject. Switching stories, or preparing new
  // material, must clear the last result and stop its poll, or the previous
  // script sits under the new headline. Keyed on both ids because on Discover
  // the subject is the story and on Import and Idea it is the source, and a
  // panel that only watched one of them would leave the other's script on
  // screen under something it was not written from.
  //
  // The picked list is part of the key, not only its first story. Unticking the
  // second of three stories leaves the leader unchanged, so a key built from
  // `storyId` alone would hold a three-story bulletin on screen underneath a
  // two-story order.
  const subjectKey = `${storyId || ""}|${(storyIds || []).join(",")}|${sourceId || ""}`;
  useEffect(() => {
    clearInterval(pollRef.current);
    setScript(null);
    setError("");
    setCopied(false);
    setBusy(false);
    setReorder(false);
    setLookingUp(true);
  }, [subjectKey]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const startPolling = useCallback((id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/script/${id}`);
        setScript(data.script);
        // ── WHY `done` IS NOT WHERE THIS STOPS ────────────────────────────
        // The script is marked done as soon as the script is written, and the
        // English twin and the packaging are produced after that. Stopping on
        // `done` captured the row in the gap between the two and never looked
        // again, so a creator who ticked "Also write it in English" was shown
        // no English at all, on a screen that had already charged them for it.
        // `extras_pending` is the server saying there is more coming; it is
        // cleared whether the extras succeed, fail or are refunded.
        if (data.script.status !== "processing" && !data.script.extras_pending) {
          clearInterval(pollRef.current);
          setBusy(false);
          // The first run builds the voice profile as a side effect, refresh the
          // header so it stops saying "no voice yet".
          onVoiceChange?.();
          // A failed script is refunded (routes/script.js), and so is an add-on
          // that could not be produced. Either way the balance we charged on
          // the way in is no longer the right one.
          refreshCredits();
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setBusy(false);
        setError(errorMessage(err, "Lost track of that script. Try again."));
      }
    }, 2500);
  }, [onVoiceChange, refreshCredits]);

  /**
   * ── ASK BEFORE OFFERING TO SELL ─────────────────────────────────────────
   * POST /script has always refused to bill twice for the same story: it finds
   * the previous script and returns it as `cached`. What it could not do is
   * stop the panel OFFERING to write one, because the panel never asked. So
   * clicking away from a story and back showed "Write this in my voice · 30
   * credits" over finished work, and My scripts was the only place that work
   * still appeared to exist. A cache nobody can see is indistinguishable from
   * a cache that does not work.
   *
   * Runs on every subject change, including back to one visited a minute ago,
   * because the answer changes: the script may have been written since, on this
   * screen or another tab.
   */
  useEffect(() => {
    if (!storyId && !sourceId) { setLookingUp(false); return; }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/script/existing", {
          params: {
            news_id: storyId || undefined,
            news_ids: storyIds && storyIds.length > 1 ? storyIds.join(",") : undefined,
            source_id: sourceId || undefined,
            profile_id: profileId || undefined,
          },
        });
        // Arrowing down the feed opens a lookup per story; only the one they
        // are still looking at may write to this panel.
        if (cancelled) return;
        if (data.script) {
          setScript(data.script);
          // Still being written, most likely because they navigated away
          // mid-generation and came back. Pick the poll up rather than leaving
          // a spinner that resolves for nobody.
          if (data.script.status === "processing" || data.script.extras_pending) {
            setBusy(true);
            startPolling(data.script.id);
          }
        }
      } catch {
        /* "nothing on file" is the safe answer: it lands on exactly the panel
           that existed before this lookup did, and blocking the screen on an
           optimisation would be the worse trade. */
      } finally {
        if (!cancelled) setLookingUp(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey, profileId, startPolling]);

  /**
   * @param {object} order  { seconds, packaging }: what they chose in
   *   ScriptOrder. Absent on a regenerate, which repeats the original order.
   *
   * `english` is deliberately never sent any more. The server still knows how
   * to write the twin, and legacy scripts that have one still render it, but
   * nothing here asks for a new one. See the note in ScriptOrder.
   */
  async function generate(force = false, order = null) {
    if (busy) return;
    setError("");
    setCopied(false);
    setReorder(false);
    setBusy(true);
    try {
      // The voice is sent explicitly rather than left to the server's default.
      // The creator picked it in the order panel a second ago, and having the
      // server guess at that point is how a story gets written in the wrong
      // voice and charged for.
      const body = {
        ...(sourceId
          ? { source_id: sourceId }
          : storyIds && storyIds.length > 1
            ? { news_ids: storyIds }
            : { news_id: storyId }),
        force,
        profile_id: profileId || undefined,
      };
      if (order) {
        body.seconds = order.seconds;
        body.packaging = order.packaging;
      } else if (script?.duration_seconds) {
        // A regenerate repeats what was bought the first time, including the
        // add-on: it is a redo, not a downgrade, and it is charged again.
        // Except the twin, which is no longer on the menu, so a regenerate of
        // an old script that had one comes back without it rather than
        // silently billing for something the creator can no longer choose.
        body.seconds = script.duration_seconds;
        body.packaging = !!script.description;
      }

      const { data } = await api.post("/script", body);
      setScript(data.script);
      if (typeof data.balance === "number") setBalance(data.balance);
      if (data.script.status === "processing" || data.script.extras_pending) startPolling(data.script.id);
      else { setBusy(false); onVoiceChange?.(); refreshCredits(); }
    } catch (err) {
      setBusy(false);
      if (err?.response?.data?.needs_transcript) {
        setError("");
        setScript({ status: "needs_voice" });
        return;
      }
      // Not an error worth a red box: they simply need to top up, and
      // ScriptOrder already shows the balance and the buy button. Surfacing it
      // twice reads as something having gone wrong.
      if (err?.response?.data?.insufficient_credits) {
        setBalance(err.response.data.balance);
        return;
      }
      // Sources are a cache and they expire (backend models/Source.js). On a
      // tab left open for a month this is the expected outcome, not a fault,
      // and the fix is one the creator can do in five seconds.
      if (err?.response?.data?.source_expired) {
        setError("That material has expired. Paste it again and we'll re-read it.");
        return;
      }
      setError(errorMessage(err));
    }
  }

  /**
   * @param {string} [text]  the version currently on screen. Defaults to the
   *   script itself, so a caller with nothing to choose between still works.
   */
  function copyScript(text) {
    const body = text || script?.text;
    if (!body) return;
    navigator.clipboard.writeText(body).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => setError("Couldn't copy. Select the text and copy it manually.")
    );
  }

  const hasVoice = !!voice?.profile;
  const buildingVoice = !!voice?.building;

  return (
    <section style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--line)" }}>
      {/* Just the heading. The balance moved to the sidebar card, where it is on
          screen permanently instead of only while this section is; and the
          language chip went with it, the order panel below already says which
          voice is writing, and the finished script's own header repeats the
          language. Three copies of one fact is noise, not reassurance. */}
      <h3
        style={{
          fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
          textTransform: "uppercase", color: "var(--ink-mute)", margin: "0 0 13px",
        }}
      >
        {heading}
      </h3>

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 12,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 13.5, lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      )}

      {/* Being built right now, on this screen or another one. Takes priority
          over both branches below: "add a video first" is false while their
          videos are being read, and offering the order panel mid-build would
          send a paid generation into a profile that is halfway through being
          replaced. */}
      {buildingVoice && !script && (
        <VoiceAnalysing progress={voiceProgress} isPhone={compact} compact />
      )}

      {/* No transcripts yet, the voice has nothing to be learned from. */}
      {!buildingVoice && (script?.status === "needs_voice" || (!hasVoice && voice && voice.transcripts_available === 0)) && (
        <NeedsVoice onGoTranscribe={onGoTranscribe} />
      )}

      {/* Still asking whether this story already has a script. Shown instead of
          the order panel rather than alongside it: the button underneath says
          "30 credits", and a button with a price on it must never appear on a
          screen that is about to discover the work is already done. */}
      {!buildingVoice && lookingUp && !script && <LookingUp />}

      {/* `reorder` is the second door into this: they have read what is on file
          and want another one anyway. */}
      {!buildingVoice && !lookingUp && (!script || reorder) &&
        (hasVoice || voice?.transcripts_available > 0) && (
        <div>
          {reorder && (
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, flexWrap: "wrap", marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.55 }}>
                You've written this one already. This orders a second version.
              </span>
              <button
                type="button"
                onClick={() => setReorder(false)}
                className="hg-btn-ghost"
                style={{
                  fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 9,
                  border: "1px solid var(--line)", background: "var(--card)",
                  color: "var(--ink-body)", cursor: "pointer", flexShrink: 0,
                }}
              >
                Back to it
              </button>
            </div>
          )}
          <ScriptOrder
            busy={busy}
            // The force flag IS the re-order flag. Without it the server finds
            // the script already on file and hands the same one back, so the
            // creator presses a button that promises a new version and watches
            // nothing change. With it, on the first order, every double-click
            // would be a second charge, which is what the cache is there to
            // prevent. Both are correct in exactly one of the two states.
            onGenerate={(order) => generate(reorder, order)}
            compact={compact}
            sourceId={sourceId}
            cta={reorder ? "Write another version" : cta}
            onGoVoice={onGoVoice || onGoTranscribe}
          />
          {!hasVoice && (
            <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
              First run also learns your voice from your {voice.transcripts_available === 1 ? "video" : "videos"}, so it takes a little longer.
            </p>
          )}
        </div>
      )}

      {script?.status === "processing" && <Writing note={writingNote} />}

      {script?.status === "failed" && (
        <div
          style={{
            padding: 16, borderRadius: 12,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
          }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--bad)", marginBottom: 5 }}>
            Couldn't write this one
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>
            {script.error || "Something went wrong."}
          </div>
          <button
            onClick={() => generate(true)}
            className="hg-btn-ghost"
            style={{
              marginTop: 12, fontSize: 13, fontWeight: 600, padding: "8px 14px",
              borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}

      {script?.status === "done" && !reorder && (
        <Result
          script={script}
          compact={compact}
          copied={copied}
          onCopy={copyScript}
          busy={busy}
          onWriteAnother={() => setReorder(true)}
          onOpenShoot={() => setShoot(true)}
        />
      )}

      {/* Full-screen over the app rather than a panel below it. A shoot pack is
          read while setting up a camera, not while browsing, and the shot list
          has to be the only thing on the screen for that to work. */}
      {shoot && script?.status === "done" && (
        <ShootPack
          script={script}
          onClose={() => setShoot(false)}
          onUpdated={(next) => setScript((s) => ({ ...s, ...next }))}
        />
      )}
    </section>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

/** "8 min", "90s": the duration they ordered, shown as they chose it. */
function fmtDuration(seconds) {
  const s = Number(seconds) || 0;
  return s >= 120 ? `${Math.round(s / 60)} min` : `${s}s`;
}

function NeedsVoice({ onGoTranscribe }) {
  return (
    <div
      style={{
        padding: "20px 18px", borderRadius: 12,
        // Was #F9F9F9 on a white pane, which is a two-percent difference: the
        // card had no edges and read as a paragraph nobody had styled. This is
        // the one blocking step between a new account and the whole product, so
        // it should look like a thing to act on, not like body copy.
        background: "#EFEDE9", border: "1px solid #DDD9D2",
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
        Add a video first
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 14px" }}>
        Your voice is learned from your own videos, how you open, the words you keep in
        English, how you sign off. Add one under My voice and this can write in it.
      </p>
      <button
        onClick={onGoTranscribe}
        className="hg-btn-primary"
        style={{
          fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
          border: "none", background: "var(--primary)", color: "#fff",
          cursor: "pointer",
        }}
      >
        Go to My voice
      </button>
    </div>
  );
}

/**
 * The half second before we know whether this story already has a script.
 *
 * Shaped like the order panel it replaces so the pane does not jump when the
 * answer lands, and silent: it is too short-lived to deserve a sentence, and
 * "checking…" on every story a creator arrows past would read as a slow app.
 */
function LookingUp() {
  return (
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="hg-skel" style={{ height: 13, borderRadius: 5, width: "34%" }} />
      <div className="hg-skel" style={{ height: 40, borderRadius: 10 }} />
      <div className="hg-skel" style={{ height: 44, borderRadius: 10, width: "52%" }} />
    </div>
  );
}

function Writing({ note }) {
  return (
    <div
      style={{
        padding: 20, borderRadius: 12, background: "var(--card)",
        border: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 13,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 17, height: 17, borderRadius: "50%",
          border: "2px solid var(--line)", borderTopColor: "var(--made)",
          animation: "hg-spin .8s linear infinite", flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Writing in your voice…</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 3 }}>
          {note}
        </div>
      </div>
    </div>
  );
}

function Result({ script, compact, copied, onCopy, onWriteAnother, onOpenShoot }) {
  const [view, setView] = useState("native");

  // A script can arrive without its twin and gain it a moment later (the extras
  // are written after the script is marked done, see backend routes/script.js),
  // so this is read on every render rather than captured once.
  const hasEnglish = !!script.english_text;
  const showing = view === "english" && hasEnglish ? script.english_text : script.text;

  return (
    <div className="hg-rise">
      <div
        style={{
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, flexWrap: "wrap", padding: "11px 15px",
            // The one card in the app that is the finished thing. A faint wash
            // of the "you made this" hue marks it as the payoff without turning
            // the script itself into a coloured box.
            borderBottom: "1px solid var(--made-line)", background: "var(--made-tint)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
            {script.language_label || "Your voice"}
            {script.duration_seconds ? ` · ${fmtDuration(script.duration_seconds)}` : ""}
            {script.voice_confidence === "thin" && " · learned from one video"}
          </span>
          {/* Copy only. Rewrite used to sit here and it was a button that charged
              full price for a second attempt at something the creator had
              already paid for, one click away from the thing they actually
              wanted. Ordering another script is still possible from the panel
              above, where the price is on the button. */}
          {/* ── THE ACTION ROW ──────────────────────────────────────────────
              Wraps rather than scrolls, and the two buttons keep the same
              order at every width, so the one a creator reaches for does not
              move between their phone and their desk.

              B-roll sits to the LEFT of Copy deliberately. Copy is what you
              press when you are finished with this screen; B-roll is what you
              press when you are not, and the thing that continues the job
              should come before the thing that ends it. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {hasEnglish && (
              <ScriptToggle value={view} onChange={setView} nativeLabel={script.language_label} />
            )}
            <button
              onClick={onOpenShoot}
              className="hg-btn-ghost"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 9,
                border: `1px solid ${script.shoot_pack ? "var(--made-line)" : "var(--line)"}`,
                background: script.shoot_pack ? "var(--made-tint)" : "var(--card)",
                color: "var(--ink-body)", cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7h13v10H3zM16 10l5-3v10l-5-3" />
              </svg>
              B-roll
            </button>
            <button
              onClick={() => onCopy(showing)}
              className="hg-btn-ghost"
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 9,
                border: "1px solid var(--line)", background: "var(--card)",
                color: copied ? "var(--ok)" : "var(--ink-body)", cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "Copied" : "Copy script"}
            </button>
          </div>
        </div>

        {script.english_error && <EnglishNote message={script.english_error} />}

        {/* `indic` only on the script in their own language: it selects the
            Noto Indic stack, and applying it to the English twin would render
            Latin text in a fallback face for no reason. Keyed on the view so
            the switch is a real swap rather than a mutation of one node, which
            is what lets the fade read as a change of content. */}
        <div
          key={view}
          className={view === "english" ? "hg-fade" : "indic hg-fade"}
          style={{
            padding: compact ? 17 : 22,
            fontSize: compact ? 15.5 : 16.5,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: view === "english" ? 1.75 : undefined,
          }}
        >
          {showing}
        </div>
      </div>

      <UploadPackage script={script} compact={compact} />

      {/* Facts came from these. A creator about to say this out loud should be
          able to check it in one click. */}
      {script.sources_used?.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: "12px 0 0", lineHeight: 1.6 }}>
          Written from {script.sources_used.length} source
          {script.sources_used.length === 1 ? "" : "s"} listed below.
        </p>
      )}

      {/* ── ORDERING ANOTHER ONE IS DELIBERATELY DOWN HERE ─────────────────
          Not in the card header next to Copy. A button that charges full price
          for a second attempt does not belong one slip of the thumb away from
          the one thing everybody came to press, which is why Rewrite was taken
          out of that header in the first place. This is the same decision: it
          says when the script was written, which is the fact somebody
          returning to a story actually needs, and offers the re-order as a
          sentence rather than a control. */}
      {onWriteAnother && (
        <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: "8px 0 0", lineHeight: 1.6 }}>
          Written {timeAgo(script.created_at)}
          {script.duration_seconds ? `, ${fmtDuration(script.duration_seconds)}` : ""}.{" "}
          <button
            type="button"
            onClick={onWriteAnother}
            style={{
              padding: 0, border: "none", background: "none", font: "inherit",
              color: "var(--ink-body)", fontWeight: 600, textDecoration: "underline",
              textUnderlineOffset: 2, cursor: "pointer",
            }}
          >
            Write another version
          </button>
        </p>
      )}
    </div>
  );
}
