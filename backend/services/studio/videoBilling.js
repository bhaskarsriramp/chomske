/**
 * videoBilling.js: whether a video has been paid for, and the free first video.
 *
 * ── EVERY VIDEO IS PAID FOR ONCE (2026-10-03) ────────────────────────────────
 * A video costs its length at the video rate (creditPricing.js videoCredits,
 * one credit a second), charged once, by whichever comes first:
 *
 *   analysis   Clipo starting on it: "Zoom on clicks" or a product demo
 *   ai         an AI feature on a video opened unedited (captions, the voice,
 *              the chat, reading the screens, a product demo)
 *   export     its first export, for a video that was never paid otherwise
 *
 * Until then it plays with a moving watermark in the editor (Preview.js) and
 * cannot be exported. Paid, everything on it is included, exports up to 1440p
 * as often as wanted; only 4K costs more (exportExtraCredits).
 *
 * ── THE FREE FIRST VIDEO ─────────────────────────────────────────────────────
 * A first-time creator, one who has never bought credits and never recorded,
 * makes their first recording (up to TRIAL_SECONDS) with no credits at all:
 * Clipo edits it, the AI features work, it plays with the watermark. It is
 * paid for when they export it. One per account, stamped on the wallet when
 * the recording lands (claimTrial), so walking away from it half-edited does
 * not hand out a second. With the free video used and no credits, there is
 * nothing a new recording could become, so none is started (routes/studio.js
 * POST /demos).
 *
 * Videos from before 2026-10-03 have no `billing` and count as paid: they
 * were charged the old way, per analysis and per export.
 */
import StudioDemo from "../../models/StudioDemo.js";
import CreditWallet from "../../models/CreditWallet.js";
import CreditPayment from "../../models/CreditPayment.js";
import CreditLedger from "../../models/CreditLedger.js";
import { getWallet, spend, refund } from "../creditsService.js";
import { videoCredits, TRIAL_SECONDS } from "../creditPricing.js";

/** The ledger reason every studio charge is written under (demoService.js LEDGER_REASON). */
const REASON = "studio";

/**
 * How far past TRIAL_SECONDS a free video may run: the recorder stops a
 * moment early, and the file's own length differs from the browser's clock by
 * a frame or two either way.
 */
const TRIAL_SLACK = 3;

export const isPaid = (demo) => demo?.billing?.paid !== false;
export const isTrial = (demo) => !!demo?.billing?.trial && demo?.billing?.paid === false;
/** The video's price: its recorded length at the video rate. */
export const videoPrice = (demo) => videoCredits(Number(demo?.recording?.duration) || 0);

/**
 * Whether the free video covers this one right now: it is the trial, within
 * the trial's length. A length not yet measured (0) is covered; it is checked
 * again at every later step, by which time it is known.
 */
export function trialCovers(demo) {
  if (!isTrial(demo)) return false;
  return (Number(demo.recording?.duration) || 0) <= TRIAL_SECONDS + TRIAL_SLACK;
}

/**
 * What must be paid before this use of the video, in credits: nothing when it
 * is paid, nothing for the free video unless this is its export, otherwise
 * the video's price.
 */
export function owed(demo, { exporting = false } = {}) {
  if (isPaid(demo)) return 0;
  if (!exporting && trialCovers(demo)) return 0;
  return videoPrice(demo);
}

/** The start of the "needs N credits" sentence, for a 402 about this video. */
export function owedWhat(demo, { exporting = false } = {}) {
  if (isTrial(demo) && !exporting && !trialCovers(demo)) {
    return `Free videos can be up to ${TRIAL_SECONDS} seconds. This one`;
  }
  return exporting ? "Exporting this video" : "This video";
}

/**
 * Record that `credits`, already taken, paid for this video.
 *
 * ── ATOMIC ON paid: false ────────────────────────────────────────────────────
 * Captions and a voice asked for at the same instant both find the video
 * unpaid and both take its price. Only one write can flip it; the other
 * request's credits go straight back, and it carries on with a paid video.
 *
 * @returns {Promise<boolean>} whether this payment is the one that counts
 */
export async function markPaid(demo, { credits, via, ref = via, userId }) {
  const now = new Date();
  const r = await StudioDemo.updateOne(
    { _id: demo._id, "billing.paid": false },
    { $set: { "billing.paid": true, "billing.credits": credits, "billing.via": via, "billing.ref": ref, "billing.paid_at": now } }
  );
  if (r.modifiedCount === 1) {
    demo.billing = { ...(demo.billing || {}), paid: true, credits, via, ref, paid_at: now };
    return true;
  }
  await refund(userId || demo.user, credits, { refType: "StudioDemo", refId: demo._id, note: "already paid for" }).catch((err) =>
    console.error(`[studio] refund of a second payment failed for ${demo._id}:`, err.message)
  );
  return false;
}

/**
 * Back to unpaid: the job this payment started failed and its credits were
 * refunded. Only ever undoes the payment it names, never a later one.
 */
export async function unpay(demoId, { via, ref = via }) {
  await StudioDemo.updateOne(
    { _id: demoId, "billing.paid": true, "billing.via": via, "billing.ref": ref },
    { $set: { "billing.paid": false, "billing.credits": 0, "billing.via": "", "billing.ref": "", "billing.paid_at": null } }
  );
}

/**
 * Pay for the video if it is owed, before an AI feature runs on it.
 * @throws {InsufficientCredits} when the balance will not cover it; nothing is taken
 * @returns {Promise<number>} the credits that paid for it, 0 when nothing was owed
 */
export async function payIfOwed(userId, demo, { via = "ai", ref = via } = {}) {
  // A recording whose length is not measured yet (a product demo asked for
  // while it uploads) has no price yet: the analysis that follows charges it.
  if (!(Number(demo.recording?.duration) > 0)) return 0;
  const price = owed(demo);
  if (!price) return 0;
  await spend(userId, price, { reason: REASON, refType: "StudioDemo", refId: demo._id, note: `video, paid at ${via}` });
  return (await markPaid(demo, { credits: price, via, ref, userId })) ? price : 0;
}

/** Whether this account has ever bought credits. */
export async function hasPurchased(userId, wallet = null) {
  const w = wallet || (await getWallet(userId));
  if ((Number(w?.lifetime_purchased) || 0) > 0) return true;
  return !!(await CreditPayment.exists({ user: userId, status: "success" }));
}

/**
 * The free first video, as this account stands.
 *
 * @param {{ except?: any }} o  a recording to leave out of "has recorded
 *   before": the one being completed, when it is being asked about itself
 * @returns {{ available, demo, paid, seconds }}
 *   available  the next recording will be it
 *   demo       the address (slug or id) of the recording it went to, once it has
 *   paid       whether that recording has since been paid for
 */
export async function trialState(userId, { except = null } = {}) {
  const wallet = await getWallet(userId);
  const base = { available: false, demo: null, paid: false, seconds: TRIAL_SECONDS };
  if (wallet?.trial_demo) {
    const d = await StudioDemo.findById(wallet.trial_demo).select("billing slug purged").lean();
    if (!d || d.purged) return base;
    return { ...base, demo: d.slug || String(d._id), paid: isPaid(d) };
  }
  if (await hasPurchased(userId, wallet)) return base;
  const recorded = await StudioDemo.exists({
    user: userId,
    ...(except ? { _id: { $ne: except } } : {}),
    "recording.status": { $in: ["uploaded", "processing", "ready"] },
  });
  if (recorded) return base;
  // Recordings can be deleted; what they were charged cannot.
  if (await CreditLedger.exists({ user: userId, reason: REASON })) return base;
  return { ...base, available: true };
}

/**
 * Give the free video to this recording, if the account still has it. Called
 * when a recording lands. Once per account, ever: the wallet's `trial_demo`
 * is set only where it is still empty.
 * @returns {Promise<boolean>}
 */
export async function claimTrial(userId, demo) {
  const t = await trialState(userId, { except: demo._id });
  if (!t.available) return false;
  const r = await CreditWallet.updateOne(
    { user: userId, trial_demo: null },
    { $set: { trial_demo: demo._id, trial_at: new Date() } }
  );
  if (r.modifiedCount !== 1) return false;
  await StudioDemo.updateOne({ _id: demo._id }, { $set: { "billing.trial": true, "billing.paid": false } });
  demo.billing = { ...(demo.billing || {}), trial: true, paid: false };
  console.log(`[studio] free first video for user=${userId}: ${demo._id}`);
  return true;
}

export default {
  isPaid, isTrial, videoPrice, trialCovers, owed, owedWhat, markPaid, unpay, payIfOwed,
  hasPurchased, trialState, claimTrial,
};
