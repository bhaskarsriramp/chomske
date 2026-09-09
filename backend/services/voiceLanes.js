/**
 * voiceLanes.js: one creator, two voices, because they genuinely have two.
 *
 * ── THE OBSERVATION THIS EXISTS FOR ──────────────────────────────────────────
 * A tech creator does not talk one way. They talk two ways, and the split is
 * almost exactly at the two minute mark:
 *
 *   Under two minutes  ONE product, start to finish. A hook, the thing itself,
 *                      a verdict. Dense, no navigation, because there is nowhere
 *                      to navigate to.
 *
 *   Over two minutes   SEVEN to FOURTEEN products, in sequence. Measured on real
 *                      channels: one Trakin Tech episode carried fourteen stories,
 *                      TechFacts runs eight to thirteen, and Prasadtechintelugu is
 *                      on episode 2243 of doing exactly this every day. The
 *                      defining skill is not the hook, it is the JOIN: how they
 *                      close item four and open item five without the video
 *                      feeling like a list being read out.
 *
 * Those joins do not exist in a Short. Not "are rare in", do not exist: there is
 * no second story to move to. So a voice profile learned from Shorts contains no
 * evidence whatsoever of how this person handles a transition, and asking it to
 * write an eight minute bulletin produces the same move fourteen times over.
 * That is the specific failure this file prevents, and it is a failure an
 * audience notices immediately, because the whole reason they watch this person
 * is the rhythm of it.
 *
 * ── WHY THE GATE ONLY POINTS ONE WAY ─────────────────────────────────────────
 * Long-form videos DO teach short-form voice. A bulletin still opens with their
 * opening, closes with their closing, and is full of their catchphrases; what it
 * adds is structure a Short does not need. The reverse is not true.
 *
 * So: writing long is gated on having long samples. Writing short never is.
 * All friction sits on one side, and it sits there for a reason we can state
 * plainly to the creator instead of an arbitrary tier.
 *
 * ── WHY THE SHORT LANE NEEDED NO MIGRATION ───────────────────────────────────
 * Until this file existed, routes/transcribe.js refused every video over ninety
 * seconds, so every voice profile ever built in this product was built from
 * short-form video. The existing top-level fields on VoiceProfile therefore ARE
 * the short lane, already correct, already populated. The long lane is added
 * beside them as a sub-document rather than by restructuring what works.
 *
 * That also survives every raise of the ceiling since: letting more in can only
 * add short-form video to a lane that already holds nothing else. The lane is
 * derived from duration on every read rather than stored on the row, so old
 * transcripts reclassify themselves correctly and no backfill is needed.
 */

/* ── The three numbers ──────────────────────────────────────────────────────── */

/**
 * The longest video that counts as short-form training material.
 *
 * ── WHY IT SITS ABOVE THE SCRIPT SPLIT ───────────────────────────────────────
 * Two and a half minutes, which is deliberately MORE than the two minutes the
 * short lane writes at. That looks like a mismatch and is not.
 *
 * What this number bounds is what we LEARN from, and what the split bounds is
 * what we PRODUCE. A single-subject video slightly longer than the longest
 * script we write still demonstrates exactly what the short lane needs: one
 * hook, one subject carried start to finish, one sign-off. Refusing it buys
 * nothing, and refusing it is what creators were actually running into, first
 * at ninety seconds and then at two.
 *
 * The real boundary this has to respect is the one below it, LONG_MIN_SECONDS.
 * A video only belongs in the long lane once it reliably contains more than one
 * story, and around two and a half minutes it still reliably does not, so this
 * is the last length that is unambiguously single-subject rather than the last
 * length we would write.
 */
export const SHORT_MAX_SECONDS = parseInt(process.env.VOICE_SHORT_MAX_SECONDS || "150", 10);

/**
 * The shortest video that counts as long-form training material.
 *
 * Three minutes, not two. The boundary that matters for SCRIPTS is two minutes
 * (below), but a video needs to be comfortably past it to actually contain the
 * thing we are trying to learn. A 2:10 video is usually still one topic, so it
 * teaches nothing about transitions while looking like it should. Three minutes
 * is the point where a tech video is reliably covering more than one thing.
 */
export const LONG_MIN_SECONDS = parseInt(process.env.VOICE_LONG_MIN_SECONDS || "180", 10);

/**
 * Which lane a SCRIPT of a given length is written from.
 *
 * Two minutes. Also, not coincidentally, DEEP_READ_FROM_SECONDS in
 * services/sourceMaterial.js: the length at which this product already decided
 * an order stops being one point and starts needing real material behind it.
 */
export const LANE_SPLIT_SECONDS = parseInt(process.env.VOICE_LANE_SPLIT_SECONDS || "120", 10);

/**
 * How many long videos before the long voice can be built at all.
 *
 * Three. One long video teaches one episode's running order, which a model will
 * happily mistake for a rule. Three is where a repeated habit separates from a
 * one-off, and it is still a small enough ask that a daily creator has three
 * from this week.
 */
export const LONG_MIN_VIDEOS = parseInt(process.env.VOICE_LONG_MIN_VIDEOS || "3", 10);

/** Lane ids, so nothing downstream invents a third one from a typo. */
export const SHORT = "short";
export const LONG = "long";
export const LANES = [SHORT, LONG];

/* ── Classifying ───────────────────────────────────────────────────────────── */

/**
 * Which lane a script of `seconds` is written from.
 *
 * Deliberately total: every duration maps to a lane, because the writer must
 * always have a voice to write in. The gate on whether that lane is READY is a
 * separate question, asked by laneReady() below.
 */
export function laneForScript(seconds) {
  return Number(seconds) >= LANE_SPLIT_SECONDS ? LONG : SHORT;
}

/**
 * Which lane a video of `duration` seconds trains, or null if it trains neither.
 *
 * ── WHY THERE IS STILL A GAP IN THE MIDDLE ──────────────────────────────────
 * 2:30 to 3:00 belongs to neither lane, and that is on purpose rather than an
 * oversight in the arithmetic. It is the one stretch where the answer genuinely
 * is not knowable from the length: a video in it might be one subject explored
 * slowly, or it might be the first two items of a roundup. Putting it in the
 * long lane on a guess would quietly poison that lane's training set with
 * material that never demonstrates the one thing that lane is for, and the long
 * lane is the whole reason this file exists.
 *
 * The gap used to be ninety seconds wide and creators hit it constantly. It is
 * now thirty seconds, 2:30 to 3:00, which is the genuinely ambiguous stretch:
 * long enough that it might be two stories, short enough that it might be one.
 * Everything outside it now lands somewhere.
 *
 * Callers turn null into an explicit refusal that names both bands, so a
 * creator is never left guessing which way to go.
 *
 * null duration means UNKNOWN (a live stream, a failed lookup) and is likewise
 * not eligible: see the fail-closed gate in routes/transcribe.js.
 */
export function laneForVideo(duration) {
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (d <= SHORT_MAX_SECONDS) return SHORT;
  if (d >= LONG_MIN_SECONDS) return LONG;
  return null;
}

/** The Mongo filter selecting one lane's training videos. Derived, never stored. */
export function laneQuery(lane) {
  return lane === LONG
    ? { duration_seconds: { $gte: LONG_MIN_SECONDS } }
    : { duration_seconds: { $gt: 0, $lte: SHORT_MAX_SECONDS } };
}

/* ── Reading a VoiceProfile ────────────────────────────────────────────────── */

/**
 * The voice block for one lane, in the shape scriptWriterService.js expects.
 *
 * The short lane is the document itself, for the backwards-compatibility reason
 * in the header. The long lane is the `long` sub-document. Both come back with
 * the same field names so the writer never branches on which one it got.
 *
 * ── LANGUAGE IS NEVER TAKEN FROM THE LONG BLOCK ALONE ───────────────────────
 * A creator speaks one language across both formats, and the short lane is the
 * one that is always present. Falling back for language and label specifically
 * means a long voice built before those fields were populated cannot hand the
 * writer an empty language, which is the one field that turns a good script
 * into an unusable one.
 */
export function voiceForLane(vp, lane) {
  if (!vp) return null;
  if (lane !== LONG) return vp;

  const raw = vp.long || null;
  if (!raw || !raw.built_at) return null;

  // ── toObject FIRST, ALWAYS ────────────────────────────────────────────────
  // `vp` is a hydrated document on the path that matters (voiceFor() does not
  // call .lean()), so `vp.long` is a Mongoose subdocument. Spreading one of
  // those copies its internals, not its schema fields: the result has no
  // style_brief, no sample_openings and no metrics, and the writer receives a
  // profile that is technically an object and contains nothing. That failure is
  // silent, and what it produces is a fluent script in a generic voice, which
  // is the exact outcome this whole file exists to prevent.
  const long = typeof raw.toObject === "function" ? raw.toObject() : raw;

  return {
    ...long,
    language: long.language || vp.language || "",
    language_label: long.language_label || vp.language_label || "",
    // Kept so callers that log or display the parent still work unchanged.
    _id: vp._id,
    user: vp.user,
    profile: vp.profile,
  };
}

/** Has this lane actually been analysed? A row existing is not an analysis. */
export function laneReady(vp, lane) {
  if (!vp) return false;
  return lane === LONG ? !!vp.long?.built_at : !!vp.built_at;
}

/**
 * Everything the UI needs to render the two lanes and explain what is missing.
 *
 * Built here rather than in the route so the "My Voice" panel, the script
 * ordering screen and the profile card cannot drift into three different
 * accounts of the same state, which is exactly how a user ends up being told
 * they can write an eight minute script and then refused one.
 *
 * @param {object} vp     VoiceProfile document (lean or hydrated)
 * @param {object} counts { short, long } eligible video counts for this profile
 */
export function laneStatus(vp, counts = {}) {
  const shortCount = Math.max(0, Number(counts.short) || 0);
  const longCount = Math.max(0, Number(counts.long) || 0);

  const shortReady = laneReady(vp, SHORT);
  const longReady = laneReady(vp, LONG);

  // The long lane stays locked until the short one is done, so a new creator
  // meets one task rather than two. It is also the honest order: the short
  // voice is what almost every first script needs.
  const longLocked = !shortReady;
  const longNeeds = Math.max(0, LONG_MIN_VIDEOS - longCount);

  return {
    split_seconds: LANE_SPLIT_SECONDS,
    short: {
      lane: SHORT,
      ready: shortReady,
      videos: shortCount,
      max_seconds: SHORT_MAX_SECONDS,
      built_at: vp?.built_at || null,
      confidence: vp?.confidence || "thin",
    },
    long: {
      lane: LONG,
      ready: longReady,
      videos: longCount,
      min_videos: LONG_MIN_VIDEOS,
      needs: longNeeds,
      min_seconds: LONG_MIN_SECONDS,
      locked: longLocked,
      can_build: !longLocked && longNeeds === 0,
      built_at: vp?.long?.built_at || null,
      confidence: vp?.long?.confidence || "thin",
    },
  };
}

/**
 * Can a script of this length be written right now, and if not, why not.
 *
 * The refusal is returned rather than thrown because the ordering screen asks
 * this on every drag of the duration slider, long before anything is bought.
 */
export function canWrite(vp, seconds) {
  const lane = laneForScript(seconds);
  if (laneReady(vp, lane)) return { ok: true, lane };

  if (lane === SHORT) {
    return {
      ok: false,
      lane,
      reason: "no_short_voice",
      message: "Add a short video and analyse your voice first. That's how we learn how you talk.",
    };
  }

  return {
    ok: false,
    lane,
    reason: laneReady(vp, SHORT) ? "no_long_voice" : "no_voice_at_all",
    message: laneReady(vp, SHORT)
      ? `Scripts over ${Math.round(LANE_SPLIT_SECONDS / 60)} minutes are multi-story, and we ` +
        `haven't learned how you move between stories yet. Add ${LONG_MIN_VIDEOS} of your ` +
        `longer videos (over ${Math.round(LONG_MIN_SECONDS / 60)} minutes) and run the long-form analysis.`
      : "Analyse your voice first, starting with your short videos.",
  };
}

export default {
  SHORT, LONG, LANES,
  SHORT_MAX_SECONDS, LONG_MIN_SECONDS, LANE_SPLIT_SECONDS, LONG_MIN_VIDEOS,
  laneForScript, laneForVideo, laneQuery,
  voiceForLane, laneReady, laneStatus, canWrite,
};
