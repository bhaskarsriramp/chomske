import { useState, useCallback } from "react";
import api, { errorMessage } from "../../api";

/**
 * ChannelImport: build a voice from your own channel, without finding a URL.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────────
 * The first thing this product asked of a creator was the most tedious thing in
 * it: open YouTube in another tab, find five of your own videos, copy each
 * address, come back, paste, repeat. Everybody has their channel open all day
 * and nobody has their video ids to hand. It is five context switches before
 * anything interesting happens, and it is where people give up.
 *
 * Three steps replace it. Type a channel name. Confirm it is you. Tick videos.
 *
 * ── IT DOES NOT ADD THE VIDEOS ITSELF ────────────────────────────────────────
 * This component posts each chosen url to the SAME POST /transcribe the paste
 * box posts to, one at a time. That is deliberate and it is the most important
 * decision in the file.
 *
 * Adding has seven guards behind it: the lane test, the per-lane slot ceiling,
 * the per-account daily cap, the duplicate index, the live-stream refusal, the
 * length gate and the profile scoping. A batch endpoint would have had to
 * reimplement all of them, and would have got one subtly wrong. So the picker
 * is a nicer way to fill in the existing form, not a second way into the
 * database, and the analysis flow behind it is untouched.
 *
 * Consequence worth knowing: partial success is a real outcome. Four videos can
 * land and the fifth be refused, so failures are collected per video and shown
 * against the row that caused them, rather than as one banner that does not say
 * which pick was the problem.
 */
export default function ChannelImport({ profileId, maxSeconds = 180, onAdded, isPhone }) {
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
  const [picked, setPicked] = useState({});   // video_id -> true
  const [failed, setFailed] = useState({});   // video_id -> message
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState(0);

  const pickedIds = Object.keys(picked).filter((k) => picked[k]);
  const left = slots?.left ?? 5;

  /* ── Step 1: which channel ───────────────────────────────────────────── */

  async function find(e) {
    e?.preventDefault();
    const value = q.trim();
    if (!value || busy) return;

    setBusy(true);
    setError("");
    setNote("");
    setCandidates([]);
    try {
      const { data } = await api.get("/channel/resolve", { params: { q: value } });
      if (data.match) {
        setChannel(data.match);
        setStep("confirm");
      } else if (data.candidates?.length) {
        setCandidates(data.candidates);
        setStep("confirm");
      } else {
        setNote(data.message || "We couldn't find that channel.");
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't look that channel up."));
    } finally {
      setBusy(false);
    }
  }

  /* ── Step 2 to 3: their recent short videos ──────────────────────────── */

  const loadVideos = useCallback(async (ch) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get("/channel/videos", {
        params: { channel_id: ch.channel_id, ...(profileId ? { profile: profileId } : {}) },
      });
      setVideos(data.videos || []);
      setSlots(data.slots || null);
      setScanned(data.scanned || 0);

      // Pre-ticked up to the room available, newest first, skipping anything
      // already on file. A suggestion, not a decision: the creator is the only
      // one who knows which of their videos sound like them, and the five most
      // recent can easily be a trend clip, a repost and a sponsored read.
      const room = data.slots?.left ?? 5;
      const seed = {};
      let n = 0;
      for (const v of data.videos || []) {
        if (n >= room) break;
        if (v.already_added) continue;
        seed[v.video_id] = true;
        n += 1;
      }
      setPicked(seed);
      setStep("pick");
    } catch (err) {
      setError(errorMessage(err, "Couldn't read that channel's videos."));
    } finally {
      setBusy(false);
    }
  }, [profileId]);

  function toggle(v) {
    if (v.already_added) return;
    setPicked((p) => {
      const next = { ...p };
      if (next[v.video_id]) delete next[v.video_id];
      else {
        // Capped at the room actually left in the lane. Letting somebody tick
        // eight and refusing three on submit is the failure this whole screen
        // exists to avoid.
        if (Object.keys(next).filter((k) => next[k]).length >= left) return p;
        next[v.video_id] = true;
      }
      return next;
    });
  }

  /* ── Submit: the existing endpoint, once per video ───────────────────── */

  async function addPicked() {
    if (adding || pickedIds.length === 0) return;
    setAdding(true);
    setError("");
    setFailed({});

    const fails = {};
    let ok = 0;

    // Sequential on purpose. Five parallel posts race the per-lane slot count
    // and the daily cap, so two could both read "one slot left" and both take
    // it. Serial also means the fifth video's refusal names the fifth video.
    for (const id of pickedIds) {
      const v = videos.find((x) => x.video_id === id);
      if (!v) continue;
      try {
        await api.post("/transcribe", { url: v.url, profile: profileId || undefined });
        ok += 1;
      } catch (err) {
        fails[id] = errorMessage(err, "Couldn't add this one.");
      }
    }

    setFailed(fails);
    setAddedCount(ok);
    setAdding(false);
    onAdded?.(ok);

    // Everything landed: fold the panel away. The videos are now rows in the
    // list below it and the Analyse button is the next thing to press, so
    // leaving a filled-in picker open on screen competes with it.
    if (ok > 0 && Object.keys(fails).length === 0) reset();
  }

  function reset() {
    setStep("find");
    setQ("");
    setChannel(null);
    setCandidates([]);
    setVideos([]);
    setPicked({});
    setFailed({});
    setSlots(null);
    setError("");
    setNote("");
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div
      style={{
        border: "1px solid var(--line)", borderRadius: "var(--radius)",
        background: "var(--card)", overflow: "hidden", marginBottom: 14,
      }}
    >
      <div style={{ padding: isPhone ? "13px 14px" : "15px 18px" }}>
        <div style={{ fontSize: isPhone ? 14 : 15, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.015em" }}>
          Add from your channel
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "4px 0 0", lineHeight: 1.55 }}>
          {step === "find"
            ? "Your @handle, channel link, or channel name. We'll show your recent videos to pick from."
            : step === "confirm"
              ? "Check this is the right channel."
              : `Pick up to ${left === 1 ? "1 video" : `${left} videos`} under ${Math.floor(maxSeconds / 60)} minutes.`}
        </p>
      </div>

      {error && <Banner tone="bad">{error}</Banner>}
      {note && <Banner tone="warn">{note}</Banner>}
      {addedCount > 0 && Object.keys(failed).length > 0 && (
        <Banner tone="warn">
          Added {addedCount}. The rest are marked below.
        </Banner>
      )}

      {/* ── Step 1 ────────────────────────────────────────────────────── */}
      {step === "find" && (
        <form onSubmit={find} style={{ padding: isPhone ? "0 14px 14px" : "0 18px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="@yourchannel"
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

      {/* ── Step 2 ────────────────────────────────────────────────────── */}
      {step === "confirm" && (
        <div style={{ padding: isPhone ? "0 14px 14px" : "0 18px 16px" }}>
          {channel && (
            <ChannelCard
              ch={channel}
              isPhone={isPhone}
              busy={busy}
              primary="Yes, this is me"
              onPick={() => loadVideos(channel)}
              onReject={reset}
            />
          )}

          {!channel && candidates.length > 0 && (
            <>
              <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "0 0 10px" }}>
                More than one channel matched. Pick yours.
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

      {/* ── Step 3 ────────────────────────────────────────────────────── */}
      {step === "pick" && (
        <div>
          {videos.length === 0 && (
            <div style={{ padding: isPhone ? "0 14px 16px" : "0 18px 18px" }}>
              <p style={{ fontSize: 13, color: "var(--ink-body)", margin: "0 0 10px", lineHeight: 1.6 }}>
                We looked through {scanned} of this channel's uploads and found nothing under{" "}
                {Math.floor(maxSeconds / 60)} minutes. Paste a link below instead.
              </p>
              <button onClick={reset} style={linkBtn}>Try another channel</button>
            </div>
          )}

          {videos.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid var(--line)" }}>
                {videos.map((v) => (
                  <VideoRow
                    key={v.video_id}
                    v={v}
                    on={!!picked[v.video_id]}
                    full={!picked[v.video_id] && pickedIds.length >= left}
                    error={failed[v.video_id]}
                    isPhone={isPhone}
                    onToggle={() => toggle(v)}
                  />
                ))}
              </div>

              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, flexWrap: "wrap",
                  padding: isPhone ? "12px 14px" : "13px 18px",
                  borderTop: "1px solid var(--line)", background: "var(--paper)",
                }}
              >
                <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
                  {pickedIds.length} of {left} selected
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button onClick={reset} disabled={adding} style={linkBtn}>Cancel</button>
                  <button
                    onClick={addPicked}
                    disabled={adding || pickedIds.length === 0}
                    style={{
                      height: 38, padding: "0 16px", borderRadius: 10, border: "none",
                      background: adding || pickedIds.length === 0 ? "var(--line)" : "var(--primary)",
                      color: adding || pickedIds.length === 0 ? "var(--ink-mute)" : "#fff",
                      fontSize: 13.5, fontWeight: 650, fontFamily: "inherit",
                      cursor: adding || pickedIds.length === 0 ? "default" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {adding
                      ? `Adding ${pickedIds.length}…`
                      : `Add ${pickedIds.length || ""} ${pickedIds.length === 1 ? "video" : "videos"}`.replace("  ", " ")}
                  </button>
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

function ChannelCard({ ch, isPhone, busy, primary, onPick, onReject }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: isPhone ? 11 : 13, marginBottom: 9,
        border: "1px solid var(--line)", borderRadius: 12, background: "var(--paper)",
      }}
    >
      {ch.thumbnail ? (
        <img
          src={ch.thumbnail}
          alt=""
          width={46}
          height={46}
          style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
        />
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
            // null means the channel hides it. "0 subscribers" on a real
            // channel reads as a failed lookup, so it is simply not shown.
            ch.subscribers != null ? `${compact(ch.subscribers)} subscribers` : null,
            ch.video_count ? `${compact(ch.video_count)} videos` : null,
          ].filter(Boolean).join(" · ")}
        </div>
      </div>

      <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {onReject && (
          <button onClick={onReject} disabled={busy} style={linkBtn}>Not me</button>
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

function VideoRow({ v, on, full, error, isPhone, onToggle }) {
  const disabled = v.already_added || (full && !on);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      style={{
        display: "grid",
        gridTemplateColumns: isPhone ? "22px 74px 1fr" : "24px 96px 1fr",
        gap: isPhone ? 10 : 12,
        width: "100%", textAlign: "left", alignItems: "center",
        padding: isPhone ? "9px 14px" : "10px 18px",
        border: "none", borderTop: "1px solid var(--line)",
        background: on ? "var(--made-tint)" : "transparent",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !v.already_added ? 0.45 : 1,
        fontFamily: "inherit",
      }}
    >
      <Tick on={on} muted={v.already_added} />

      {v.thumbnail ? (
        <img
          src={v.thumbnail}
          alt=""
          style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 6, display: "block" }}
        />
      ) : (
        <div style={{ width: "100%", aspectRatio: "16/9", background: "var(--line)", borderRadius: 6 }} />
      )}

      <span style={{ minWidth: 0 }}>
        {/* Title only, and `indic` because a Telugu or Hindi title lands in a
            fallback face without it. No description: a creator recognises
            their own video from the thumbnail and the first few words. */}
        <span
          className="indic"
          style={{
            display: "block", fontSize: isPhone ? 13 : 13.5, color: "var(--ink)",
            lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap", fontWeight: 550,
          }}
        >
          {v.title || "Untitled"}
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: error ? "var(--bad)" : "var(--ink-mute)", marginTop: 3 }}>
          {error
            ? error
            : v.already_added
              ? "Already in this voice"
              : [mmss(v.duration_seconds), v.views ? `${compact(v.views)} views` : null]
                .filter(Boolean).join(" · ")}
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

/** 65.8K, 8M. Counts on a card are for scale, not accounting. */
function compact(n) {
  const v = Number(n) || 0;
  if (v >= 1e7) return `${(v / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
}
