/**
 * voiceBuildRunner.js: run one voice analysis to its end, wherever it was asked for.
 *
 * ── WHY THIS IS A MODULE AND NOT A FUNCTION INSIDE A ROUTE ───────────────────
 * This lived in routes/profiles.js, which was correct while exactly one screen
 * could start an analysis. There are now two: a creator pressing "Analyse my
 * voice", and an admin building a showcase voice from a creator's public videos
 * for outreach (services/showcaseService.js).
 *
 * Those two must run the SAME analysis. Not a similar one, not a cheaper one
 * for the admin path: the same call, reading the same transcripts, asking the
 * same category-specific questions, computing the same measured metrics. The
 * whole value of a showcase is that the creator is looking at what the product
 * would really produce for them, so a showcase built by a reduced pipeline is
 * worse than no showcase at all, it is a demo of something we do not sell.
 *
 * Copying the function into the admin path would have made that true on the day
 * it was written and false the first time either copy was touched. So there is
 * one implementation and both callers import it.
 *
 * Everything below is the original, moved verbatim. No behaviour changed.
 *
 * ── NOTHING IN HERE MAY THROW ────────────────────────────────────────────────
 * It runs with no request behind it, so a rejection has nobody to report to and
 * would only leave `building` set, which is the one state that blocks the next
 * Analyse press.
 */
import VoiceProfile from "../models/VoiceProfile.js";
import { buildVoiceProfile } from "./voiceProfileService.js";
import { SHORT, LONG, LONG_MIN_VIDEOS } from "./voiceLanes.js";
import { publishUserEvent } from "./newsEvents.js";
import { refund } from "./creditsService.js";

/**
 * @param {string} userId            owner of the profile: a creator, or a showcase row
 * @param {ObjectId} profileObjectId the Profile being given a voice
 * @param {ObjectId} voiceId         its VoiceProfile row
 * @param {string} profileId         the same profile id as a string, for events
 * @param {number} charged           credits taken up front, refunded if it fails
 * @param {string} lane              SHORT or LONG
 */
export async function runVoiceBuild(userId, profileObjectId, voiceId, profileId, charged = 0, lane = SHORT) {
  try {
    const { built, profile: doc, reason } = await buildVoiceProfile(userId, profileObjectId, { lane });

    const buildError = built
      ? ""
      : reason === "no_transcripts"
        ? "None of the videos could be read. Check they are public and try again."
        : reason === "not_enough_long"
          ? `Only ${doc ? "" : ""}some of those long videos could be read. We need ${LONG_MIN_VIDEOS} readable long videos to learn your multi-story style.`
          : "Couldn't build this voice.";

    // Nothing was produced, so nothing is owed. The free-build counter is only
    // advanced on success (see buildVoiceProfile), so a refunded attempt does
    // not quietly use one up either.
    if (!built && charged > 0) {
      await refund(userId, charged, {
        refType: "VoiceProfile", refId: voiceId, note: "Voice analysis failed",
      }).catch(() => {});
    }

    await VoiceProfile.updateOne(
      { _id: voiceId },
      lane === LONG
        ? { $set: { "long.building": false, "long.build_error": buildError } }
        : { $set: { building: false, build_error: buildError } }
    );

    await publishUserEvent(built
      ? {
          type: "voice:built",
          user: userId,
          profile: profileId,
          // The facts the success dialog needs, so it can open on the event
          // instead of waiting a round trip for the refetch. What was LEARNED
          // is not here and never will be, see shapeProfile in routes/script.js.
          lane,
          transcript_count: (lane === LONG ? doc?.long?.transcript_count : doc?.transcript_count) || 0,
          language_label: doc?.language_label || "",
          confidence: (lane === LONG ? doc?.long?.confidence : doc?.confidence) || "",
        }
      : { type: "voice:failed", user: userId, profile: profileId, lane, message: buildError });

    return { built, reason };
  } catch (err) {
    console.error("[voice] build failed:", err.message);
    const message = err.userMessage || "Couldn't analyse this voice. Please try again.";
    if (charged > 0) {
      await refund(userId, charged, {
        refType: "VoiceProfile", refId: voiceId, note: "Voice analysis failed",
      }).catch(() => {});
    }
    await VoiceProfile.updateOne(
      { _id: voiceId },
      lane === LONG
        ? { $set: { "long.building": false, "long.build_error": message } }
        : { $set: { building: false, build_error: message } }
    ).catch(() => {});
    await publishUserEvent({ type: "voice:failed", user: userId, profile: profileId, lane, message })
      .catch(() => {});

    return { built: false, reason: "error" };
  }
}

export default { runVoiceBuild };
