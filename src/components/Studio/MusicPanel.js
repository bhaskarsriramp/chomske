/**
 * MusicPanel.js: the Music tab, beside Voice.
 *
 * Three parts, top to bottom:
 *
 *   On this video    the tracks on the music lane; pick one to change it.
 *   Selected track   how loud it is (a slider, and Mute), whether it dips
 *                    under the voice, whether it loops, its fades, Remove.
 *   Library          every track Clipo has, by mood, each with a play button,
 *                    and the creator's own under "Yours". "Add" puts it at
 *                    the playhead, or where the lane was Ctrl/⌘ + clicked;
 *                    with a track selected it says "Use" and swaps that
 *                    track's music, keeping its place. "Upload your own"
 *                    takes an audio file up to the server's limit and puts
 *                    it straight on the lane.
 *
 * The library is public-domain music Clipo hosts (backend services/studio/
 * music.js), so nothing here costs credits or needs a credit line.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { uploadMusic, deleteMusic } from "./studioApi";
import { Btn, Panel, Icon, Toggle, Slider, Segmented, Row } from "./ui";
import { fmtTime } from "./model";
import { MUSIC_MAX, musicItems, roomAt, newMusic, withMusic, musicEnd, musicPlan } from "./musicTimeline.mjs";

const fmtLen = (s) => fmtTime(s, false);
/** The mood the creator's own tracks are filed under (backend music.js YOURS). */
const YOURS = "Yours";
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|mp4|wma|aiff?)$/i;

/** How long an audio file plays, read on this machine; null if it can't tell. */
function lengthOf(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v) && v > 0 ? v : null);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => finish(a.duration);
    a.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
    a.src = url;
  });
}

export default function MusicPanel({ tl, edit, selection, onSelect, time, total, seek, library, onLibrary, addAt, onClearAddAt }) {
  const items = useMemo(() => [...musicItems(tl)].sort((a, b) => a.start - b.start), [tl]);
  const tracks = useMemo(() => new Map((library?.tracks || []).map((t) => [t.id, t])), [library]);
  const current = items.find((m) => selection?.kind === "music" && selection.id === m.id) || null;
  // Whether the selected track blends into a neighbour at either end (musicMix.mjs).
  const blend = useMemo(() => (current ? musicPlan(items).find((p) => p.id === current.id) : null), [items, current]);
  const [mood, setMood] = useState("All");
  const [notice, setNotice] = useState("");

  /* ── Hearing a track before adding it ──────────────────────────────────── */
  const [playing, setPlaying] = useState(null);
  const audio = useRef(null);
  useEffect(() => () => audio.current?.pause(), []);
  const play = (t) => {
    if (playing === t.id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(t.url);
    a.volume = 0.8;
    audio.current = a;
    a.onended = () => setPlaying((p) => (p === t.id ? null : p));
    a.onerror = () => setPlaying((p) => (p === t.id ? null : p));
    setPlaying(t.id);
    a.play().catch(() => setPlaying(null));
  };

  /* ── Changing what is on the lane ──────────────────────────────────────── */
  const setItems = (next, label) => edit({ audio: withMusic(tl, next) }, label);
  const patch = (fields, label) => current && setItems(musicItems(tl).map((m) => (m.id === current.id ? { ...m, ...fields } : m)), label);

  const add = (t) => {
    setNotice("");
    if (items.length >= MUSIC_MAX) {
      setNotice(`A video can have up to ${MUSIC_MAX} music tracks.`);
      return;
    }
    const at = addAt ?? time;
    const room = roomAt(tl, at, total);
    if (!room) {
      setNotice("There's no free space on the music lane there. Move the playhead to a gap, or remove a track.");
      return;
    }
    const item = newMusic(t, room);
    setItems([...musicItems(tl), item], "Add music");
    onSelect({ kind: "music", id: item.id });
    onClearAddAt?.();
    seek?.(room.start + 0.05);
  };

  // Swapping keeps the place; a track that doesn't loop is cut to its length.
  const use = (t) => {
    if (!current) return;
    const left = Math.max(0, t.duration - (current.in || 0));
    const duration = current.loop === false ? Math.min(current.duration, left) : current.duration;
    patch({ media: t.id, in: 0, duration }, "Change music");
  };

  const remove = () => {
    if (!current) return;
    setItems(musicItems(tl).filter((m) => m.id !== current.id), "Remove music");
    onSelect(null);
  };

  /* ── The creator's own tracks ──────────────────────────────────────────── */
  const picker = useRef(null);
  // { name, progress: 0…1, or null while the server gets it ready }
  const [uploading, setUploading] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Straight onto the lane once uploaded, unless a track is selected (then
  // "Use" swaps it). Added on the next render, so it lands on the timeline as
  // it is now rather than as it was when the upload began.
  const [justUploaded, setJustUploaded] = useState(null);
  useEffect(() => {
    if (!justUploaded) return;
    setJustUploaded(null);
    if (!current) add(justUploaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justUploaded]);
  const limits = library?.limits || { max_bytes: 60 * 1048576, max_seconds: 480 };
  const maxMin = Math.round(limits.max_seconds / 60);

  const upload = async (file) => {
    if (!file || uploading) return;
    setNotice("");
    if (!/^audio\//.test(file.type) && !AUDIO_EXT.test(file.name || "")) {
      setNotice("Choose an audio file, like an MP3.");
      return;
    }
    if (file.size > limits.max_bytes) {
      setNotice(`That file is over ${Math.round(limits.max_bytes / 1048576)} MB. Use an MP3 or M4A, or a shorter clip.`);
      return;
    }
    const len = await lengthOf(file);
    if (len && len > limits.max_seconds + 0.5) {
      setNotice(`That track is ${Math.floor(len / 60)} min ${Math.round(len % 60)} s long. Tracks can be up to ${maxMin} minutes.`);
      return;
    }
    setUploading({ name: file.name || "Your track", progress: 0 });
    try {
      const t = await uploadMusic(file, (p) => setUploading((u) => u && { ...u, progress: p }));
      onLibrary?.((l) => ({ ...(l || { moods: [] }), tracks: [t, ...(l?.tracks || []).filter((x) => x.id !== t.id)] }));
      setMood(YOURS);
      setJustUploaded(t);
    } catch (err) {
      setNotice(err?.response?.data?.message || err?.message || "That track couldn't be uploaded. Please try again.");
    } finally {
      setUploading(null);
    }
  };

  const removeUpload = async (t) => {
    setNotice("");
    if (items.some((m) => m.media === t.id)) {
      setConfirmId(null);
      setNotice("That track is on the Music lane. Remove it from there first.");
      return;
    }
    setDeletingId(t.id);
    try {
      await deleteMusic(t.id);
    } catch (err) {
      // Already gone (another tab): it goes from the list all the same.
      if (err?.response?.status !== 404) {
        setNotice(err?.response?.data?.message || "That track couldn't be deleted. Please try again.");
        setDeletingId(null);
        return;
      }
    }
    if (playing === t.id) {
      audio.current?.pause();
      setPlaying(null);
    }
    onLibrary?.((l) => ({ ...l, tracks: (l?.tracks || []).filter((x) => x.id !== t.id) }));
    setConfirmId(null);
    setDeletingId(null);
  };

  const hasOwn = (library?.tracks || []).some((t) => t.uploaded);
  const moods = ["All", ...(hasOwn || mood === YOURS ? [YOURS] : []), ...(library?.moods || [])];
  const shown = (library?.tracks || []).filter((t) => mood === "All" || t.mood === mood);
  const cur = current ? tracks.get(current.media) : null;

  return (
    <>
      <Panel title={`Music · ${items.length}`}>
        {items.length === 0 ? (
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)" }}>
            No music yet. Pick a track below, or {IS_MAC ? "⌘" : "Ctrl"} + click the Music lane where it should start.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 2, margin: -6 }}>
            {items.map((m) => {
              const t = tracks.get(m.media);
              return (
                <Row
                  key={m.id}
                  accent={LANE_COLOR}
                  selected={current?.id === m.id}
                  onClick={() => {
                    onSelect({ kind: "music", id: m.id });
                    seek?.(m.start + 0.05);
                  }}
                  title={t?.title || "Music"}
                  sub={`${fmtTime(m.start, true)} – ${fmtTime(musicEnd(m), true)}${m.muted ? " · Muted" : ""}`}
                />
              );
            })}
          </div>
        )}
      </Panel>

      {current && (
        <Panel title="Selected track">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 10, background: `${LANE_COLOR}22`, color: LANE_COLOR }}>
              <Icon name="music" size={16} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 650, color: "var(--ink)" }}>{cur?.title || "Music"}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-mute)" }}>
                {cur ? `${cur.uploaded ? "Your upload" : cur.mood} · ${fmtLen(cur.duration)}${cur.artist && cur.artist !== "FreePD" ? ` · ${cur.artist}` : ""}` : ""}
              </span>
            </span>
          </div>
          <Slider
            label="Volume"
            value={Math.round((current.volume ?? 0.35) * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            disabled={current.muted}
            onChange={(v) => patch({ volume: v / 100 }, "Music volume")}
          />
          <Toggle label="Mute" checked={!!current.muted} onChange={(v) => patch({ muted: v }, v ? "Mute music" : "Unmute music")} />
          <Toggle
            label="Lower under the voice"
            hint="Dips while someone is speaking, and comes back in the pauses."
            checked={current.duck !== false}
            onChange={(v) => patch({ duck: v }, "Music under voice")}
          />
          <Toggle
            label="Loop"
            hint="Plays the track again if it ends before its place on the timeline does."
            checked={current.loop !== false}
            onChange={(v) => patch({ loop: v }, v ? "Loop music" : "Don't loop music")}
          />
          {blend?.blendIn ? (
            <BlendRow label="Fade in" text="Blends from the track before" />
          ) : (
            <Slider label="Fade in" value={current.fade_in ?? 1} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => patch({ fade_in: v }, "Music fade in")} />
          )}
          {blend?.blendOut ? (
            <BlendRow label="Fade out" text="Blends into the next track" />
          ) : (
            <Slider label="Fade out" value={current.fade_out ?? 2} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => patch({ fade_out: v }, "Music fade out")} />
          )}
          <Btn kind="danger" size="s" icon={<Icon name="trash" size={13} />} onClick={remove}>
            Remove track
          </Btn>
        </Panel>
      )}

      <Panel title="Library">
        {addAt != null && !current && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: `${LANE_COLOR}18`, fontSize: 12.5, color: "var(--ink-body)" }}>
            <Icon name="plus" size={13} />
            <span style={{ flex: 1 }}>Pick a track to add at {fmtTime(addAt, true)}.</span>
            <button type="button" onClick={onClearAddAt} aria-label="Cancel" style={{ border: 0, background: "transparent", color: "var(--ink-mute)", cursor: "pointer", padding: 2 }}>
              <Icon name="close" size={12} />
            </button>
          </div>
        )}
        {notice && <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--bad)" }}>{notice}</div>}
        {library && (
          <div style={{ display: "grid", gap: 6 }}>
            <input
              ref={picker}
              type="file"
              accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                upload(f);
              }}
            />
            {uploading ? (
              <UploadProgress name={uploading.name} progress={uploading.progress} />
            ) : (
              <Btn kind="ghost" size="s" icon={<Icon name="upload" size={13} />} onClick={() => picker.current?.click()}>
                Upload your own
              </Btn>
            )}
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-mute)" }}>
              MP3, M4A or WAV, up to {maxMin} minutes. Use music you have the rights to.
            </div>
          </div>
        )}
        {!library ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>Loading the library…</div>
        ) : shown.length === 0 && mood === "All" ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>The music library isn't available right now.</div>
        ) : (
          <>
            <Segmented size="s" value={mood} onChange={setMood} label="Mood" options={moods.map((m) => ({ value: m, label: m }))} />
            <div style={{ display: "grid", gap: 6 }}>
              {shown.map((t) => (
                <LibraryRow
                  key={t.id}
                  track={t}
                  playing={playing === t.id}
                  inUse={current?.media === t.id}
                  action={current ? "Use" : "Add"}
                  onPlay={() => play(t)}
                  onPick={() => (current ? use(t) : add(t))}
                  confirming={confirmId === t.id}
                  deleting={deletingId === t.id}
                  onDelete={t.uploaded ? () => setConfirmId(t.id) : null}
                  onConfirmDelete={() => removeUpload(t)}
                  onCancelDelete={() => setConfirmId(null)}
                />
              ))}
              {shown.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>{mood === YOURS ? "No uploads yet." : "No tracks here."}</div>
              )}
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-mute)" }}>
              {mood === YOURS ? "Only you can use your uploads." : "Library tracks are free to use in any video."}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

function LibraryRow({ track, playing, inUse, action, onPlay, onPick, onDelete, confirming, deleting, onConfirmDelete, onCancelDelete }) {
  if (confirming) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 12px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--paper)" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.4, color: "var(--ink-body)" }}>
          Delete <b style={{ fontWeight: 650 }}>{track.title}</b>? Other videos using it lose this music.
        </span>
        <Btn size="xs" kind="quiet" disabled={deleting} onClick={onCancelDelete}>
          Cancel
        </Btn>
        <Btn size="xs" kind="danger" disabled={deleting} onClick={onConfirmDelete}>
          {deleting ? "Deleting…" : "Delete"}
        </Btn>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 8px", borderRadius: 12,
        border: `1px solid ${inUse ? "var(--ink)" : "var(--line)"}`, background: "var(--card)",
      }}
    >
      <button
        type="button"
        onClick={onPlay}
        aria-label={playing ? `Stop ${track.title}` : `Play ${track.title}`}
        title={playing ? "Stop" : "Play"}
        style={{
          width: 32, height: 32, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%",
          border: "1px solid var(--line)", background: playing ? "var(--ink)" : "var(--card)", color: playing ? "#fff" : "var(--ink)", cursor: "pointer",
        }}
      >
        <Icon name={playing ? "stop" : "play"} size={12} />
      </button>
      {/* width 0 + grow: a long title is cut short, never widens the panel */}
      <span style={{ flex: "1 1 0", width: 0, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 620, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={track.title}>
          {track.title}
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.uploaded ? "Your upload" : track.mood} · {fmtLen(track.duration)}
        </span>
      </span>
      <Waveform peaks={track.peaks} on={playing} />
      <Btn size="xs" kind={inUse ? "quiet" : "ghost"} disabled={inUse} onClick={onPick}>
        {inUse ? "In use" : action}
      </Btn>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${track.title}`}
          title="Delete"
          style={{ border: 0, background: "transparent", color: "var(--ink-mute)", cursor: "pointer", padding: 4, marginLeft: -4, display: "grid", placeItems: "center" }}
        >
          <Icon name="trash" size={13} />
        </button>
      )}
    </div>
  );
}

/** A fade that is a blend with the neighbouring track: said, not offered as a slider. */
function BlendRow({ label, text }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: LANE_COLOR }}>{text}</span>
    </div>
  );
}

/** One upload under way: how far it has been sent, then "Getting it ready". */
function UploadProgress({ name, progress }) {
  const sending = progress != null;
  return (
    <div style={{ display: "grid", gap: 6, padding: "9px 11px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--paper)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-body)" }}>
        <Icon name="music" size={13} />
        <span style={{ flex: "1 1 0", width: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{name}</span>
        <span style={{ color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}>
          {sending ? `${Math.round(progress * 100)}%` : "Getting it ready…"}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}>
        <div
          className={sending ? undefined : "st-mup-wait"}
          style={{ height: "100%", borderRadius: 4, background: LANE_COLOR, width: sending ? `${Math.max(3, progress * 100)}%` : "100%", transition: "width 0.2s linear" }}
        />
      </div>
    </div>
  );
}

/** A small picture of the track: its loudest moments, as bars. */
function Waveform({ peaks = [], on }) {
  const bars = 24;
  const step = Math.max(1, Math.floor(peaks.length / bars));
  const vals = Array.from({ length: bars }, (_, i) => peaks[i * step] ?? 0);
  return (
    <span aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 1.5, height: 22, width: 56, flexShrink: 0, opacity: on ? 1 : 0.55 }}>
      {vals.map((v, i) => (
        <i key={i} style={{ flex: 1, height: `${Math.max(12, v)}%`, borderRadius: 2, background: on ? LANE_COLOR : "var(--line-strong)" }} />
      ))}
    </span>
  );
}

/** The music lane's colour (Timeline.js), so a track looks the same in both places. */
export const LANE_COLOR = "#2FA37E";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "");
