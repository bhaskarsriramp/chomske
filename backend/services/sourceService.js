/**
 * sourceService.js: validate what a creator pasted, read what is free to read,
 * and hand back something honest to decide from.
 *
 * ── THE FAILURE THIS FILE EXISTS TO PREVENT ──────────────────────────────────
 * Discover can afford to be optimistic. If TinyFish opens none of the pages, the
 * writer still has the collector's headlines and summaries, so the worst case is
 * a thinner script. Import has no such floor. Five paywalled links read zero
 * pages, and a script written from zero pages is either a refusal or an
 * invention, sold at full price to somebody who is about to read it aloud.
 *
 * So everything that costs nothing happens HERE, before a single credit moves:
 *   • the YouTube URL is parsed and its real duration checked against the cap
 *   • the pages are actually fetched, and the ones that refused are named
 *   • an Idea's lookup is actually run, so "we found nothing" is known up front
 *
 * The creator then sees exactly what we hold, and the price on the button is
 * priced against that and nothing else. The one expensive thing, reading the
 * video, is deliberately left until after they have paid for a script.
 *
 * ── WHY THE LOOKUP IS RUN HERE AND NOT AT GENERATION ─────────────────────────
 * The first design charged for a lookup and refunded it when it found nothing.
 * Running it during the free preview is strictly better: not charging is always
 * cleaner than charging and giving it back, the creator learns before they
 * commit that this brief has no coverage behind it, and there is no refund path
 * to get wrong. What it costs is one small planning call on a screen somebody
 * is actively using, which is the same trade the news feed already makes.
 */
import Source, { sourceHash } from "../models/Source.js";
import { parseYouTubeUrl } from "../utils/youtube.js";
import { canonicalUrl } from "../utils/normalize.js";
import { getVideoMetadata, isVideoMetadataConfigured } from "./videoMetadata.js";
import { fetchArticles } from "./tinyfishClient.js";
import { researchPrompt } from "./promptResearchService.js";
import { draftFromIdea } from "./ideaDraftService.js";
import {
  MAX_SOURCE_VIDEO_SECONDS, MAX_SOURCE_LINKS,
  MAX_SOURCE_TEXT_CHARS, MAX_PROMPT_CHARS,
} from "./creditPricing.js";

/** Per page, matching what the deep-read path gives a long-form news script. */
const LINK_CHARS = parseInt(process.env.SOURCE_LINK_CHARS || "3000", 10);

/** A refusal the caller turns into a 400. Separated from real errors so a
 *  paywall and a crashed service do not produce the same message. */
export class SourceRejected extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "SourceRejected";
    this.userMessage = message;
    Object.assign(this, extra);
  }
}

/* ── Validation ────────────────────────────────────────────────────────────── */

/** Only real web pages. A javascript: or data: URL in this field is not a typo. */
function usableLink(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let u;
  try {
    u = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return "";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  if (!u.hostname.includes(".")) return "";
  return canonicalUrl(u.toString());
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDuration(s) {
  const n = Math.round(Number(s) || 0);
  if (n < 60) return `${n} seconds`;
  const m = Math.floor(n / 60);
  const rem = n % 60;
  return rem ? `${m}m ${rem}s` : `${m} minutes`;
}

/**
 * The YouTube half: parse, then verify the length before anything expensive.
 *
 * ── THIS GATE FAILS CLOSED, FOR THE SAME REASON THE OTHER ONE DOES ───────────
 * Copied in spirit from routes/transcribe.js. A length we cannot verify is not
 * eligible, because "unknown" is exactly the state a four-hour livestream
 * arrives in, and the call standing behind this gate is the most expensive one
 * this product makes. One cheap metadata lookup is the difference between
 * refusing a long video and paying to discover it was long.
 */
/**
 * ── ONE METADATA LOOKUP PER VIDEO, NOT ONE PER KEYSTROKE ─────────────────────
 * Pricing a video needs its length, and its length costs an apidirect call. The
 * Import screen now quotes in real time, so the same URL is priced while the
 * creator adds a link, edits their text, changes their mind, and then priced
 * once more by the preview that follows. Uncached that is a paid call per
 * revision of a form.
 *
 * Short-lived on purpose. This is not a store: it exists to collapse the burst
 * of lookups around one editing session, and a video's length never changes, so
 * the only thing a longer TTL would buy is staler titles.
 */
const META_TTL_MS = 10 * 60 * 1000;
const metaCache = new Map();   // url -> { at, video }

function cachedMeta(url) {
  const hit = metaCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > META_TTL_MS) { metaCache.delete(url); return null; }
  return hit.video;
}

function rememberMeta(url, video) {
  // Bounded, so a busy instance cannot grow this without limit. Oldest first:
  // Map iterates in insertion order, so the first key is the coldest.
  if (metaCache.size > 500) metaCache.delete(metaCache.keys().next().value);
  metaCache.set(url, { at: Date.now(), video });
}

/**
 * The video behind a URL, priced-ready, without doing the work twice.
 *
 * Rejections are NOT cached: a live stream that has ended, or a lookup that
 * failed because the key was briefly exhausted, must be retryable a minute
 * later rather than remembered as a refusal for ten.
 */
export async function describeVideo(input) {
  const parsed = parseYouTubeUrl(input);
  if (!parsed) {
    throw new SourceRejected(
      "That doesn't look like a YouTube link. Paste a normal video, Shorts or youtu.be URL."
    );
  }
  const hit = cachedMeta(parsed.url);
  if (hit) return hit;
  const video = await resolveVideo(input);
  rememberMeta(parsed.url, video);
  return video;
}

async function resolveVideo(input) {
  const parsed = parseYouTubeUrl(input);
  if (!parsed) {
    throw new SourceRejected(
      "That doesn't look like a YouTube link. Paste a normal video, Shorts or youtu.be URL."
    );
  }

  if (!isVideoMetadataConfigured()) {
    throw new SourceRejected(
      "We can't check video lengths right now, so videos are paused. Paste a link or some text instead.",
      { length_unknown: true }
    );
  }

  let meta = null;
  let lookupError = null;
  try {
    meta = await getVideoMetadata(parsed.url);
  } catch (err) {
    lookupError = err;
    console.warn(`[source] duration lookup failed for ${parsed.videoId}: ${err.message}`);
  }

  if (meta?.is_live) {
    throw new SourceRejected("That's a live stream. Paste a finished video instead.");
  }

  const duration = typeof meta?.duration === "number" ? meta.duration : null;
  if (duration === null) {
    const exhausted = lookupError?.keyExhausted === true;
    console.warn(`[source] REFUSED ${parsed.videoId}: length unverifiable`);
    throw new SourceRejected(
      exhausted
        ? "We can't check video lengths right now, so videos are paused. Please try again later."
        : "We couldn't read that video's details. Check the link is a public YouTube video and try again.",
      { length_unknown: true }
    );
  }

  if (duration > MAX_SOURCE_VIDEO_SECONDS) {
    throw new SourceRejected(
      `That video is ${formatDuration(duration)} long. We can read up to ` +
      `${formatDuration(MAX_SOURCE_VIDEO_SECONDS)}. Paste a shorter one, or link to an article about it.`,
      { too_long: true, duration }
    );
  }

  return {
    video_id: parsed.videoId,
    url: parsed.url,
    title: meta.title || "",
    channel: meta.author || "",
    thumbnail: meta.thumbnail || "",
    duration_seconds: duration,
  };
}

/* ── Building one ──────────────────────────────────────────────────────────── */

/**
 * Read everything free, store it, and describe what we got.
 *
 * Accepts every input at once on purpose: a video AND links AND text AND a
 * brief is a valid request, even though the UI currently presents Import and
 * Idea as separate screens. Keeping the composite shape here means merging
 * those two screens later, or letting somebody say "cover this video, but from
 * this angle", is a change to a React component and nothing else.
 *
 * @returns {Promise<object>} the saved Source document (lean)
 */
export async function buildSource(userId, {
  kind = "import",
  youtube = "",
  links = [],
  text = "",
  prompt = "",
  lookup = false,
  locale = null,
} = {}) {
  const brief = String(prompt || "").trim().slice(0, MAX_PROMPT_CHARS);
  const pasted = String(text || "").trim().slice(0, MAX_SOURCE_TEXT_CHARS);

  const wantedLinks = [...new Set(
    (Array.isArray(links) ? links : [links])
      .map(usableLink)
      .filter(Boolean)
  )].slice(0, MAX_SOURCE_LINKS);

  // Something has to have been given. An empty preview is a client bug, not a
  // state worth storing.
  if (!youtube && !wantedLinks.length && !pasted && !brief) {
    throw new SourceRejected("Add a video, a link, some text, or tell us what to write about.");
  }
  if (kind === "idea" && !brief) {
    throw new SourceRejected("Tell us what you want the video to be about.");
  }

  // Through the cache, so the metadata call the quote just made is not paid for
  // a second time by the preview that follows it seconds later.
  const video = youtube ? await describeVideo(youtube) : null;

  // ── Reuse, so the same paste twice costs once ─────────────────────────────
  // Checked AFTER the video is resolved, because the hash keys on the video id
  // and the same video arrives as a dozen different URLs (youtu.be, /shorts/,
  // with a timestamp, with a playlist). Hashing the raw paste would miss those.
  const hash = sourceHash({
    kind: kind === "idea" ? "idea" : "import",
    videoId: video?.video_id || "",
    links: wantedLinks,
    text: pasted,
    prompt: brief,
    lookup: !!lookup,
  });

  const existing = await Source.findOne({ user: userId, hash }).sort({ created_at: -1 }).lean();
  if (existing) {
    // Push its expiry out: they are clearly still working with this material,
    // and a source that vanished mid-session would re-charge the video read.
    await Source.updateOne(
      { _id: existing._id },
      { $set: { expires_at: new Date(Date.now() + 30 * 86400000), updated_at: new Date() } }
    ).catch(() => {});
    console.log(`[source] reusing ${existing._id} for user=${userId}`);
    return existing;
  }

  /* ── Read what is free ──────────────────────────────────────────────────── */

  const blocks = [];
  const used = [];
  const linkRows = [];

  if (wantedLinks.length) {
    let read = new Map();
    try {
      read = await fetchArticles(wantedLinks, { maxChars: LINK_CHARS });
    } catch (err) {
      console.warn(`[source] link read failed: ${err.message}`);
    }

    for (const url of wantedLinks) {
      const body = read.get(url) || "";
      const host = hostOf(url);
      // Rows for pages that refused are kept, not dropped. "We couldn't read
      // the FT one" is the single most useful thing this screen can tell
      // somebody before they spend credits.
      linkRows.push({ url, source: host, title: "", ok: !!body, chars: body.length });
      if (!body) continue;
      blocks.push(`[LINK] (${host} · FULL ARTICLE) ${url}\n${body}`);
      used.push(url);
    }
  }

  if (pasted) {
    blocks.push(
      `[PASTED BY THE CREATOR] They copied this in themselves as the material ` +
      `for the video:\n${pasted}`
    );
  }

  /* ── The lookup, if they asked for one ──────────────────────────────────── */

  let lookupUsed = false;
  let lookupReason = "";
  let researchedTopic = "";

  if (lookup && brief) {
    const found = await researchPrompt(brief, locale ? { locale } : {}).catch((err) => {
      console.warn(`[source] research threw: ${err.message}`);
      return { ok: false, reason: "error", facts: "", sources_used: [], topic: "" };
    });

    if (found.ok) {
      lookupUsed = true;
      researchedTopic = found.topic || "";
      blocks.push(found.facts);
      used.push(...found.sources_used);
    } else {
      lookupReason = found.reason || "no_coverage";
      console.log(`[source] lookup found nothing (${lookupReason}), writing from the brief`);
    }
  }

  /* ── AN IDEA WITH NOTHING BEHIND IT GETS DRAFTED, NOT REFUSED ────────────
     This is the ordinary case for Idea, not the exception. Most briefs are
     evergreen (an explainer, an opinion, a lesson) and have no coverage today
     or ever, so the lookup correctly finds nothing and there is still no
     material. Previously that went straight to the order panel and produced
     sixty seconds built out of one sentence.

     So the model drafts the content instead, and the creator edits it. Nothing
     here is written from yet: `draft` is a proposal, `facts` stays empty, and
     the source is not orderable until confirmDraft() records that a human
     approved a version of it. See services/ideaDraftService.js for why that
     signature is what makes model-written content acceptable material at all.

     Skipped when the lookup DID find coverage: real sources are checkable in a
     way a draft is not, so they need no sign-off, and asking for one would put
     a review step in front of the path that least needs it. */
  let draft = "";
  if (kind === "idea" && !blocks.length) {
    draft = await draftFromIdea(brief).catch(() => "");
  }

  /* ── NOTHING READABLE IS A REFUSAL, NOT A CHEAP SCRIPT ───────────────────
     The whole point of reading during the free preview is that this case gets
     caught before money moves, and without this check it would not be: an
     Import whose five links were all paywalled would store a source with empty
     facts, show a card full of red rows, and still put a priced Write button
     underneath it. The creator would pay for a script with no material behind
     it, and the writer would either refuse or invent. Both are worse than
     being told, for free, that we could not read any of it.

     A pending video is material even though `blocks` is empty here: it has
     been verified to exist, be public, and be within the length cap, and it is
     read at generation time. */
  if (kind === "import" && !blocks.length && !video) {
    throw new SourceRejected(
      wantedLinks.length
        ? "We couldn't read any of those links. Most are paywalls or block us. Paste the text instead, or try a different source."
        : "There was nothing readable in that. Paste a link, some text, or a video."
    );
  }

  /* ── What it is called ──────────────────────────────────────────────────── */

  // Derived, never generated: a model call to title something the creator can
  // already see would be paying to restate their own input back to them.
  const title =
    video?.title ||
    researchedTopic ||
    (linkRows.find((l) => l.ok) ? hostOf(linkRows.find((l) => l.ok).url) : "") ||
    firstLine(brief) ||
    firstLine(pasted) ||
    "Untitled";

  const doc = await Source.create({
    user: userId,
    kind: kind === "idea" ? "idea" : "import",
    hash,
    youtube: video || undefined,
    links: linkRows,
    text: pasted,
    prompt: brief,
    lookup: !!lookup,
    lookup_used: lookupUsed,
    draft,
    title,
    // The brief doubles as the angle: it is the creator saying what they want
    // said, which is the job ai_angle does on the news path.
    angle: brief || "",
    facts: blocks.join("\n\n"),
    sources_used: [...new Set(used)],
  });

  console.log(
    `[source] built ${doc._id} kind=${doc.kind} user=${userId} · ` +
    `${video ? `video ${video.duration_seconds}s · ` : ""}` +
    `${linkRows.filter((l) => l.ok).length}/${linkRows.length} link(s) · ` +
    `${pasted ? `${pasted.length} chars pasted · ` : ""}` +
    `${draft ? "drafted · " : ""}` +
    `lookup=${lookup ? (lookupUsed ? "hit" : `miss:${lookupReason}`) : "off"}`
  );

  return { ...doc.toObject(), lookup_reason: lookupReason };
}

/**
 * Record that a human approved a version of the draft, and make it material.
 *
 * ── THIS FUNCTION IS THE WHOLE ARGUMENT ─────────────────────────────────────
 * Everywhere else in this product the model is forbidden from using its
 * training, because a creator reading an invented figure aloud in their own
 * voice is the worst thing we could cause. Idea mode needs content that no
 * source can supply, so the rule is not relaxed, it is satisfied differently:
 * a person who knows the subject reads what was proposed, corrects it, and
 * puts their name to it. What lands in `text` is theirs.
 *
 * `draft` is deliberately left untouched alongside it, so the record shows what
 * we suggested next to what they actually signed off on.
 *
 * Accepts an edit that is barely changed, or not changed at all. Reading it and
 * pressing the button IS the approval; demanding a diff would be the product
 * second-guessing somebody who found the draft correct.
 *
 * @param {string} text  the creator's edited version
 */
export async function confirmDraft(userId, sourceId, text) {
  const approved = String(text || "").trim().slice(0, MAX_SOURCE_TEXT_CHARS);
  if (!approved) {
    throw new SourceRejected("There's nothing to write from. Add some content, or go back and change the idea.");
  }
  // Short enough to be a title rather than material. Approving an empty-ish
  // draft would put us straight back to writing a minute out of one line.
  if (approved.length < 80) {
    throw new SourceRejected("That's too short to build a video from. Add a few more lines, or ask for a new draft.");
  }

  // Scoped to the caller, like every other read of this collection.
  const doc = await Source.findOne({ _id: sourceId, user: userId });
  if (!doc) throw new SourceRejected("That material has expired. Paste your idea again.");
  if (doc.kind !== "idea") throw new SourceRejected("That source isn't an idea.");

  doc.text = approved;
  doc.draft_approved_at = new Date();
  // Labelled as the creator's own, because after this edit it is. The writer's
  // strict fact rule then applies to it: everything in the script traces back
  // to something a human put there.
  doc.facts =
    `[THE CREATOR'S OWN MATERIAL] They wrote and approved this as the content ` +
    `for the video:
${approved}`;
  doc.updated_at = new Date();
  await doc.save();

  console.log(`[source] draft approved on ${doc._id} (${approved.length} chars)`);
  return doc.toObject();
}

/**
 * Another draft, for a creator who did not like the first one.
 *
 * The previous text is handed back to the model so it takes a different angle
 * rather than rewording what was already rejected. Cheap, and the alternative
 * is somebody hand-editing a draft that started out wrong, which is slower than
 * writing it themselves and would make the whole step feel like a tax.
 */
export async function redraft(userId, sourceId) {
  const doc = await Source.findOne({ _id: sourceId, user: userId });
  if (!doc) throw new SourceRejected("That material has expired. Paste your idea again.");
  if (doc.kind !== "idea") throw new SourceRejected("That source isn't an idea.");

  const next = await draftFromIdea(doc.prompt, { previous: doc.draft }).catch(() => "");
  if (!next) {
    throw new SourceRejected("Couldn't write another draft just now. Edit this one, or try again in a moment.");
  }

  doc.draft = next;
  // The approval does not survive a new draft: what they signed off on is gone,
  // so the source goes back to needing a signature before it can be ordered.
  doc.draft_approved_at = null;
  doc.text = "";
  doc.facts = "";
  doc.updated_at = new Date();
  await doc.save();

  return doc.toObject();
}

/**
 * What the browser is told about a source.
 *
 * The extracted article bodies stay on the server. They are other people's
 * copyrighted text, we hold them only to write from, and shipping them to a
 * network tab would turn this into a paywall bypass with a slider attached.
 * What the creator needs to decide is which of their links we could read, how
 * long the video is, and whether the lookup found anything: all of that is here.
 */
export function shapeSource(doc, extra = {}) {
  if (!doc) return null;
  const readable = (doc.links || []).filter((l) => l.ok).length;
  return {
    id: String(doc._id),
    kind: doc.kind,
    title: doc.title || "",
    youtube: doc.youtube?.video_id
      ? {
          video_id: doc.youtube.video_id,
          url: doc.youtube.url,
          title: doc.youtube.title || "",
          channel: doc.youtube.channel || "",
          thumbnail: doc.youtube.thumbnail || "",
          duration_seconds: doc.youtube.duration_seconds || 0,
          // Whether the expensive half has already been bought. The order panel
          // reads this to explain why the same video costs less the second time.
          already_read: !!doc.video_read_at,
        }
      : null,
    links: (doc.links || []).map((l) => ({ url: l.url, source: l.source, ok: !!l.ok })),
    links_readable: readable,
    text_chars: (doc.text || "").length,
    prompt: doc.prompt || "",
    lookup: !!doc.lookup,
    lookup_used: !!doc.lookup_used,
    lookup_reason: doc.lookup_reason || extra.lookup_reason || "",

    // ── The review step ─────────────────────────────────────────────────────
    // `draft` is a proposal and never material. `needs_review` is what gates
    // the order panel: while it is true there is nothing to price, because
    // nothing has been approved to write from yet.
    draft: doc.draft || "",
    draft_approved_at: doc.draft_approved_at || null,
    needs_review: !!doc.draft && !doc.draft_approved_at,
    sources_used: doc.sources_used || [],
    // Is there anything real to write from, or only the creator's own brief?
    // The one fact that decides which fact rule the writer gets, so the UI can
    // say plainly which kind of script this is going to be.
    //
    // A video counts even before it has been read. Its transcript arrives at
    // generation time, so `facts` is legitimately empty here, and reporting a
    // video-only Import as ungrounded would have the card tell the creator we
    // were about to write from their brief, over a screen where they never
    // wrote one.
    grounded: !!(doc.facts || "").trim() || !!doc.youtube?.video_id,
    created_at: doc.created_at,
  };
}

function firstLine(s) {
  const t = String(s || "").trim().split(/\r?\n/)[0] || "";
  return t.length > 90 ? `${t.slice(0, 87)}…` : t;
}

export default { buildSource, confirmDraft, redraft, shapeSource, describeVideo, SourceRejected };
