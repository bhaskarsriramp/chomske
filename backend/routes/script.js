/**
 * script.js: generate a script for a story, and read the voice profile behind it.
 *
 * Async and polled, same shape as /transcribe and for the same reason: writing a
 * full script (plus a profile rebuild on the first run) outlives what a proxy will
 * hold open, and a timeout on work that actually succeeded is the worst failure
 * mode to debug.
 */
import express from "express";
import mongoose from "mongoose";
import NewsItem from "../models/NewsItem.js";
import Script from "../models/Script.js";
import Source from "../models/Source.js";
import authenticateToken from "../middleware/authenticateToken.js";
import { writeScript, writeEnglishTwin, writePackaging } from "../services/scriptWriterService.js";
import { buildMaterial } from "../services/sourceMaterial.js";
import { getCategory } from "../services/categories.js";
import { buildVoiceProfile, getUsableProfile, profileStatus } from "../services/voiceProfileService.js";
import { resolveProfile } from "../services/profileService.js";
import { quote, PACKAGING_CREDITS } from "../services/creditPricing.js";
import { spend, refund, getBalance, InsufficientCredits } from "../services/creditsService.js";

const router = express.Router();

// Writing is cheap next to reading video, but it is not free and it is the
// endpoint someone would hammer. Kept separate from the transcribe cap because
// the two cost wildly different amounts.
const DAILY_SCRIPT_LIMIT = parseInt(process.env.DAILY_SCRIPT_LIMIT || "30", 10);

/**
 * Videos this account may have READ in a day.
 *
 * A separate ceiling from DAILY_SCRIPT_LIMIT because it guards something else.
 * A script is a model call; reading ten minutes of YouTube is the most
 * expensive thing this product buys, and it draws on a per-KEY allowance
 * Gemini shares across every user we have, roughly eight hours of video a day.
 * Twenty people reading a twenty-minute video each would exhaust it for
 * everybody, so this is the number to watch first if Import gets popular.
 *
 * Counts reads, not orders: a second script from a video already read is free
 * and does not touch this.
 */
const DAILY_VIDEO_READS = parseInt(process.env.DAILY_SOURCE_VIDEO_READS || "10", 10);

/**
 * GET /script/voice?profile=…, what we know about how this creator talks.
 *
 * Managing the channels themselves lives in routes/profiles.js; this stays
 * because it is the shape the writing screens read, "is there a voice to write
 * in, and how much of one", for whichever profile is selected.
 */
router.get("/voice", authenticateToken, async (req, res) => {
  try {
    const { channel, voice, profile, transcripts_available, stale } =
      await profileStatus(req.user.id, req.query.profile);
    return res.json({
      success: true,
      profile_id: String(channel._id),
      profile_name: channel.name || "",
      transcripts_available,
      stale,
      // The analysis now reads the videos first and runs to minutes, so the
      // client polls this instead of holding a request open. See
      // POST /profiles/:id/analyse.
      building: !!voice?.building,
      build_error: voice?.build_error || "",
      profile: profile ? shapeProfile(profile) : null,
    });
  } catch (err) {
    console.error("[script] GET /voice failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load your voice profile." });
  }
});

/** POST /script/voice/rebuild  { profile? }, re-learn from that channel's videos. */
router.post("/voice/rebuild", authenticateToken, async (req, res) => {
  try {
    const { profile, built, reason } = await buildVoiceProfile(req.user.id, req.body?.profile);
    if (!built) {
      return res.status(400).json({
        success: false,
        message:
          reason === "no_transcripts"
            ? "Transcribe at least one video first. That's what your voice is learned from."
            : "Couldn't build a voice profile.",
      });
    }
    return res.json({ success: true, profile: shapeProfile(profile) });
  } catch (err) {
    console.error("[script] rebuild failed:", err);
    return res.status(500).json({ success: false, message: err.message || "Couldn't rebuild your voice profile." });
  }
});

/**
 * POST /script  { news_id | source_id, seconds?, english?, packaging?, force? }
 *
 * ── TWO WAYS IN, ONE PATH THROUGH ────────────────────────────────────────────
 * `news_id` is a ranked story from Discover. `source_id` is material the creator
 * brought themselves through Import or Idea, already validated and read by
 * POST /source/preview. Everything after the first twenty lines is identical:
 * same voice check, same daily cap, same charge-then-work-then-refund-on-failure
 * flow, same polling contract. The difference between the three screens is what
 * gets read, and that lives in services/sourceMaterial.js.
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const newsId = String(req.body?.news_id || "");
    const sourceId = String(req.body?.source_id || "");

    if (!newsId && !sourceId) {
      return res.status(400).json({ success: false, message: "Nothing to write about." });
    }

    let item = null;
    let source = null;

    if (sourceId) {
      if (!mongoose.Types.ObjectId.isValid(sourceId)) {
        return res.status(400).json({ success: false, message: "Invalid source id" });
      }
      // Scoped to the caller. An id alone must never write from, or bill
      // against, somebody else's material.
      source = await Source.findOne({ _id: sourceId, user: userId }).lean();
      if (!source) {
        // Sources expire (see models/Source.js), so this is a normal thing to
        // hit on an old tab rather than an error. Said in a way that tells them
        // what to do about it.
        return res.status(404).json({
          success: false,
          source_expired: true,
          message: "That material has expired. Paste it again and we'll re-read it.",
        });
      }
    } else {
      if (!mongoose.Types.ObjectId.isValid(newsId)) {
        return res.status(400).json({ success: false, message: "Invalid story id" });
      }
      item = await NewsItem.findById(newsId).lean();
      if (!item) return res.status(404).json({ success: false, message: "Story not found" });
    }

    // Which channel this is for. Resolved before the cache check, because the
    // same story written for a creator's Hindi tech channel and their English
    // one are two different deliverables, treating them as one would hand back
    // the wrong script and charge for neither.
    const { profile: channel } = await resolveProfile(userId, req.body?.profile_id || req.body?.profile);

    // Already written it for this channel? Hand it back rather than billing for
    // the same story twice, regenerating has to be an explicit choice.
    if (!req.body?.force) {
      // ── THE LENGTH IS PART OF THE KEY FOR A BROUGHT SOURCE ────────────────
      // On the news path a story is a story and any length of it counts as
      // "already written". For Import that would be wrong in a way creators
      // would hit immediately: ordering a 60 second cut from a video and then
      // wanting the three minute version is the expected second act, not a
      // regenerate, and it is a different deliverable at a different price.
      // The video read behind it is already paid for either way, so the second
      // order costs only the writing.
      const key = source
        ? { source: source._id, duration_seconds: quote({ seconds: req.body?.seconds }).seconds }
        : { news_item: item._id };
      const existing = await Script.findOne({
        user: userId, ...key, profile: channel._id, status: { $ne: "failed" },
      })
        .sort({ created_at: -1 })
        .lean();
      if (existing) return res.json({ success: true, cached: true, script: shape(existing) });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const usedToday = await Script.countDocuments({
      user: userId,
      created_at: { $gte: since },
      status: { $in: ["processing", "done"] },
    });
    if (usedToday >= DAILY_SCRIPT_LIMIT) {
      return res.status(429).json({
        success: false,
        limit_reached: true,
        message: `You've generated ${DAILY_SCRIPT_LIMIT} scripts today. The limit resets 24 hours after each one.`,
      });
    }

    // ── Reading the video is capped separately from writing ─────────────────
    // Checked before the charge, so somebody at their ceiling is told rather
    // than billed and refunded. Only unread videos count: a second script from
    // material we already hold costs nothing to read and is not rationed.
    const needsVideoRead = !!(source?.youtube?.url && !source.video_read_at);
    if (needsVideoRead) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const readsToday = await Source.countDocuments({
        user: userId, video_read_at: { $gte: since },
      });
      if (readsToday >= DAILY_VIDEO_READS) {
        return res.status(429).json({
          success: false,
          limit_reached: true,
          message:
            `You've read ${DAILY_VIDEO_READS} videos today. The limit resets 24 hours after each ` +
            `one. Links and pasted text aren't capped.`,
        });
      }
    }

    // ── What they ordered ────────────────────────────────────────────────────
    // Duration is clamped inside quote(): `seconds` arrives in a request body,
    // and an unclamped 86,400 would bill a fortune of credits and hand Gemini a
    // prompt that never returns.
    //
    // The source half is priced from the STORED document, never from the
    // request. What a video costs depends on how long it is, and "how long is
    // it" is a fact we bought from apidirect during the preview; taking the
    // client's word for it would let a hand-rolled request read a ten minute
    // video at the two minute price.
    const order = quote({
      seconds: req.body?.seconds,
      englishTwin: !!req.body?.english,
      packaging: !!req.body?.packaging,
      source: source
        ? {
            videoSeconds: source.youtube?.duration_seconds || 0,
            lookup: !!source.lookup_used,
            // Reading is bought once. The second script from the same video
            // pays for writing and nothing else, which is the entire reason
            // models/Source.js caches the transcript.
            alreadyRead: !!source.video_read_at,
          }
        : null,
    });

    // Fail before creating a row if there is nothing to write in the voice of,
    // a "processing" script that can never succeed is a worse experience than a
    // clear message here.
    const profile = await getUsableProfile(userId, { profileId: channel._id, autoBuild: false });
    const hasTranscripts = (await profileStatus(userId, channel._id)).transcripts_available > 0;
    if (!profile && !hasTranscripts) {
      return res.status(400).json({
        success: false,
        needs_transcript: true,
        profile_id: String(channel._id),
        message: "Add a video to this profile first. That's how we learn how you talk.",
      });
    }

    const doc = await Script.create({
      user: userId,
      status: "processing",
      duration_seconds: order.seconds,
      profile: channel._id,
      // Copied, not looked up: renaming or deleting a profile must not relabel
      // scripts already written for it.
      profile_name: channel.name || "",

      ...(source
        ? {
            source_kind: source.kind,          // "import" or "idea"
            source: source._id,
            headline: source.title || "",
            angle: source.angle || "",
            // ── COPIED, BECAUSE THE SOURCE WILL NOT BE HERE LATER ──────────
            // Source documents expire. This is the permanent record of what the
            // script was made from, and it is what makes a row in My scripts
            // mean something three weeks on. The pasted body is deliberately
            // reduced to a character count: it can be six thousand characters
            // of somebody else's article, and storing it a second time, for
            // ever, to label a list row is not a trade worth making.
            source_input: {
              youtube_url: source.youtube?.url || "",
              youtube_title: source.youtube?.title || "",
              links: (source.links || []).filter((l) => l.ok).map((l) => l.url),
              text_chars: (source.text || "").length,
              prompt: source.prompt || "",
              lookup: !!source.lookup,
              lookup_used: !!source.lookup_used,
            },
          }
        : {
            source_kind: "news",
            news_item: item._id,
            story: item.cluster_id || "",
            headline: item.title,
            angle: item.ai_angle || "",
          }),
    });

    // ── Charge AFTER the row exists, BEFORE the work starts ──────────────────
    // After, so the ledger entry can point at a real script id and a creator
    // asking "what was this 60 credits for" gets an answer. Before the work, so
    // a story that fails repeatedly cannot be retried without limit against a
    // metered model, the failure path refunds in full.
    let charged = 0;
    try {
      const spent = await spend(userId, order.total, {
        reason: "script",
        refType: "Script",
        refId: doc._id,
        note: `${order.seconds}s script${order.twin ? " + English" : ""}${order.packaging ? " + packaging" : ""}`,
      });
      charged = spent.spent;
      await Script.updateOne({ _id: doc._id }, { $set: { credits_charged: charged } });

      // What reading this material has cost so far, accumulated on the Source.
      // Purely for answering "why did this one cost 54 credits" later: the
      // don't-charge-twice decision is made on video_read_at and lookup_used,
      // never on this number.
      if (source && order.source > 0) {
        await Source.updateOne(
          { _id: source._id },
          { $inc: { read_charged: order.source }, $set: { updated_at: new Date() } }
        ).catch(() => {});
      }
    } catch (err) {
      if (err instanceof InsufficientCredits) {
        // The row was created a moment ago and nothing was charged for it, so
        // it is removed rather than left as a "processing" script that never
        // runs, a ghost in their history is worse than no row at all.
        await Script.deleteOne({ _id: doc._id }).catch(() => {});
        return res.status(402).json({
          success: false,
          insufficient_credits: true,
          needed: err.needed,
          balance: err.balance,
          message: `This needs ${err.needed} credits and you have ${err.balance}. Top up to keep writing.`,
        });
      }
      throw err;
    }

    // Fire and forget; the client polls.
    runScript(doc._id, userId, { item, sourceId: source?._id || null }, {
      ...order, charged, profileId: channel._id,
    }).catch((err) => console.error(`[script] unhandled failure for ${doc._id}:`, err));

    return res.status(202).json({
      success: true,
      cached: false,
      charged,
      balance: await getBalance(userId).catch(() => null),
      script: shape(doc),
    });
  } catch (err) {
    console.error("[script] POST failed:", err);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

/**
 * GET /script, everything this creator has written, newest first.
 *
 * Each row carries the topic it came from, not just the headline stored on the
 * script. A script read back a week later is unusable without the story behind
 * it: the whole promise is "check the facts before you say them", and a list of
 * bare headlines cannot be checked against anything.
 *
 *   ?limit=20     rows per page (max 50)
 *   ?before=ISO   cursor: created_at strictly older than this
 *   ?profile=id   only scripts written for that channel; omit for all of them
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const q = { user: req.user.id };

    // Filtering is opt-in. "All profiles" is a real answer to "which of my
    // scripts do I want to see", and it is the right default for someone who
    // only ever had one, they should never have to discover a filter to find
    // work they wrote before profiles existed.
    const profileParam = String(req.query.profile || "").trim();
    if (profileParam && profileParam !== "all" && mongoose.Types.ObjectId.isValid(profileParam)) {
      q.profile = new mongoose.Types.ObjectId(profileParam);
    }

    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (!isNaN(before)) q.created_at = { $lt: before };
    }

    // One extra row tells us whether another page exists without a count query.
    const docs = await Script.find(q).sort({ created_at: -1 }).limit(limit + 1).lean();
    const hasMore = docs.length > limit;
    if (hasMore) docs.length = limit;

    // The topics, in one query rather than one per script.
    const itemIds = [...new Set(docs.map((d) => d.news_item).filter(Boolean).map(String))];
    const items = itemIds.length
      ? await NewsItem.find({ _id: { $in: itemIds } })
          .select("title summary brief category cluster_id ai_angle ai_score first_seen_at")
          .lean()
      : [];
    const byItem = new Map(items.map((i) => [String(i._id), i]));

    // Real names for the source links. sources_used holds bare URLs, and a list
    // of raw hrefs is something a creator has to hover to read, these are the
    // rows those URLs came from, so the outlet and its headline come free.
    const urls = [...new Set(docs.flatMap((d) => d.sources_used || []))];
    const srcRows = urls.length
      ? await NewsItem.find({ url: { $in: urls } }).select("url source title published_at").lean()
      : [];
    const bySrc = new Map(srcRows.map((s) => [s.url, s]));

    return res.json({
      success: true,
      count: docs.length,
      has_more: hasMore,
      next_before: hasMore && docs.length ? docs[docs.length - 1].created_at : null,
      scripts: docs.map((d) => {
        const topic = byItem.get(String(d.news_item)) || null;
        return {
          ...shape(d),
          topic: topic
            ? {
                id: String(topic._id),
                title: topic.title,
                // The 100-120 word read, falling back to the collected summary.
                brief: topic.brief || topic.summary || "",
                angle: topic.ai_angle || "",
                category: topic.category || "",
                category_label: getCategory(topic.category)?.label || "",
                first_seen_at: topic.first_seen_at,
              }
            : null,
          // Import and Idea scripts cite pages the collector never saw, so the
          // NewsItem lookup above finds nothing for them and the outlet name
          // would come back blank. The hostname is not as good as a real
          // source name, but "reuters.com" is a label a creator can act on and
          // an empty string is not.
          sources: (d.sources_used || []).map((url) => {
            const s = bySrc.get(url);
            return {
              url,
              source: s?.source || hostOf(url),
              title: s?.title || "",
              published_at: s?.published_at || null,
            };
          }),
        };
      }),
    });
  } catch (err) {
    console.error("[script] GET / failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load your scripts." });
  }
});

/** GET /script/:id, poll target. */
router.get("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  // Scoped to the caller: an id alone must never read someone else's script.
  const doc = await Script.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });
  return res.json({ success: true, script: shape(doc) });
});

/**
 * The work, off the request path. Never throws to the caller.
 *
 * @param {object} order  what was bought: { seconds, englishTwin, packaging, charged }
 *
 * ── THE ADD-ONS CANNOT LOSE THE SCRIPT ──────────────────────────────────────
 * The twin and the packaging run AFTER the main script is saved as done, and
 * each soft-fails to null. A creator who paid for all three and hits a Gemini
 * hiccup on the packaging call still has their script, losing the paid-for
 * main deliverable because an optional extra failed would be the worst possible
 * trade. What they did not receive is refunded, line by line.
 */
async function runScript(id, userId, subject, order) {
  const started = Date.now();
  const { seconds = 60, englishTwin = false, packaging = false, profileId } = order || {};
  const { item = null, sourceId = null } = subject || {};

  try {
    // Built here rather than in the route so the first-ever script absorbs the
    // voice build without the request waiting on both.
    const profile = await getUsableProfile(userId, { profileId, autoBuild: true });
    if (!profile) throw Object.assign(new Error("no profile"), {
      userMessage: "Add a video to this profile first. That's how we learn how you talk.",
    });

    // ── THE MATERIAL IS BUILT ONCE AND SHARED ────────────────────────────────
    // The twin and the packaging call used to each run their own NewsItem
    // query, which meant three round trips for one story and, worse, a twin
    // written from 300-character summaries while the script beside it was
    // written from full articles. One material, three consumers.
    //
    // The Source is re-read here rather than passed down from the route. It is
    // seconds newer, which is what a concurrent order from the same video needs
    // to see the cached transcript instead of buying a second read of it.
    const source = sourceId ? await Source.findById(sourceId).lean() : null;
    const material = await buildMaterial({ item, source, seconds });

    const out = await writeScript({ profile, material, seconds });

    await Script.updateOne(
      { _id: id },
      {
        $set: {
          status: "done",
          text: out.text,
          hook: out.hook,
          title_suggestions: out.title_suggestions,
          language: out.language,
          language_label: out.language_label,
          voice_confidence: profile.confidence || "",
          sources_used: out.sources_used,
          usage: out.usage || {},
          ms_taken: Date.now() - started,
          updated_at: new Date(),
        },
      }
    );

    const u = out.usage || {};
    console.log(
      `[script] ${id} done in ${((Date.now() - started) / 1000).toFixed(1)}s · ` +
      `${seconds}s · ${out.text.length} chars · ${out.language_label || "?"} · ` +
      `voice:${profile.confidence} · $${(u.usd || 0).toFixed(4)}`
    );

    // ── Extras, each independent ─────────────────────────────────────────────
    //
    // Wrapped so nothing in here can reach the outer catch. If it could, a
    // failure while refunding the twin would fall through to the "script
    // failed" handler and refund the WHOLE order a second time, on top of the
    // partial refund that had already gone through, for a script the creator
    // has in their hands. The main deliverable is saved and paid for by this
    // point; the extras can only ever adjust around it.
    try {
    if (englishTwin) {
      const twin = await writeEnglishTwin({ profile, material, seconds, sourceScript: out.text });
      if (twin) {
        await Script.updateOne(
          { _id: id },
          { $set: { english_text: twin.text, english_hook: twin.hook, updated_at: new Date() } }
        ).catch(() => {});
      } else {
        const back = quote({ seconds, englishTwin: true }).twin;
        await refund(userId, back, { refType: "Script", refId: id, note: "English version failed" });
        await Script.updateOne({ _id: id }, { $inc: { credits_refunded: back } }).catch(() => {});
        console.warn(`[script] ${id} twin failed, refunded ${back} credits`);
      }
    }

    if (packaging) {
      const pack = await writePackaging({
        profile, material, script: out.text, language: out.language_label,
      });
      if (pack) {
        await Script.updateOne(
          { _id: id },
          {
            $set: {
              // Packaging titles supersede the writer's three: they are written
              // against the finished script and include English ones for search.
              title_suggestions: pack.titles.length ? pack.titles : out.title_suggestions,
              description: pack.description,
              hashtags: pack.hashtags,
              thumbnail_lines: pack.thumbnail_lines,
              updated_at: new Date(),
            },
          }
        ).catch(() => {});
      } else {
        await refund(userId, PACKAGING_CREDITS, { refType: "Script", refId: id, note: "Packaging failed" });
        await Script.updateOne({ _id: id }, { $inc: { credits_refunded: PACKAGING_CREDITS } }).catch(() => {});
        console.warn(`[script] ${id} packaging failed, refunded ${PACKAGING_CREDITS} credits`);
      }
    }
    } catch (extrasErr) {
      // Logged, never rethrown. The script itself is done and delivered.
      console.error(`[script] ${id} extras failed after delivery:`, extrasErr.message);
    }
  } catch (err) {
    await Script.updateOne(
      { _id: id },
      {
        $set: {
          status: "failed",
          error: err.userMessage || "We couldn't write this script.",
          ms_taken: Date.now() - started,
          updated_at: new Date(),
        },
      }
    ).catch(() => {});

    // The whole order is refunded, not just the base. They received nothing.
    // Charging on start and refunding on failure, rather than charging on
    // success, is deliberate: it keeps a failing story from being an unlimited
    // free retry loop against a metered model, while never billing for a
    // deliverable that did not arrive.
    const charged = Number(order?.charged) || 0;
    if (charged > 0) {
      await refund(userId, charged, { refType: "Script", refId: id, note: "Script failed" });
      await Script.updateOne({ _id: id }, { $inc: { credits_refunded: charged } }).catch(() => {});
    }
    console.error(`[script] ${id} failed: ${err.message}${charged ? `, refunded ${charged} credits` : ""}`);
  }
}

/** "https://www.reuters.com/x/y" -> "reuters.com". Empty for anything unparseable. */
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function shape(d) {
  return {
    id: String(d._id),
    news_item: d.news_item ? String(d.news_item) : null,
    headline: d.headline || "",
    angle: d.angle || "",
    status: d.status,

    // ── Where this came from ─────────────────────────────────────────────────
    // Read by My scripts to label a row, because a page of text with no
    // provenance is exactly what this product exists not to hand anybody. The
    // Source itself expires; source_input does not, so a row still says "the
    // video they pasted" or "these four links" long after the cache is gone.
    source_kind: d.source_kind || "news",
    source: d.source ? String(d.source) : null,
    source_input: {
      youtube_url:   d.source_input?.youtube_url || "",
      youtube_title: d.source_input?.youtube_title || "",
      links:         d.source_input?.links || [],
      text_chars:    d.source_input?.text_chars || 0,
      prompt:        d.source_input?.prompt || "",
      lookup:        !!d.source_input?.lookup,
      lookup_used:   !!d.source_input?.lookup_used,
    },
    text: d.text || "",
    hook: d.hook || "",
    title_suggestions: d.title_suggestions || [],
    language: d.language || "",
    language_label: d.language_label || "",
    profile: d.profile ? String(d.profile) : null,
    profile_name: d.profile_name || "",
    voice_confidence: d.voice_confidence || "",
    sources_used: d.sources_used || [],
    error: d.error || "",

    // What was ordered and what it cost, the history list shows this, so a
    // creator can see why one script cost 30 credits and another 255.
    duration_seconds: d.duration_seconds || 60,
    credits_charged: d.credits_charged || 0,
    credits_refunded: d.credits_refunded || 0,

    // The extras. Empty when they were not bought, so the client can simply
    // check for content rather than needing to know what was ordered.
    english_text: d.english_text || "",
    english_hook: d.english_hook || "",
    description: d.description || "",
    hashtags: d.hashtags || [],
    thumbnail_lines: d.thumbnail_lines || [],

    created_at: d.created_at,
  };
}

/**
 * What the BROWSER is told about a built voice.
 *
 * ── WHY THIS IS THE SUMMARY AND NOT THE ANALYSIS ────────────────────────────
 * Deliberately just enough to render "built, from 3 videos, Telugu-English":
 * a count, a language, a confidence, a timestamp.
 *
 * The analysis itself stays on the server. The openings, the closings, the
 * signature phrases, the stance, the pacing, the audience read: assembled,
 * that is a working style prompt for this creator, and it is the one thing
 * here that took a paid model call over their own videos to produce. Shipped
 * to the client it can be lifted out of a network tab in ten seconds and
 * pasted into any free chat assistant, which is the entire product given away
 * by a screen that was only ever meant to be reassuring.
 *
 * Nothing is lost by withholding it. The writer reads the VoiceProfile
 * document straight from the database (services/scriptWriterService.js), never
 * through this shape, so scripts are written from the full analysis either way.
 */
function shapeProfile(p) {
  return {
    transcript_count: p.transcript_count || 0,
    language: p.language || "",
    language_label: p.language_label || "",
    confidence: p.confidence || "thin",
    built_at: p.built_at,
  };
}

export default router;
