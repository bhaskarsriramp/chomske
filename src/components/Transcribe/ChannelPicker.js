import { useState, useCallback, useEffect } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";

/**
 * ChannelPicker: find a YouTube channel, then tick videos off its recent list.
 *
 * ── WHAT IT REPLACED, IN BOTH PLACES ─────────────────────────────────────────
 * Finding video URLs by hand. A creator building their own voice had to open
 * YouTube in another tab and copy five addresses; an admin building an outreach
 * showcase had to do the same for somebody else's channel. Five context
 * switches before anything happens, twice over, in two different screens.
 *
 * ── WHY ONE COMPONENT AND NOT TWO ────────────────────────────────────────────
 * The two screens ask a different question and do a different thing with the
 * answer, but the middle is identical: resolve a channel, confirm it is the
 * right one, show its recent short videos, let somebody choose up to N. That
 * middle is where all the fiddly parts live, the selection cap, the
 * already-taken rows, the per-video failures, the empty-channel case, and
 * writing it twice means fixing every one of those twice and missing one.
 *
 * So this owns the middle and knows nothing about what it is for. The caller
 * supplies the endpoint base, the words, and what to DO with a confirmed
 * selection. See ChannelImport.js (adds to a voice profile) and
 * Admin/AdminPanel.js (fills in the showcase form).
 *
 * @param {string}   base          "/channel" or "/admin/channel"
 * @param {object}   params        extra query params for the videos call
 * @param {number}   maxSeconds    the short lane ceiling, for the copy only
 * @param {object}   copy          the words this instance uses
 * @param {Function} onConfirm     async (channel, videos) => {ok, failed} | void
 *   Returning nothing means every video was accepted. Returning a `failed` map
 *   of video_id to message pins each failure to the row that caused it, which
 *   is the whole reason this is not a single banner: four videos landing and
 *   one being refused is a normal outcome, and "one failed" without saying
 *   which is useless to somebody holding five thumbnails.
 * @param {boolean}  showSubmit    whether this owns the button that acts on the
 *   selection. False when the CALLER owns that action: My voice drives Analyse
 *   my voice straight from the selection, so a second confirm button inside
 *   here would be a step that does nothing a creator can see.
 * @param {Function} onSelectionChange  (videos) => void, on every change. How a
 *   caller with showSubmit false knows what is ticked.
 */
export default function ChannelPicker({
  base = "/channel",
  params = {},
  maxSeconds = 180,
  copy = {},
  onConfirm,
  showSubmit = true,
  onSelectionChange,
  isPhone,
}) {
  /**
   * How many cards to a row.
   *
   * Fixed steps rather than `auto-fill` with a minmax. Auto-fill would pick the
   * column count from the card's minimum width, which on a wide screen lands on
   * five or six and makes each thumbnail too small to recognise a video by, and
   * recognition is the entire job of this grid.
   */
  const xs = useIsMobile(640);
  const sm = useIsMobile(1000);
  const md = useIsMobile(1400);
  const cols = xs ? 1 : sm ? 2 : md ? 3 : 4;
  const words = {
    title: "Add from a channel",
    findBlurb: "An @handle, a channel link, or a channel name.",
    confirmBlurb: "Check this is the right channel.",
    pickBlurb: (n) => `Pick up to ${n === 1 ? "1 video" : `${n} videos`}.`,
    confirmPrimary: "Use this channel",
    reject: "Not this one",
    submit: (n) => `Add ${n} ${n === 1 ? "video" : "videos"}`,
    submitting: (n) => `Adding ${n}…`,
    taken: "Already added",
    placeholder: "@channelhandle",
    ...copy,
  };

  const [step, setStep] = useState("find");   // find | confirm | pick
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const [channel, setChannel] = useState(null);
  const [candidates, setCandidates] = useState([]);

  const [videos, setVideos] = useState([]);
  const [slots, setSlots] = useState(null);
  const [scanned, setScanned] = useState(0);
  const [picked, setPicked] = useState({});
  const [failed, setFailed] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [partial, setPartial] = useState(0);

  const pickedIds = Object.keys(picked).filter((k) => picked[k]);
  const left = slots?.left ?? 5;

  // The caller's copy of the selection. Reported as whole video objects rather
  // than ids so a parent driving its own action does not need the list too.
  useEffect(() => {
    if (!onSelectionChange) return;
    onSelectionChange(pickedIds.map((id) => videos.find((v) => v.video_id === id)).filter(Boolean));
    // pickedIds is rebuilt every render, so the join is the stable signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedIds.join(","), videos]);

  function reset() {
    setStep("find");
    setQ("");
    setChannel(null);
    setCandidates([]);
    setVideos([]);
    setPicked({});
    setFailed({});
    setSlots(null);
    setScanned(0);
    setPartial(0);
    setError("");
    setNote("");
  }

  async function find(e) {
    e?.preventDefault();
    const value = q.trim();
    if (!value || busy) return;

    setBusy(true);
    setError("");
    setNote("");
    setCandidates([]);
    try {
      const { data } = await api.get(`${base}/resolve`, { params: { q: value } });
      if (data.match) {
        setChannel(data.match);
        setStep("confirm");
      } else if (data.candidates?.length) {
        setCandidates(data.candidates);
        setStep("confirm");
      } else {
        setNote(data.message || "No channel found.");
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't look that channel up."));
    } finally {
      setBusy(false);
    }
  }

  const loadVideos = useCallback(async (ch) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get(`${base}/videos`, {
        params: { channel_id: ch.channel_id, ...params },
      });
      setVideos(data.videos || []);
      setSlots(data.slots || null);
      setScanned(data.scanned || 0);

      // ── NOTHING IS PRE-TICKED ───────────────────────────────────────────
      // An earlier version seeded the newest few as a suggestion. Wrong, and
      // wrong in a way that matters: the most recent uploads are as likely to
      // be a trend clip, a repost or a sponsored read as they are to be
      // representative, and a voice built from those sounds like a stranger.
      //
      // Worse, a pre-filled selection reads as a decision already taken.
      // Somebody who trusts it presses on without looking, which is exactly
      // the judgement this screen exists to collect. Choosing is the point.
      setPicked({});
      setStep("pick");
    } catch (err) {
      setError(errorMessage(err, "Couldn't read that channel's videos."));
    } finally {
      setBusy(false);
    }
    // `params` is a fresh object each render, so it is deliberately not a
    // dependency: including it would rebuild this callback every render and
    // re-fire any effect that watched it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  function toggle(v) {
    if (v.already_added) return;
    setPicked((p) => {
      const next = { ...p };
      if (next[v.video_id]) delete next[v.video_id];
      else {
        // Capped at the room actually available. Letting somebody tick eight
        // and refusing three afterwards is the failure this screen exists to
        // prevent, not one it should reproduce.
        if (Object.keys(next).filter((k) => next[k]).length >= left) return p;
        next[v.video_id] = true;
      }
      return next;
    });
  }

  async function submit() {
    if (submitting || pickedIds.length === 0) return;
    setSubmitting(true);
    setError("");
    setFailed({});

    const chosen = pickedIds
      .map((id) => videos.find((v) => v.video_id === id))
      .filter(Boolean);

    try {
      const result = await onConfirm?.(channel, chosen);
      const fails = result?.failed || {};
      setFailed(fails);
      setPartial(result?.ok ?? chosen.length);
      if (Object.keys(fails).length === 0) reset();
    } catch (err) {
      setError(errorMessage(err, "Couldn't use those videos."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--line)", borderRadius: "var(--radius)",
        background: "var(--card)", overflow: "hidden", marginBottom: 14,
      }}
    >
      <div style={{ padding: isPhone ? "13px 14px" : "15px 18px" }}>
        <div style={{ fontSize: isPhone ? 14 : 15, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.015em" }}>
          {words.title}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "4px 0 0", lineHeight: 1.55 }}>
          {step === "find"
            ? words.findBlurb
            : step === "confirm"
              ? words.confirmBlurb
              : words.pickBlurb(left, Math.floor(maxSeconds / 60))}
        </p>
      </div>

      {error && <Banner tone="bad">{error}</Banner>}
      {note && <Banner tone="warn">{note}</Banner>}
      {partial > 0 && Object.keys(failed).length > 0 && (
        <Banner tone="warn">Used {partial}. The rest are marked below.</Banner>
      )}

      {step === "find" && (
        <form
          onSubmit={find}
          style={{ padding: isPhone ? "0 14px 14px" : "0 18px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={words.placeholder}
            aria-label="Channel handle, link or name"
            style={{
              flex: "1 1 200px", minWidth: 0, height: 40, padding: "0 12px",
              borderRadius: 10, border: "1px solid var(--line)",
              background: "var(--paper)", color: "var(--ink)",
              fontSize: 14, fontFamily: "inherit", outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={busy || !q.trim()}
            style={{
              height: 40, padding: "0 18px", borderRadius: 10, border: "none",
              background: busy || !q.trim() ? "var(--line)" : "var(--primary)",
              color: busy || !q.trim() ? "var(--ink-mute)" : "#fff",
              fontSize: 13.5, fontWeight: 650, fontFamily: "inherit",
              cursor: busy || !q.trim() ? "default" : "pointer", whiteSpace: "nowrap",
            }}
          >
            {busy ? "Looking…" : "Find"}
          </button>
        </form>
      )}

      {step === "confirm" && (
        <div style={{ padding: isPhone ? "0 14px 14px" : "0 18px 16px" }}>
          {channel && (
            <ChannelCard
              ch={channel}
              isPhone={isPhone}
              busy={busy}
              primary={words.confirmPrimary}
              rejectLabel={words.reject}
              onPick={() => loadVideos(channel)}
              onReject={reset}
            />
          )}

          {!channel && candidates.length > 0 && (
            <>
              <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "0 0 10px" }}>
                More than one channel matched. Pick the right one.
              </p>
              {candidates.map((c) => (
                <ChannelCard
                  key={c.channel_id}
                  ch={c}
                  isPhone={isPhone}
                  busy={busy}
                  primary="This one"
                  onPick={() => { setChannel(c); loadVideos(c); }}
                />
              ))}
              <button onClick={reset} style={linkBtn}>Search again</button>
            </>
          )}
        </div>
      )}

      {step === "pick" && (
        <div>
          {videos.length === 0 && (
            <div style={{ padding: isPhone ? "0 14px 16px" : "0 18px 18px" }}>
              <p style={{ fontSize: 13, color: "var(--ink-body)", margin: "0 0 10px", lineHeight: 1.6 }}>
                We looked through {scanned} of this channel's uploads and found nothing under{" "}
                {Math.floor(maxSeconds / 60)} minutes.
              </p>
              <button onClick={reset} style={linkBtn}>Try another channel</button>
            </div>
          )}

          {videos.length > 0 && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: isPhone ? 10 : 14,
                  padding: isPhone ? "0 14px 14px" : "0 18px 16px",
                }}
              >
                {videos.map((v) => (
                  <VideoCard
                    key={v.video_id}
                    v={v}
                    on={!!picked[v.video_id]}
                    full={!picked[v.video_id] && pickedIds.length >= left}
                    error={failed[v.video_id]}
                    takenLabel={words.taken}
                    onToggle={() => toggle(v)}
                  />
                ))}
              </div>

              {/* The count is here even when the button is not, because "3 of 5
                  selected" is the thing that explains a disabled action
                  somewhere else on the page. */}
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, flexWrap: "wrap",
                  padding: isPhone ? "12px 14px" : "13px 18px",
                  borderTop: "1px solid var(--line)", background: "var(--paper)",
                }}
              >
                <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
                  <strong style={{ color: pickedIds.length ? "var(--ink)" : "var(--ink-mute)", fontWeight: 650 }}>
                    {pickedIds.length}
                  </strong>{" "}
                  of {left} selected
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button onClick={reset} disabled={submitting} style={linkBtn}>
                    {showSubmit ? "Cancel" : "Change channel"}
                  </button>
                  {showSubmit && (
                    <button
                      onClick={submit}
                      disabled={submitting || pickedIds.length === 0}
                      style={{
                        height: 38, padding: "0 16px", borderRadius: 10, border: "none",
                        background: submitting || pickedIds.length === 0 ? "var(--line)" : "var(--primary)",
                        color: submitting || pickedIds.length === 0 ? "var(--ink-mute)" : "#fff",
                        fontSize: 13.5, fontWeight: 650, fontFamily: "inherit",
                        cursor: submitting || pickedIds.length === 0 ? "default" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {submitting ? words.submitting(pickedIds.length) : words.submit(pickedIds.length)}
                    </button>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function ChannelCard({ ch, isPhone, busy, primary, rejectLabel, onPick, onReject }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: isPhone ? 11 : 13, marginBottom: 9,
        border: "1px solid var(--line)", borderRadius: 12, background: "var(--paper)",
      }}
    >
      {ch.thumbnail ? (
        <img src={ch.thumbnail} alt="" width={46} height={46} style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />
      ) : (
        <div style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--line)", flexShrink: 0 }} />
      )}

      <div style={{ minWidth: 0, flex: "1 1 140px" }}>
        <div style={{ fontSize: 14, fontWeight: 650, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ch.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2 }}>
          {[
            ch.handle,
            // null means the channel hides the count. Printing "0 subscribers"
            // for a real channel reads as a failed lookup.
            ch.subscribers != null ? `${compact(ch.subscribers)} subscribers` : null,
            ch.video_count ? `${compact(ch.video_count)} videos` : null,
          ].filter(Boolean).join(" · ")}
        </div>
      </div>

      <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {onReject && (
          <button onClick={onReject} disabled={busy} style={linkBtn}>{rejectLabel || "Not this one"}</button>
        )}
        <button
          onClick={onPick}
          disabled={busy}
          style={{
            height: 36, padding: "0 14px", borderRadius: 9, border: "1px solid var(--line)",
            background: "var(--card)", color: "var(--ink)", fontSize: 13, fontWeight: 600,
            fontFamily: "inherit", cursor: busy ? "default" : "pointer", whiteSpace: "nowrap",
          }}
        >
          {busy ? "Loading…" : primary}
        </button>
      </span>
    </div>
  );
}

/**
 * One video, as a card in the grid.
 *
 * Thumbnail first and large, because that is what a creator recognises their
 * own video by. The title is allowed two lines rather than being clipped to
 * one: these titles are mostly emoji and hashtags after the first few words, so
 * one line often cuts off before the part that identifies the video.
 *
 * The tick sits ON the thumbnail rather than beside it. In a four-column grid a
 * checkbox in the corner of a card is unambiguous about which card it belongs
 * to, where a column of ticks down the left edge of a grid is not.
 */
function VideoCard({ v, on, full, error, takenLabel, onToggle }) {
  const disabled = v.already_added || (full && !on);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: 0,
        border: `1.5px solid ${on ? "var(--made)" : "var(--line)"}`,
        borderRadius: 12, overflow: "hidden",
        background: on ? "var(--made-tint)" : "var(--card)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !v.already_added ? 0.4 : 1,
        fontFamily: "inherit",
        transition: "border-color .12s ease, background .12s ease",
      }}
    >
      <span style={{ display: "block", position: "relative" }}>
        {v.thumbnail ? (
          <img
            src={v.thumbnail}
            alt=""
            style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }}
          />
        ) : (
          <span style={{ display: "block", width: "100%", aspectRatio: "16/9", background: "var(--line)" }} />
        )}

        <span style={{ position: "absolute", top: 7, left: 7 }}>
          <Tick on={on} muted={v.already_added} />
        </span>

        {/* Duration over the thumbnail, the way every video player puts it.
            It is the one fact that decides eligibility here, so it belongs
            where the eye already looks for it. */}
        <span
          style={{
            position: "absolute", bottom: 6, right: 6,
            padding: "2px 6px", borderRadius: 5,
            background: "rgba(0,0,0,.78)", color: "#fff",
            fontSize: 11, fontWeight: 650, fontVariantNumeric: "tabular-nums",
          }}
        >
          {mmss(v.duration_seconds)}
        </span>
      </span>

      <span style={{ display: "block", padding: "9px 10px 10px" }}>
        {/* `indic` because a Telugu or Hindi title lands in a fallback face
            without it. Title only, no description: a thumbnail and the opening
            words are how anybody recognises their own video. */}
        <span
          className="indic"
          style={{
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden", fontSize: 12.5, lineHeight: 1.4,
            color: "var(--ink)", fontWeight: 550, minHeight: "2.8em",
          }}
        >
          {v.title || "Untitled"}
        </span>
        <span
          style={{
            display: "block", fontSize: 11.5, marginTop: 5,
            color: error ? "var(--bad)" : v.already_added ? "var(--ink-mute)" : "var(--ink-mute)",
          }}
        >
          {error
            ? error
            : v.already_added
              ? takenLabel
              : v.views
                ? `${compact(v.views)} views`
                : ""}
        </span>
      </span>
    </button>
  );
}

function Tick({ on, muted }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 19, height: 19, borderRadius: 5, display: "grid", placeItems: "center",
        border: `1.5px solid ${on ? "var(--made)" : "var(--line)"}`,
        background: on ? "var(--made)" : muted ? "var(--line)" : "transparent",
        flexShrink: 0,
      }}
    >
      {(on || muted) && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={on ? "#fff" : "var(--ink-mute)"} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

function Banner({ tone, children }) {
  const skin = tone === "bad"
    ? { bg: "#FDF1F1", line: "#F0D4D4" }
    : { bg: "#FBF5E8", line: "#EEDCB6" };
  return (
    <div
      role="status"
      style={{
        padding: "9px 15px", borderTop: `1px solid ${skin.line}`,
        borderBottom: `1px solid ${skin.line}`, background: skin.bg,
        fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-body)",
      }}
    >
      {children}
    </div>
  );
}

const linkBtn = {
  height: 36, padding: "0 10px", borderRadius: 9, border: "none",
  background: "transparent", color: "var(--ink-mute)",
  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
  whiteSpace: "nowrap",
};

/** 1:24, because a duration is read at a glance and 84 is not. */
function mmss(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 65.8K, 8L. Counts on a card are for scale, not accounting. */
function compact(n) {
  const v = Number(n) || 0;
  if (v >= 1e7) return `${(v / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
}
