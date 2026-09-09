/**
 * backfillPhraseDocs.js: work out how often each creator ACTUALLY says the
 * phrases stored in their voice profile, for profiles built before we counted.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The voice analysis returns arrays of verbatim phrases and never said how
 * often any of them occurred. The writer therefore treated a sign-off used in
 * every video and a reaction used once as equally characteristic, and used both
 * in every script. Measured on a live profile: a line said in ONE of four
 * videos appeared in FOUR of four generated scripts.
 *
 * services/voiceProfileService.js now records the counts at build time. This
 * fills them in for every profile built before that, which is all of them.
 *
 * ── WHY IT IS SAFE TO RUN ───────────────────────────────────────────────────
 * It calls no model and costs nothing: the phrases are already stored, the
 * transcripts are already stored, and this is a substring count between them.
 * It writes exactly one new field, `phrase_docs`, and touches nothing else, so
 * it cannot degrade a voice. Re-running it is harmless.
 *
 * A phrase is counted by plain substring match in whatever script the creator
 * speaks, so this behaves identically for Hindi, Tamil, Telugu, Bengali or
 * English. There is no tokenisation or word list to get wrong.
 *
 *   node scripts/backfillPhraseDocs.js           # dry run, prints what it would do
 *   node scripts/backfillPhraseDocs.js --apply   # writes
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import VoiceProfile from "../models/VoiceProfile.js";
import Transcript from "../models/Transcript.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");

/**
 * The fields where repeating a phrase too often is a DEFECT.
 *
 * Deliberately narrow, and it must stay that way. Most of a profile is
 * structural, particles, register markers, on-screen cues, story transitions,
 * sign-offs, and all of those are supposed to recur; counting them here would
 * arm a rule that rations the very things the writer is elsewhere pushed to use
 * more of. What breaks a creator's voice is an EXPRESSIVE line, a strong
 * reaction or a vivid image, turning into a tic.
 */
const TOP_FIELDS = ["signature_phrases"];
const CAT_FIELDS = ["reaction_beats", "native_metaphor", "viewer_advice", "verdict_vocabulary"];

function countFor(node, texts) {
  const out = {};
  const tally = (phrase) => {
    const p = String(phrase || "").trim();
    if (p.length < 3 || out[p] !== undefined) return;
    out[p] = texts.filter((t) => t.includes(p)).length;
  };
  for (const f of TOP_FIELDS) for (const v of node?.[f] || []) tally(v);
  const cv = node?.category_voice || {};
  for (const f of CAT_FIELDS) {
    const v = cv[f];
    if (Array.isArray(v)) v.forEach(tally);
    else if (typeof v === "string") tally(v);
  }
  return out;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log(APPLY ? "APPLYING\n" : "DRY RUN, nothing will be written. Use --apply to write.\n");

  const voices = await VoiceProfile.find({}).lean();
  let written = 0;
  let oneOffTotal = 0;

  for (const v of voices) {
    // Scoped to the channel, matching how the transcripts were collected.
    const tx = await Transcript.find({ profile: v.profile }).select("text").lean();
    const texts = tx.map((t) => String(t.text || "")).filter(Boolean);
    if (!texts.length) continue;

    const set = {};
    const short = countFor(v, texts);
    if (Object.keys(short).length) set.phrase_docs = short;

    // The long lane holds its own phrases, learned from different videos.
    if (v.long?.built_at) {
      const longCounts = countFor(v.long, texts);
      if (Object.keys(longCounts).length) set["long.phrase_docs"] = longCounts;
    }
    if (!Object.keys(set).length) continue;

    const oneOffs = Object.entries(short).filter(([, n]) => n <= 1);
    // Only meaningful with enough videos to tell a one-off from a habit; the
    // writer applies the same floor before acting on any of this.
    const judgeable = texts.length >= 3;
    if (judgeable) oneOffTotal += oneOffs.length;

    console.log(
      `profile ${v.profile}  ${texts.length} video(s)  ` +
      `${Object.keys(short).length} phrase(s)  ` +
      `${judgeable ? `${oneOffs.length} said once` : "too few videos to judge"}`
    );
    for (const [p, n] of oneOffs.slice(0, 5)) {
      if (judgeable) console.log(`    said ${n}x: "${p.slice(0, 60)}"`);
    }

    if (APPLY) {
      await VoiceProfile.updateOne({ _id: v._id }, { $set: set });
      written++;
    }
  }

  console.log(
    `\n${voices.length} voice profile(s) examined, ${oneOffTotal} one-off phrase(s) found` +
    (APPLY ? `, ${written} updated.` : `. Re-run with --apply to write.`)
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
