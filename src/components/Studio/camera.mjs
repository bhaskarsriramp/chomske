/**
 * camera.mjs: where the camera is, and nowhere else.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * The same camera move is computed in three places. The editor draws it sixty
 * times a second in the browser; the server reads it to place the cursor, the
 * captions and the blur; and ffmpeg renders it from expression strings. Until
 * this file they were three separate implementations of the same arithmetic,
 * kept in step by hand and by comment ("Mirrors timeline.js zoomRect"), and
 * they had already drifted:
 *
 *   timeline.js  centred on frac(z.x + z.w/2, 0.5)   — out of range became 0.5
 *   model.js     centred on clamp(...0,1)            — out of range became 0 or 1
 *
 * Nobody had seen that yet because no zoom had been out of range. The point is
 * not that particular difference. It is that a preview which disagrees with the
 * export is the one bug a creator cannot work around, and a rule kept in two
 * files is a rule that will differ eventually.
 *
 * So: two of the three now import this. The third cannot — ffmpeg evaluates
 * strings, not JavaScript — and is instead CHECKED against it, numerically, at
 * a few hundred moments of a real timeline
 * (backend/scripts/pointerTest/camera.mjs). That is the only honest way to keep
 * a re-implementation in step.
 *
 * ── AND IT IS .mjs FOR A REASON ──────────────────────────────────────────────
 * The backend is `"type": "module"` and the app at the repo root is not, so a
 * plain .js file here would be read as CommonJS by node and its `export`
 * statements would be a syntax error. The extension settles it in both.
 */

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const frac = (v, d = 0) => clamp(num(v, d), 0, 1);

export const FULL = { x: 0, y: 0, w: 1, h: 1 };

/* ────────────────────────────────────────────────────────────────────────────
   The curves
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── NEVER LINEAR ─────────────────────────────────────────────────────────────
 * A linear zoom is the single clearest tell that a demo was made by a machine:
 * real camera moves accelerate and settle, and the eye reads a constant-rate
 * zoom as a glitch rather than as a move.
 */
export const EASE = {
  smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  snappy: (t) => 1 - Math.pow(1 - t, 4),
  slow: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  linear: (t) => t,
  /**
   * ── PUNCH: PAST THE MARK, THEN BACK TO IT ─────────────────────────────────
   * A camera operator pushing in on a button does not glide to a halt exactly
   * on it. The move carries a little past and settles back, and that tiny
   * correction is most of what makes a push-in read as a decision somebody made
   * rather than as a value being interpolated.
   *
   * This is easeOutBack. `PUNCH_BACK` sets how far past: at 0.9 the camera
   * reaches about five per cent tighter than the target before settling, which
   * is visible as life and not as a bounce. Past roughly fifteen per cent it
   * stops reading as a camera and starts reading as a spring.
   *
   * It overshoots, so `k` here exceeds 1 — lerpRect and clampRect both handle
   * that, and the crop floor in clampRect is what stops an extreme value from
   * cropping to nothing.
   */
  punch: (t) => {
    const c1 = PUNCH_BACK;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

const PUNCH_BACK = 0.9;

/**
 * The curve names a timeline may carry, DERIVED from the curves themselves.
 *
 * ── THIS WAS A HAND-WRITTEN LIST AND IT COST A FEATURE ───────────────────────
 * sanitizeTimeline() validates a zoom's easing against this and replaces
 * anything unrecognised with "smooth". The list lived in two files as a
 * literal, so adding `punch` to EASE did not add it here — and every click zoom
 * built with it was quietly turned back into a half-second glide on its way
 * through the sanitizer. The feature was written, tested at the camera layer,
 * and erased one function later, silently, because a validator's idea of what
 * exists disagreed with what existed.
 *
 * Derived, it cannot disagree again.
 */
export const EASINGS = Object.keys(EASE);

export const easeFn = (name) => EASE[name] || EASE.smooth;

/** How long a zoom takes to get in, and to come back out, per easing. */
export const RAMP = { smooth: 0.55, snappy: 0.32, slow: 0.9, linear: 0.5, punch: 0.26 };

/**
 * ── HOW LONG A CLICK ZOOM TAKES TO ARRIVE ────────────────────────────────────
 * 0.55s was the same number for every zoom, because there was only one number.
 * It is the right length for a slow reveal and about twice the right length for
 * a press: by the time the camera has settled the creator has already clicked,
 * and the viewer is watching the move rather than the thing that was pressed.
 *
 * A quarter of a second is what a hand-cut demo uses, and it is short enough
 * that `SETTLE` (0.3s, in events.js) still has the camera fully arrived before
 * the press lands. The punch curve is what keeps that from reading as a cut.
 */
export const RAMP_IN = 0.24;
/**
 * And coming out is a different move again — see rampsOf. Kept here beside the
 * one it pairs with rather than in events.js, where it used to live alone.
 */
export const RAMP_OUT = 0.42;

/* ────────────────────────────────────────────────────────────────────────────
   Where the pointer was
   ──────────────────────────────────────────────────────────────────────────── */

/** Longest gap in the track still worth interpolating across. */
export const GAP_HOLD = 0.2;
/** How far before the first sighting the pointer may still be drawn. */
export const EDGE_GRACE = 0.1;

/**
 * The path that gets drawn: the composed one when the creator asked for it, the
 * recovered one otherwise.
 *
 * ── WHY "recorded" IS THE DEFAULT ────────────────────────────────────────────
 * Both paths are kept on the timeline so the mode can be switched without
 * re-analysing. The composed path is the pointer tidied into what the creator
 * MEANT — overshoot removed, tremor smoothed, rests settled — and it is lovely
 * when the recovery was good and a confident lie when it was not. The recovered
 * path is what was actually seen. A demo whose drawn pointer is somewhere the
 * real one never went is worse than one whose pointer is a little untidy, so
 * the honest path is the default and the tidy one is asked for.
 */
export function drawnTrack(tl) {
  if (!tl || tl.cursor?.enabled === false) return null;
  const composed = tl.composed;
  if (tl.cursor?.mode === "intent" && composed && composed.length > 1) return composed;
  return tl.track || null;
}

/**
 * The pointer at a moment, from a track of sightings.
 *
 * ── THE TWO ENDS ARE NOT THE SAME QUESTION ───────────────────────────────────
 * This looks like an off-by-one and is the reason finished demos opened with
 * two pointers on screen.
 *
 * The tracker finds the pointer by differencing frames, so it cannot see one
 * that is not moving — and a demo begins with the pointer parked while the
 * creator gets ready. The first sample is therefore not "where the pointer
 * started". It is the first place it was seen MOVING, which is where it
 * ARRIVED. Holding it backwards asserts the pointer spent the opening of the
 * demo somewhere it had not reached yet, and on a real recording that put our
 * pointer on a sidebar item for five seconds while the one burnt into the video
 * sat two hundred and sixty pixels away. Two cursors, neither moving.
 *
 * The other end is the opposite case and holding IS right there: the tracker
 * stopped seeing the pointer because it stopped moving, so it is still where it
 * was last seen.
 *
 * ── AND IT SAYS WHETHER IT ACTUALLY SAW ANYTHING ─────────────────────────────
 * `held` is true wherever the answer is the last known position rather than a
 * sighting: past the end of the track, and across a gap. The drawn pointer does
 * not care — a held position is the best guess and the right thing to draw —
 * but the CAMERA does. A following shot that treats a held position as a
 * sighting keeps aiming at it, and then snaps when the track resumes somewhere
 * else. See zoomRect, which freezes instead.
 */
export function cursorAt(track, t) {
  if (!track?.length) return null;
  const first = track[0];
  const last = track[track.length - 1];

  if (t < first.t - EDGE_GRACE) return null;
  if (t <= first.t) return { x: first.x, y: first.y, shape: first.shape || "default", held: t < first.t, blind: Math.max(0, first.t - t), since: Infinity };
  if (t >= last.t) return { x: last.x, y: last.y, shape: last.shape || "default", held: t > last.t, blind: Math.max(0, t - last.t), since: Infinity };

  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const span = b.t - a.t;

  /**
   * ── A LONG GAP IS HELD, NOT CROSSED ────────────────────────────────────────
   * The tracker reports nothing while the screen is repainting, which is
   * exactly what a page navigation is. That leaves a hole in the track, and
   * interpolating across it draws the pointer gliding in a straight line from
   * wherever it was to wherever it turns up next — usually right through the
   * middle of the picture, while the real pointer burnt into the frames sat
   * perfectly still on the link that was clicked. Two pointers, moving apart.
   *
   * Nobody knows where the pointer was during the hole. But the overwhelmingly
   * common case is that it did not move: you click, the page loads, your hand
   * stays put. So a gap longer than one dropped sample holds the last known
   * position and snaps at the far end, where there is evidence again.
   */
  if (span > GAP_HOLD) {
    const near = t - a.t <= span / 2 ? a : b;
    // How long it has been since anything was actually SEEN. The camera reads
    // this to come back gently rather than snapping — see zoomRect.
    return { x: near.x, y: near.y, shape: near.shape || "default", held: true, blind: t - a.t, since: 0 };
  }

  const k = span > 0 ? (t - a.t) / span : 0;
  /**
   * ── AND HOW RECENTLY THE POINTER CAME BACK ────────────────────────────────
   * `blind` says the pointer is missing NOW, which is zero the instant a
   * sighting arrives — so it cannot damp the moment that actually needs it,
   * which is the first frame after a gap, where the new position may be most of
   * a screen from where the camera has been pointing. This is the other half:
   * seconds since the track resumed, counting only gaps long enough to have
   * been a freeze. Infinite when there has been no recent gap, which is nearly
   * always, and which costs the follow nothing.
   */
  const gapBefore = lo > 0 ? a.t - track[lo - 1].t : 0;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    since: gapBefore > GAP_HOLD ? t - a.t : Infinity,
    // The shape is what it was at the last sample, never blended: a pointer is
    // an arrow or a hand, and half of each is not a thing.
    shape: a.shape || "default",
    held: false,
    blind: 0,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Framing
   ──────────────────────────────────────────────────────────────────────────── */

/** Keeps the camera inside the frame: a crop that hangs off the edge is black. */
export function clampRect(r) {
  const w = clamp(num(r.w, 1), 0.05, 1);
  const h = clamp(num(r.h, 1), 0.05, 1);
  return {
    x: clamp(num(r.x), 0, 1 - w),
    y: clamp(num(r.y), 0, 1 - h),
    w,
    h,
  };
}

export function lerpRect(a, b, k) {
  return clampRect({
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    w: a.w + (b.w - a.w) * k,
    h: a.h + (b.h - a.h) * k,
  });
}

/**
 * How far from the edge the camera starts to resist, as a fraction of the frame.
 *
 * ── THE CAMERA USED TO STOP DEAD ─────────────────────────────────────────────
 * clampRect guarantees the crop stays on the picture, and on its own that is a
 * hard wall: a following camera tracking a pointer toward the edge of the
 * screen moves at full speed and then, in one frame, does not move at all. The
 * viewer reads the stop, not the edge, and on a demo of anything with a
 * left-hand rail — which is most software — it happens on nearly every move.
 *
 * So the last sliver of travel is compressed instead. `soften` is linear
 * through the middle of the legal range and eases asymptotically into its
 * limits, with slope 1 at the handover, so there is no corner where the
 * behaviour changes. The hard clamp stays underneath as the guarantee.
 */
const EDGE_SOFT = 0.06;

export function soften(v, lo, hi, soft = EDGE_SOFT) {
  if (!(hi > lo)) return (lo + hi) / 2;
  const s = Math.min(soft, (hi - lo) / 2);
  if (s <= 0) return clamp(v, lo, hi);
  if (v > lo + s && v < hi - s) return v;
  if (v <= lo + s) return lo + s - s * (1 - Math.exp(-((lo + s) - v) / s));
  return hi - s + s * (1 - Math.exp(-(v - (hi - s)) / s));
}

/**
 * How far the pointer may wander before a following camera answers it.
 *
 * ── A TREMOR AT 1.0x IS A WHIP PAN AT 2.5x ───────────────────────────────────
 * Measured in units of the VISIBLE rect rather than of the frame, which is the
 * whole point: the follow camera used to answer every sample, and a hand
 * resting on a mouse moves two or three pixels continuously. At full frame that
 * is invisible. Inside a shot holding a third of the picture it is the camera
 * drifting the entire time the creator is talking.
 *
 * Only the travel BEYOND the dead zone is answered, so the camera does not jump
 * the moment the pointer crosses the boundary.
 */
const DEAD_ZONE = 0.12;

/**
 * How far back the camera looks when deciding where the pointer IS.
 *
 * ── A CAMERA AIMED AT ONE SAMPLE IS AIMED AT A JUMP ──────────────────────────
 * A hand moving quickly covers a third of the screen between two sightings, so
 * following the newest sample means the frame is repeatedly told to be
 * somewhere it is not yet — and the result is the camera arriving in a series
 * of lurches, one per sample, rather than travelling.
 *
 * The fix is not to interpolate harder. It is to aim at the TRAJECTORY: a
 * weighted average over the last fraction of a second, newest samples counting
 * most. Fast travel then reads as one continuous move, a rest reads as a rest
 * because every sample in the window agrees, and a single spurious sighting —
 * the difference tracker briefly preferring a spinner — is outvoted by its
 * neighbours instead of yanking the frame.
 *
 * A fifth of a second is roughly five samples at the rate the tracker reports,
 * and it is short enough that the camera is never visibly behind the pointer.
 */
const TRAIL = 0.2;

/**
 * And how long the camera takes to trust the pointer again after losing it.
 *
 * ── COMING BACK IS A MOVE, NOT A CUT ─────────────────────────────────────────
 * The freeze above is right and it has an ugly ending: the moment a sighting
 * arrives the camera is handed a position that may be most of a screen away
 * from where it has been pointing, and it snaps there in one frame. The gap is
 * invisible; the snap at the end of it is the thing the viewer notices.
 *
 * So the response is ramped back in over this long — proportionally to how long
 * the pointer was missing, because a dropped frame needs no ceremony and a
 * three-second navigation does. It is a damping factor and not a delay: the
 * camera starts moving immediately, just not at full speed.
 */
const REACQUIRE = 0.6;

/**
 * The pointer's trajectory at a moment, rather than its latest sighting.
 *
 * Returns the same shape cursorAt does, so the follow path can use either.
 * `blind` and `held` come from the sample at `t` itself — smoothing is about
 * WHERE the pointer is, and must not be allowed to invent evidence that it was
 * seen.
 */
export function trailAt(track, t, window = TRAIL) {
  const now = cursorAt(track, t);
  if (!now || !track?.length) return now;

  let wx = 0;
  let wy = 0;
  let wsum = 0;
  for (let i = track.length - 1; i >= 0; i--) {
    const p = track[i];
    const age = t - num(p.t);
    if (age < 0) continue;
    if (age > window) break;
    // Linear falloff: the newest sample counts fully, one a window old counts
    // for nothing. Anything fancier is unmeasurable at five samples.
    const w = 1 - age / window;
    wx += num(p.x, now.x) * w;
    wy += num(p.y, now.y) * w;
    wsum += w;
  }
  if (wsum <= 0) return now;
  return { ...now, x: wx / wsum, y: wy / wsum };
}

/* ────────────────────────────────────────────────────────────────────────────
   One zoom
   ──────────────────────────────────────────────────────────────────────────── */

/** Zooms that are real: inside the recording, with a positive length. */
export function activeZooms(tl) {
  const total = num(tl?.duration);
  return (tl?.zooms || [])
    .map((z) => ({ ...z, start: clamp(num(z.start), 0, total), end: clamp(num(z.end), 0, total) }))
    .filter((z) => z.end - z.start > 0.05)
    .sort((a, b) => a.start - b.start);
}

/**
 * A zoom's two ramps, which are NOT the same length.
 *
 * ── GOING IN AND COMING OUT ARE DIFFERENT MOVES ──────────────────────────────
 * A zoom onto a button has to arrive gently: the viewer is being asked to look
 * somewhere, and a hard push-in reads as a jump cut. Coming out is the
 * opposite. The click has happened, the screen has changed underneath, and what
 * the viewer needs is the whole page NOW. Easing out over half a second means
 * half a second of watching a crop of a page that has already moved on, and it
 * is the single thing that makes an automatic edit feel laggy.
 */
export function rampsOf(z) {
  const base = RAMP[z?.easing] || RAMP.smooth;
  /**
   * `== null` and not Number.isFinite(Number(v)): Number(null) is 0, which IS
   * finite, so the obvious version silently turned every unset ramp into the
   * 0.05s minimum. The symptom was a zoom that jumped from 1x to 2x inside a
   * frame and a half — the exact opposite of the eased approach this file
   * exists to guarantee.
   */
  const given = (v) => v != null && v !== "" && Number.isFinite(Number(v));
  return {
    in: given(z?.ramp_in) ? clamp(Number(z.ramp_in), 0.05, 2) : base,
    out: given(z?.ramp_out) ? clamp(Number(z.ramp_out), 0.05, 2) : base,
    easeIn: EASE[z?.easing] ? z.easing : "smooth",
    easeOut: EASE[z?.ease_out] ? z.ease_out : EASE[z?.easing] ? z.easing : "smooth",
  };
}

/**
 * The rect one zoom is holding at time t.
 *
 * A following zoom re-centres on the pointer as it moves, which is what makes a
 * scroll or a drag readable; it is damped so the frame does not chase every
 * tremor, and clamped so the camera never leaves the picture.
 */
export function zoomRect(z, tl, t, track) {
  const level = Math.max(1, num(z.level, 1.6));
  /**
   * ── THE RECT WINS WHEN IT IS WIDER THAN THE LEVEL ─────────────────────────
   * The frame used to be sized from `level` alone and the zoom's own rectangle
   * was used only for its centre. But a rectangle is not decoration: a zoom
   * built from several clicks is sized by events.js containing() so that every
   * one of those clicks is inside the frame when it happens. Throwing that size
   * away and cropping to 1/level put the clicks back outside — the exact fault
   * that shipped a demo where nothing could be seen being pressed.
   *
   * So `level` is the intent and the rectangle is the floor. A zoom never crops
   * tighter than the thing it was built to show.
   */
  const need = Math.max(num(z.w, 0), num(z.h, 0));
  const w = clamp(Math.max(1 / level, need), 0.05, 1);
  const h = w;

  let cx = frac(num(z.x) + num(z.w) / 2, 0.5);
  let cy = frac(num(z.y) + num(z.h) / 2, 0.5);

  if (z.follow && track?.length) {
    // The trajectory, not the newest sighting. See trailAt.
    const p = trailAt(track, t);
    /**
     * ── A POSITION NOBODY SAW IS NOT A PLACE TO AIM ───────────────────────────
     * `held` means the track has no sighting here: the pointer stopped moving
     * and the difference tracker went blind, or the screen repainted and the
     * locator lost it. On one real Windows recording the locator found the
     * pointer in 306 frames of 756 — forty per cent — so this is not a rare
     * state, it is most of a demo.
     *
     * The drawn pointer is right to use the held position; it is the best guess
     * and the alternative is drawing nothing. The camera is not. A camera that
     * follows a held position aims at a stale point for as long as the gap
     * lasts and then SNAPS when the track resumes somewhere else, which the
     * viewer reads as the camera being yanked. Freezing costs nothing: the
     * pointer is not known to have moved, so neither should the shot.
     */
    if (p && !p.held) {
      // Damped toward the pointer rather than locked to it: at 1.0 the frame is
      // rigidly attached to the mouse and every small correction becomes a whip
      // pan across the screen.
      /**
       * ── AND COMING BACK FROM A FREEZE IS DAMPED ──────────────────────────
       * `since` is how long ago the track resumed after a freeze. On that first
       * frame the new sighting may be most of a screen from where the camera
       * has been pointing, and answering it in full is exactly the snap the
       * freeze was meant to avoid. The response starts at a sixth and recovers
       * over REACQUIRE. A gap too short to have frozen the camera reports
       * Infinity here and is unaffected.
       */
      const back = clamp(num(p.since, Infinity) / REACQUIRE, 0.15, 1);
      const k = clamp(num(z.follow_strength, 0.7), 0, 1) * back;
      const d = Math.hypot((num(p.x, cx) - cx) / w, (num(p.y, cy) - cy) / h);
      if (d > DEAD_ZONE) {
        // Only the travel past the dead zone is answered, so crossing the
        // boundary is not a step.
        const past = ((d - DEAD_ZONE) / d) * k;
        cx += (num(p.x, cx) - cx) * past;
        cy += (num(p.y, cy) - cy) * past;
      }
    }
  }

  // Resist the edge, then clamp to it. The first is how it looks; the second is
  // the guarantee that the crop is never off the picture.
  return clampRect({
    x: soften(cx, w / 2, 1 - w / 2) - w / 2,
    y: soften(cy, h / 2, 1 - h / 2) - h / 2,
    w,
    h,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   The camera
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * How many zooms deep a blend may look back. After restToFull() there is at
 * most one other move anywhere near, so this is a guard against a pathological
 * timeline rather than a tuning knob.
 */
const BLEND_DEPTH = 3;

/**
 * The camera rect at a moment of the RECORDING: which part of the source frame
 * fills the output, as fractions.
 *
 * ── A NEW MOVE STARTS FROM WHERE THE CAMERA IS ───────────────────────────────
 * This used to ramp every zoom in from the FULL FRAME, unconditionally. When
 * two moves were close enough to overlap — which happens whenever the editor
 * lets somebody drag one, and whenever the audit adds one next to an existing
 * shot — the camera pulled all the way out and dived straight back in:
 *
 *     "why are you zooming in or zooming out or adjusting on a single zoom ...
 *      whenever a user clicks at a particular point, you can take it as a
 *      single zoom"
 *
 * Now the ramp starts from wherever the camera actually was when this move
 * began. The previous shot is sampled ONCE, at that instant, and held — not
 * followed. Two cameras interpolating toward each other is a crossfade between
 * two moving crops, and that reads as a wobble, which is the reason the old
 * comment gave for refusing to blend at all. Sampling it once is a starting
 * point, not a second camera.
 *
 * With no previous shot in range the sample is the full frame, which is exactly
 * what it did before — so every demo with well-separated zooms comes out
 * unchanged.
 */
export function cameraAt(tl, t, { track = null } = {}) {
  const zooms = activeZooms(tl);
  if (!zooms.length) return { ...FULL };
  return rectUnder(zooms, zooms.length - 1, tl, t, track, 0);
}

function rectUnder(zooms, upto, tl, t, track, depth) {
  let idx = -1;
  for (let j = 0; j <= upto; j++) {
    const r = rampsOf(zooms[j]);
    if (t >= zooms[j].start - r.in && t <= zooms[j].end + r.out) idx = j;
  }
  if (idx < 0) return { ...FULL };

  const z = zooms[idx];
  const r = rampsOf(z);
  const target = zoomRect(z, tl, t, track);

  if (t < z.start) {
    const k = easeFn(r.easeIn)(clamp((t - (z.start - r.in)) / r.in, 0, 1));
    const from =
      depth < BLEND_DEPTH
        ? rectUnder(zooms, idx - 1, tl, z.start - r.in, track, depth + 1)
        : { ...FULL };
    return lerpRect(from, target, k);
  }
  if (t > z.end) {
    const k = easeFn(r.easeOut)(clamp((t - z.end) / r.out, 0, 1));
    return lerpRect(target, FULL, k);
  }
  return target;
}

/**
 * A point of the SOURCE frame, as a point of the OUTPUT frame, under the camera.
 * Everything drawn on top (cursor, annotations, blur) goes through this, so a
 * zoom moves the pointer and the arrow pointing at it by exactly the same amount.
 */
export function project(pt, cam) {
  return {
    x: (pt.x - cam.x) / cam.w,
    y: (pt.y - cam.y) / cam.h,
    scale: 1 / cam.w,
  };
}

export const CAMERA_TUNING = { PUNCH_BACK, EDGE_SOFT, DEAD_ZONE, BLEND_DEPTH };
