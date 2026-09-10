/**
 * showcaseService.js: a voice built for somebody who has not signed up yet.
 *
 * ── WHAT A SHOWCASE IS ───────────────────────────────────────────────────────
 * An admin picks a real creator, pastes up to five of their public videos, and
 * we run the ordinary voice analysis over them. That produces a private page,
 * reachable only by an unguessable link, which we email to that creator: their
 * own voice, measured, writing today's news in their style, before they have
 * given us anything.
 *
 * ── THE ANALYSIS IS NOT A DEMO VERSION OF THE ANALYSIS ───────────────────────
 * Everything here funnels into runVoiceBuild(), the same function the "Analyse
 * my voice" button calls, which calls the same buildVoiceProfile(): the same
 * sampled transcripts, the same category questions from services/categories.js,
 * the same counted metrics from services/voiceMetrics.js. Nothing is skipped
 * and nothing is cheapened because an admin started it instead of a creator.
 *
 * That is not an implementation detail, it is the entire premise. The page is
 * persuasive only because it shows what this creator would actually receive. A
 * showcase built from a reduced pipeline would be a demo of a product we do not
 * sell, and the first thing they would notice after signing up is that the real
 * thing is different.
 *
 * ── WHY IT IS A User ROW ─────────────────────────────────────────────────────
 * See models/User.js. Every downstream service is scoped by `user`, so a
 * showcase that IS a user gets the feed, the wallet, Transcript, VoiceProfile
 * and the whole script pipeline for free, with no forked code to maintain.
 *
 * ── AND WHY IT IS NEVER PUBLIC ───────────────────────────────────────────────
 * The page carries a real person's name and quotes their own sentences back at
 * them. Shown to that person privately, that is a courtesy. Published, it is
 * commercial use of their identity that they never agreed to. routes/showcase.js
 * sends noindex headers for exactly this reason, and `active` is the switch that
 * ends it the moment anyone asks.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import Transcript from "../models/Transcript.js";
import VoiceProfile from "../models/VoiceProfile.js";
import ShowcaseVisit from "../models/ShowcaseVisit.js";
import { parseYouTubeUrl } from "../utils/youtube.js";
import { getYouTubeVideoDetails } from "./apidirectClient.js";
import { laneForVideo, SHORT, SHORT_MAX_SECONDS } from "./voiceLanes.js";
import { ensureProfile } from "./profileService.js";
import { runVoiceBuild } from "./voiceBuildRunner.js";
import { grant } from "./creditsService.js";
import { DEFAULT_CATEGORY } from "./categories.js";

/**
 * How many credits ride on one link. ONE HUNDRED, PER LINK, NOT PER VISITOR.
 *
 * Deliberate, and the difference matters. Per-visitor would mean the cost of a
 * link is unbounded: forwarded once into a group chat, it prints scripts until
 * somebody notices. Per-link means the worst case for an outreach campaign is
 * exactly the number of links sent multiplied by this, which is a number that
 * can be budgeted before a single email goes out.
 *
 * The trade is real and accepted: if the link travels and strangers spend it,
 * the creator it was written for opens an empty demo. What makes that unlikely
 * is that the slug is unguessable and the link is sent to one person; what
 * makes it survivable is that an admin can top the same link up in one click.
 */
export const SHOWCASE_CREDITS = parseInt(process.env.SHOWCASE_CREDITS || "100", 10);

/** Same ceiling as a creator's own voice. Five is plenty of signal. */
export const SHOWCASE_MAX_VIDEOS = parseInt(process.env.SHOWCASE_MAX_VIDEOS || "5", 10);

/**
 * Slug length. Eight base62 characters is 2.2e14 combinations, which is not
 * guessable at any rate a rate limiter would allow, and still short enough that
 * the whole URL fits comfortably in an email sentence.
 */
const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_LENGTH = 8;

/**
 * A slug nobody can guess and nobody will mistype.
 *
 * The alphabet omits l, I, 1, 0, O on purpose. These get read off a screen and
 * typed by hand often enough that the ambiguous pairs are worth the small loss
 * of entropy, and a creator who mistypes the link concludes it is broken.
 */
export function newSlug() {
  const bytes = crypto.randomBytes(SLUG_LENGTH * 2);
  let out = "";
  for (let i = 0; out.length < SLUG_LENGTH && i < bytes.length; i++) {
    const n = bytes[i];
    // Rejection sampling: taking n % len would make the first few characters
    // fractionally likelier, which is a needless bias in a credential.
    if (n < 256 - (256 % SLUG_ALPHABET.length)) out += SLUG_ALPHABET[n % SLUG_ALPHABET.length];
  }
  return out.length === SLUG_LENGTH ? out : newSlug();
}

/** The link an admin copies. Absolute, because it goes into an email. */
export function shareUrl(slug) {
  const base = (process.env.PUBLIC_APP_URL || "https://trylipi.online").replace(/\/+$/, "");
  return `${base}/v/${slug}`;
}

/* ── Creating one ─────────────────────────────────────────────────────────── */

/**
 * Validate and price up a list of URLs before anything is written.
 *
 * Runs the cheap metadata lookup (about half a cent each) and the same length
 * gate routes/transcribe.js applies, so a video that would be refused later is
 * refused now, while the admin is still looking at the form.
 *
 * @returns {{ ok: Array, rejected: Array }}
 */
export async function inspectUrls(urls = []) {
  const ok = [];
  const rejected = [];
  const seen = new Set();

  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url) continue;

    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      rejected.push({ url, reason: "That doesn't look like a YouTube link." });
      continue;
    }
    if (seen.has(parsed.videoId)) {
      rejected.push({ url, reason: "Same video listed twice." });
      continue;
    }
    seen.add(parsed.videoId);

    let details = null;
    try {
      // Takes the canonical watch URL, not the bare id. Same call
      // routes/transcribe.js makes, so the cost and the answer are identical.
      details = await getYouTubeVideoDetails(parsed.url);
    } catch {
      rejected.push({ url, reason: "Couldn't look that video up. Is it public?" });
      continue;
    }
    if (!details) {
      rejected.push({ url, reason: "Couldn't look that video up. Is it public?" });
      continue;
    }

    const secs = Number(details.duration);
    if (!Number.isFinite(secs) || secs <= 0) {
      // null means UNKNOWN, which apidirect returns for live streams. Treating
      // it as 0 would slip a stream past a "under three minutes" check.
      rejected.push({ url, reason: "Couldn't read that video's length. It may be a live stream." });
      continue;
    }

    // A showcase is a short-form demo. The long lane needs three long videos of
    // its own and teaches a different thing entirely (see voiceLanes.js); an
    // outreach page does not need it and should not pay for it.
    if (laneForVideo(secs) !== SHORT) {
      rejected.push({
        url,
        reason: `Too long for a showcase. Use videos under ${Math.round(SHORT_MAX_SECONDS / 60)} minutes.`,
      });
      continue;
    }

    ok.push({ url: parsed.url, video_id: parsed.videoId, details, duration_seconds: secs });
  }

  return { ok, rejected };
}

/**
 * Create the showcase, its profile, and its pending video rows.
 *
 * Does NOT read the videos. Same rule as a creator's own: adding is cheap
 * (metadata only), and Gemini is not called until somebody asks for the
 * analysis, which here is the admin pressing Build.
 */
export async function createShowcase({ adminId, displayName, urls = [], notes = "" }) {
  const name = String(displayName || "").trim();
  if (!name) throw Object.assign(new Error("no name"), { userMessage: "Give this showcase a name." });

  const list = urls.slice(0, SHOWCASE_MAX_VIDEOS);
  const { ok, rejected } = await inspectUrls(list);
  if (!ok.length) {
    throw Object.assign(new Error("no usable urls"), {
      userMessage: rejected[0]?.reason || "None of those videos can be used.",
      rejected,
    });
  }

  const now = new Date();
  const slug = newSlug();

  const showcase = await User.create({
    kind: "showcase",
    name,
    // Not a real inbox, and never emailed. Present because too much of the app
    // assumes a user has one; unique so two showcases cannot collide.
    email: `showcase+${slug}@trylipi.invalid`,
    // The showcase sees the same feed a new creator sees.
    categories: [DEFAULT_CATEGORY],
    onboarded_at: now,
    showcase: {
      display_name: name,
      slug,
      created_by: adminId,
      active: true,
      notes: String(notes || "").slice(0, 2000),
    },
  });

  // The same container a real creator gets: its categories, its videos, its
  // scripts and its one voice. ensureProfile returns the Profile itself.
  const profile = await ensureProfile(showcase._id);
  await Profile.updateOne({ _id: profile._id }, { $set: { name } }).catch(() => {});

  // Pending rows, with the same field mapping routes/transcribe.js uses: the
  // metadata call answers `duration`, `author` and `date`, and the Transcript
  // schema calls those duration_seconds, channel and published_at.
  for (const v of ok) {
    const d = v.details || {};
    const published = d.date ? new Date(d.date) : null;
    await Transcript.create({
      user: showcase._id,
      profile: profile._id,
      video_id: v.video_id,
      url: v.url,
      status: "pending",
      title: d.title || "",
      duration_seconds: v.duration_seconds,
      channel: d.author || "",
      channel_id: d.channel_id || "",
      thumbnail: d.thumbnail || "",
      description: d.description || "",
      views: Number.isFinite(Number(d.views)) ? Number(d.views) : null,
      category: d.category || "",
      keywords: d.keywords || [],
      published_at: published && !Number.isNaN(published.getTime()) ? published : null,
    }).catch(() => {});
  }

  // The link's whole budget, granted once, at creation.
  await grant(showcase._id, SHOWCASE_CREDITS, {
    reason: "showcase",
    refType: "User",
    refId: showcase._id,
    note: `Showcase link for ${name}`,
  }).catch(() => {});

  return { showcase, profile, added: ok.length, rejected };
}

/**
 * Run the analysis. The same one. See the header.
 *
 * Returns immediately; the build runs behind the request and the admin panel
 * polls `building` on the VoiceProfile, exactly as the creator-facing screen
 * does.
 */
export async function startShowcaseBuild(showcaseId) {
  const showcase = await User.findOne({ _id: showcaseId, kind: "showcase" }).lean();
  if (!showcase) throw Object.assign(new Error("not found"), { userMessage: "No such showcase." });

  const profile = await ensureProfile(showcaseId);
  const voice = await VoiceProfile.findOneAndUpdate(
    { profile: profile._id },
    { $setOnInsert: { user: showcaseId, profile: profile._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (voice.building) return { building: true, already: true };

  const pending = await Transcript.countDocuments({
    user: showcaseId,
    profile: profile._id,
    status: { $in: ["pending", "processing", "done"] },
  });
  if (!pending) {
    throw Object.assign(new Error("no videos"), { userMessage: "Add at least one video first." });
  }

  await VoiceProfile.updateOne({ _id: voice._id }, { $set: { building: true, build_error: "" } });

  // Nothing is charged: a showcase's credits are for the CREATOR to spend on
  // scripts when they open the link. Billing the analysis to the same wallet
  // would hand them a demo with nothing left to try.
  runVoiceBuild(String(showcaseId), profile._id, voice._id, String(profile._id), 0, SHORT).catch(() => {});

  return { building: true };
}

/* ── Opening one ──────────────────────────────────────────────────────────── */

/** The showcase behind a slug, or null. Inactive and claimed links are dead. */
export async function resolveSlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;

  const row = await User.findOne({
    "showcase.slug": s,
    kind: "showcase",
    "showcase.active": true,
    "showcase.claimed_by": null,
  }).lean();

  return row || null;
}

/**
 * Note that a browser opened this link.
 *
 * Fire-and-forget from the route: an analytics write must never be the reason
 * a creator cannot open the page we asked them to open.
 */
export async function recordVisit(showcaseId, visitorId, req) {
  const ipHash = crypto
    .createHash("sha256")
    .update(String(req?.headers?.["x-forwarded-for"] || req?.ip || ""))
    .digest("hex")
    .slice(0, 16);

  const now = new Date();

  await ShowcaseVisit.updateOne(
    { showcase: showcaseId, visitor_id: visitorId },
    {
      $set: { last_seen_at: now, ip_hash: ipHash, user_agent: String(req?.headers?.["user-agent"] || "").slice(0, 300) },
      $setOnInsert: { showcase: showcaseId, visitor_id: visitorId, first_seen_at: now },
    },
    { upsert: true }
  );

  await User.updateOne(
    { _id: showcaseId },
    { $inc: { "showcase.opens": 1 }, $set: { "showcase.last_opened_at": now } }
  );
}

/** Count one generated script against the visit and the showcase. */
export async function recordScript(showcaseId, visitorId, credits = 0) {
  await ShowcaseVisit.updateOne(
    { showcase: showcaseId, visitor_id: visitorId },
    { $inc: { scripts_generated: 1, credits_used: credits } }
  ).catch(() => {});

  await User.updateOne({ _id: showcaseId }, { $inc: { "showcase.scripts_made": 1 } }).catch(() => {});
}

/* ── Claiming one ─────────────────────────────────────────────────────────── */

/**
 * Hand the whole showcase to the creator who just signed in.
 *
 * ── RE-PARENT, DO NOT COPY ───────────────────────────────────────────────────
 * The Profile, its VoiceProfile and every Transcript change owner. They are not
 * duplicated, because Transcript is unique on (user, video_id): a copy means a
 * second row holding the same transcript text, and `built_from` on the voice
 * pointing at the old ids. Re-parenting moves the lot with three updates and
 * leaves nothing behind to drift.
 *
 * ── WHAT THIS SAVES ──────────────────────────────────────────────────────────
 * The videos have already been read, which is the only genuinely expensive
 * thing this product does. A creator who signs up from a share link therefore
 * skips the paste-five-URLs step, skips the wait, and lands on a finished voice
 * — and it costs nothing, because it was paid for when the showcase was built.
 *
 * ── AND WHAT IT DOES NOT MOVE ────────────────────────────────────────────────
 * Credits. The link's remaining balance stays on the showcase row and dies with
 * it. The new account gets its own SIGNUP_FREE_CREDITS from the ordinary
 * sign-up path, so claiming can never be a way to mint credits by opening lots
 * of links.
 */
export async function claimShowcase(showcaseId, realUserId) {
  const showcase = await User.findOne({ _id: showcaseId, kind: "showcase" });
  if (!showcase) return { claimed: false, reason: "not_found" };
  if (showcase.showcase?.claimed_by) return { claimed: false, reason: "already_claimed" };

  const target = await User.findById(realUserId).lean();
  if (!target || target.kind !== "human") return { claimed: false, reason: "bad_target" };

  const profiles = await Profile.find({ user: showcaseId }).select("_id").lean();
  const profileIds = profiles.map((p) => p._id);
  if (!profileIds.length) return { claimed: false, reason: "empty" };

  // ── A CREATOR WHO ALREADY HAS A VOICE KEEPS IT ─────────────────────────────
  // Claiming must never overwrite work somebody has already done. If they have
  // a built voice of their own, the showcase arrives as an ADDITIONAL profile,
  // which MAX_PROFILES may then refuse, and that refusal is correct: we do not
  // silently replace a voice they built themselves with one we built for them.
  const existing = await Profile.countDocuments({ user: realUserId });

  const session = await mongoose.startSession();
  let moved = 0;
  try {
    await session.withTransaction(async () => {
      const r1 = await Profile.updateMany({ user: showcaseId }, { $set: { user: realUserId } }, { session });
      await VoiceProfile.updateMany({ user: showcaseId }, { $set: { user: realUserId } }, { session });
      await Transcript.updateMany({ user: showcaseId }, { $set: { user: realUserId } }, { session });
      moved = r1.modifiedCount || 0;

      await User.updateOne(
        { _id: showcaseId },
        {
          $set: {
            "showcase.claimed_by": realUserId,
            "showcase.claimed_at": new Date(),
            // The link is spent. Not deleted: the row is the audit record of
            // who we contacted, what we built, and what became of it.
            "showcase.active": false,
          },
        },
        { session }
      );
    });
  } catch (err) {
    console.error("[showcase] claim failed:", err.message);
    return { claimed: false, reason: "error" };
  } finally {
    await session.endSession();
  }

  console.log(`[showcase] "${showcase.showcase?.display_name}" claimed by ${realUserId} (${moved} profile(s))`);
  return { claimed: true, profiles: moved, had_existing: existing > 0 };
}

export default {
  SHOWCASE_CREDITS, SHOWCASE_MAX_VIDEOS,
  newSlug, shareUrl, inspectUrls, createShowcase, startShowcaseBuild,
  resolveSlug, recordVisit, recordScript, claimShowcase,
};
