/**
 * musicTimeline.mjs: the rules for music on the timeline, shared by the music
 * lane (Timeline.js), the Music tab (MusicPanel.js) and the preview.
 *
 * ── MUSIC LIVES IN THE FINISHED VIDEO'S TIME ─────────────────────────────────
 * Every other lane stores recording time and is mapped through the cuts.
 * Music is the exception (backend timeline.js, render/compose.js): `start` is
 * seconds into the finished video, so cutting a stretch of the recording never
 * makes a song jump. An item plays `duration` seconds, from `in` seconds into
 * its track, looping when the track runs out (unless `loop` is off).
 *
 * Tracks on the lane do not overlap: two songs at once is a mistake, not a
 * mix. A new track fills the free stretch it is put in, up to the next track
 * or the end of the video.
 */
// With its extension: webpack (the CRA build) requires one in a .mjs file.
import { newId } from "./model.js";

/** At most this many tracks on one video (backend timeline.js keeps 8). */
export const MUSIC_MAX = 8;
/** The shortest stretch a track is worth adding into. */
export const MUSIC_MIN = 1;
/** Where a new track starts: low enough to sit under a voice. */
export const MUSIC_VOLUME = 0.35;

export const musicItems = (tl) => tl?.audio?.music || [];
export const musicEnd = (m) => m.start + m.duration;

/**
 * The free stretch a new track put at `t` would fill: from `t`, or from the
 * end of the track `t` falls on, to the next track or the end of the video.
 * Null when there is less than MUSIC_MIN of room there.
 */
export function roomAt(tl, t, total) {
  const items = [...musicItems(tl)].sort((a, b) => a.start - b.start);
  let start = Math.max(0, t);
  for (const m of items) if (start >= m.start - 0.001 && start < musicEnd(m)) start = musicEnd(m);
  let end = total;
  for (const m of items) if (m.start >= start && m.start < end) end = m.start;
  return end - start >= MUSIC_MIN ? { start, end } : null;
}

/** A new item for `track`, filling `room`. */
export function newMusic(track, room) {
  return {
    id: newId("m"),
    media: track.id,
    start: round3(room.start),
    in: 0,
    duration: round3(room.end - room.start),
    volume: MUSIC_VOLUME,
    fade_in: 1,
    fade_out: 2,
    muted: false,
    duck: true,
    loop: true,
  };
}

/** The audio object with its music list replaced. */
export const withMusic = (tl, music) => ({ ...(tl?.audio || { voice: 1 }), music });

// How the lane is heard (fades, the blend between touching tracks, where in
// its file a track is) is in musicMix.mjs, shared with the export.
export { fadeAt, trackTimeAt, musicPlan, gainAt } from "./musicMix.mjs";

const round3 = (v) => Math.round(v * 1000) / 1000;
