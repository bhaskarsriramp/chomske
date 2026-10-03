/**
 * billing.js: buying credits.
 *
 * Razorpay, in two currencies (2026-10-03). Inside India in INR, because INR is
 * what surfaces UPI, and card-only checkout in a market that runs on UPI is a
 * checkout most people abandon. Everywhere else in USD, on international cards
 * (the Razorpay account needs International Payments switched on). Which one
 * is decided on the server from where the request comes from (services/geo.js),
 * the same way betaFounderProduction does it.
 *
 * ── THE FLOW, AND WHY IT IS TWO CALLS ───────────────────────────────────────
 *   POST /billing/order   we create a Razorpay order and record it as
 *                         "initiated" BEFORE the user sees the modal
 *   (user pays in the Razorpay modal, on their bank's page)
 *   POST /billing/verify  we check the signature and grant the credits
 *
 * The record is written at order time, not on success, so a payment that fails
 * at the bank, is abandoned at the modal, or succeeds while our verify call
 * times out still leaves a row. "The money left my account" has to be
 * answerable, and it is only answerable if we wrote something down before the
 * money moved.
 *
 * ── WHAT THE CLIENT IS NEVER TRUSTED WITH ───────────────────────────────────
 * The amount. The client sends a pack id; the price and the credit count are
 * read from services/creditPricing.js on the server. A frontend is a file
 * anyone can edit in their own browser, and "amount" in a request body is a
 * suggestion, not a fact.
 *
 * Mirrors the reference project's LTD flow (betaFounderProduction
 * routes/usersOn.js): server-decided price, order row up front, HMAC check on
 * `order_id|payment_id`, idempotent grant.
 */
import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import CreditPayment from "../models/CreditPayment.js";
import Source from "../models/Source.js";
import { PACKS, getPack, packPrice, CUSTOM, creditRate, customCredits, CREDITS_PER_MINUTE, FOURK_CREDITS_PER_MIN, DURATION_PRESETS, SECONDS_PER_CREDIT, MIN_SECONDS, MAX_SECONDS, PACKAGING_CREDITS, ENGLISH_TWIN_RATE, quote } from "../services/creditPricing.js";
import { detectCountry, currencyFor } from "../services/geo.js";
import { trialState, hasPurchased } from "../services/studio/videoBilling.js";
import { getBalance, grant, history } from "../services/creditsService.js";
import authenticateToken, { authenticateAny } from "../middleware/authenticateToken.js";

const router = express.Router();

const RZP_KEY_ID = String(process.env.RZP_KEY_ID || "").trim();
const RZP_KEY_SECRET = String(process.env.RZP_KEY_SECRET || "").trim();

// Built lazily so the server still boots without payment keys, the rest of the
// product works fine, only buying is unavailable, and a missing key should not
// take down news collection and script writing with it.
let _rz = null;
function razorpay() {
  if (!RZP_KEY_ID || !RZP_KEY_SECRET) return null;
  if (!_rz) _rz = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET });
  return _rz;
}

export function isBillingConfigured() {
  return !!(RZP_KEY_ID && RZP_KEY_SECRET);
}

/**
 * GET /billing/packs, the price list, plus the rules that produced it.
 *
 * The frontend renders whatever this returns and hardcodes no rupee figure.
 * A price that lives in two places disagrees eventually, and the version the
 * customer sees is the one they hold you to.
 */
router.get("/packs", authenticateToken, async (req, res) => {
  // ₹ with UPI inside India, $ everywhere else (services/geo.js). The order
  // route places the buyer again for itself; this is only what to show.
  const country = detectCountry(req, req.query.country_hint);
  const currency = currencyFor(country);
  const perMinute = CREDITS_PER_MINUTE;
  return res.json({
    success: true,
    configured: isBillingConfigured(),
    country,
    currency,
    // How each currency can be paid. A rupee order is what makes Razorpay
    // offer UPI; a dollar one takes international cards.
    methods: currency === "INR" ? ["upi", "card", "netbanking"] : ["card"],
    packs: PACKS.map((p) => ({
      id: p.id,
      label: p.label,
      popular: !!p.popular,
      credits: p.credits,
      price: packPrice(p, currency),
      currency,
      // Shown as "5 minutes of video", the thing a credit actually buys.
      minutes: +(p.credits / perMinute).toFixed(1),
      inr: p.inr,
    })),
    video: {
      credits_per_minute: perMinute,
      fourk_credits_per_min: FOURK_CREDITS_PER_MIN,
      // A minute of video in this currency, from the smallest pack.
      price_per_minute: +((packPrice(PACKS[0], currency) * perMinute) / PACKS[0].credits).toFixed(2),
    },
    // Any amount instead of a pack: whole units between min and max, at this
    // rate (credits per `per` units), rounded down. The order works it out
    // again for itself; this is only for showing it as the buyer types.
    custom: { ...CUSTOM[currency], currency, rate: creditRate(currency) },
    rules: {
      seconds_per_credit: SECONDS_PER_CREDIT,
      min_seconds: MIN_SECONDS,
      max_seconds: MAX_SECONDS,
      english_twin_rate: ENGLISH_TWIN_RATE,
      packaging_credits: PACKAGING_CREDITS,
      never_expire: true,
    },
    durations: DURATION_PRESETS.map((d) => ({ ...d, credits: quote({ seconds: d.seconds }).total })),
  });
});

/** GET /billing/wallet, balance and recent movements. */
router.get("/wallet", authenticateAny, async (req, res) => {
  try {
    const [balance, rows, trial, purchased] = await Promise.all([
      getBalance(req.user.id),
      history(req.user.id, 25),
      // The free first video (services/studio/videoBilling.js): whether the
      // next recording is it, or which recording it went to.
      trialState(req.user.id).catch(() => null),
      // Whether this account has ever bought credits: the sidebar shows a
      // balance only to someone who has, so a first-time creator is never
      // greeted with "0 credits" before they have tried anything.
      hasPurchased(req.user.id).catch(() => false),
    ]);
    return res.json({ success: true, balance, history: rows, trial, purchased });
  } catch (err) {
    console.error("[billing] wallet failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't read your credits." });
  }
});

/**
 * GET /billing/quote?seconds=60&english=1&packaging=1&source_id=…
 *
 * What a job would cost, before committing to it. The script screen calls this
 * as the duration slider moves, so the price is on screen before the button is
 * pressed rather than as a surprise afterwards.
 *
 * ── WHY THE SOURCE IS AN ID AND NOT A SET OF NUMBERS ────────────────────────
 * Reading a ten minute video costs more than reading a ninety second one, so
 * Import and Idea orders carry a price the duration slider alone cannot
 * predict. The client sends the id of the material it has already prepared and
 * the server prices it from the stored document: how long the video actually
 * is, whether it has been read before, whether a lookup found anything.
 *
 * Every one of those is a fact we established during the preview, and none of
 * them may come from the request. `videoSeconds=90` in a query string is a
 * suggestion, and a client that suggested it would be reading ten minutes of
 * video at the two minute price, in exactly the same way `amount` in an order
 * body would be buying a Studio pack for a rupee.
 */
router.get("/quote", authenticateAny, async (req, res) => {
  // ── THE SOURCE HALF IS PRICED FROM THE STORED DOCUMENT ───────────────────
  // Never from the request. What a video costs depends on how long it is, and
  // "how long is it" is a fact we bought from apidirect during the preview;
  // taking the client's word for it would let a hand-rolled call read a ten
  // minute video at the thirty second price.
  let source = null;

  const sourceId = String(req.query.source_id || "");
  if (sourceId && mongoose.Types.ObjectId.isValid(sourceId)) {
    // Scoped to the caller, like every other read of this collection.
    const doc = await Source.findOne({ _id: sourceId, user: req.user.id })
      .select("youtube.duration_seconds video_read_at lookup_used")
      .lean()
      .catch(() => null);
    if (doc) {
      source = {
        videoSeconds: doc.youtube?.duration_seconds || 0,
        lookup: !!doc.lookup_used,
        alreadyRead: !!doc.video_read_at,
      };
    }
  }

  const q = quote({
    seconds: req.query.seconds,
    englishTwin: req.query.english === "1" || req.query.english === "true",
    packaging: req.query.packaging === "1" || req.query.packaging === "true",
    source,
  });
  const balance = await getBalance(req.user.id).catch(() => 0);
  return res.json({ success: true, ...q, balance, affordable: balance >= q.total });
});

/**
 * POST /billing/order  { pack_id }
 *
 * Creates the Razorpay order. The rupee amount comes from the pack table here,
 * never from the request.
 */
router.post("/order", authenticateToken, async (req, res) => {
  try {
    const rz = razorpay();
    if (!rz) {
      return res.status(503).json({ success: false, message: "Payments aren't set up yet. Please try again later." });
    }

    // Placed here, on the server, from the request itself: never from a
    // currency the browser names. See services/geo.js.
    const country = detectCountry(req, req.body?.country_hint);
    const currency = currencyFor(country);

    // A pack, or an amount the buyer typed. Either way the price and the
    // credits are decided here: a typed amount is checked against this
    // currency's limits and turned into credits at the pack rate.
    let pack;
    if (req.body?.amount !== undefined && req.body?.amount !== null && req.body?.amount !== "") {
      const amount = Number(req.body.amount);
      const credits = customCredits(amount, currency);
      if (!credits) {
        const lim = CUSTOM[currency];
        const unit = (n) => (currency === "INR" ? `₹${n.toLocaleString("en-IN")}` : `$${n.toLocaleString("en-US")}`);
        return res.status(400).json({
          success: false,
          message: `Enter a whole amount from ${unit(lim.min)} to ${unit(lim.max)}.`,
        });
      }
      pack = { id: "custom", label: "Credits", credits, inr: amount, usd: amount };
    } else {
      pack = getPack(req.body?.pack_id);
      if (!pack) return res.status(400).json({ success: false, message: "Unknown pack." });
    }
    const price = packPrice(pack, currency);

    let order;
    try {
      order = await rz.orders.create({
        // Razorpay counts in the smallest unit, paise or cents. A whole-rupee
        // figure sent here charges 1/100th of the intended amount, the classic
        // way to give a product away.
        amount: Math.round(price * 100),
        currency,
        receipt: `lipi_${String(req.user.id).slice(-8)}_${Date.now().toString(36)}`,
        notes: { userId: String(req.user.id), pack_id: pack.id, credits: String(pack.credits), country },
      });
    } catch (err) {
      // A dollar order on an account without international payments switched
      // on is refused here, by Razorpay; say so plainly rather than "try again".
      const why = String(err?.error?.description || err?.message || "");
      console.error(`[billing] Razorpay refused a ${currency} order (${country || "unknown country"}): ${why}`);
      return res.status(502).json({
        success: false,
        message: currency === "USD"
          ? "Card payments from your country aren't available just yet. Please try again later."
          : "Couldn't start the payment. Please try again.",
      });
    }

    await CreditPayment.create({
      user: req.user.id,
      pack_id: pack.id,
      credits: pack.credits,
      currency,
      amount: price,
      amount_inr: currency === "INR" ? price : 0,
      country,
      rzp_order_id: order.id,
      status: "initiated",
    });

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,        // paise or cents, for the checkout widget
      currency: order.currency,
      key_id: RZP_KEY_ID,          // publishable; the secret never leaves the server
      pack: { id: pack.id, label: pack.label, credits: pack.credits, price, currency },
    });
  } catch (err) {
    console.error("[billing] order failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't start the payment. Please try again." });
  }
});

/**
 * POST /billing/verify  { order_id, payment_id, signature }
 *
 * ── THE SIGNATURE IS THE WHOLE SECURITY MODEL ───────────────────────────────
 * Razorpay signs `order_id|payment_id` with our key secret. Anyone can POST
 * this endpoint claiming a payment succeeded; only Razorpay can produce a
 * signature that matches. Verified with timingSafeEqual rather than `!==`,
 * because a plain string compare returns early on the first wrong byte and
 * leaks, over many attempts, how much of a guess was right.
 *
 * ── AND IT MUST GRANT ONLY ONCE ─────────────────────────────────────────────
 * The client can call this twice, a double-click, a retry after a timeout, a
 * refresh. The guard is a conditional update on the payment row: flip
 * initiated → success and grant only if we were the one who flipped it.
 */
router.post("/verify", authenticateToken, async (req, res) => {
  try {
    const { order_id, payment_id, signature } = req.body || {};
    if (!order_id || !payment_id || !signature) {
      return res.status(400).json({ success: false, message: "Missing payment details." });
    }
    if (!RZP_KEY_SECRET) {
      return res.status(503).json({ success: false, message: "Payments aren't set up yet." });
    }

    const expected = crypto
      .createHmac("sha256", RZP_KEY_SECRET)
      .update(`${order_id}|${payment_id}`)
      .digest("hex");

    const given = String(signature);
    const ok =
      given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));

    if (!ok) {
      await CreditPayment.updateOne(
        { rzp_order_id: order_id, user: req.user.id, status: "initiated" },
        { $set: { status: "failed", failure_reason: "signature mismatch", updated_at: new Date() } }
      ).catch(() => {});
      console.error(`[billing] SIGNATURE MISMATCH order=${order_id} user=${req.user.id}`);
      return res.status(400).json({ success: false, message: "We couldn't verify that payment." });
    }

    // Claim the grant. Matching on status "initiated" means the second caller
    // matches nothing and grants nothing.
    const claimed = await CreditPayment.findOneAndUpdate(
      { rzp_order_id: order_id, user: req.user.id, status: "initiated" },
      {
        $set: {
          status: "success",
          rzp_payment_id: payment_id,
          rzp_signature: signature,
          granted_at: new Date(),
          updated_at: new Date(),
        },
      },
      { new: true }
    );

    if (!claimed) {
      // Either already granted (a retry, answer success, the credits are
      // there) or no such order for this user (answer honestly).
      const existing = await CreditPayment.findOne({ rzp_order_id: order_id, user: req.user.id }).lean();
      if (existing?.status === "success") {
        return res.json({ success: true, already_granted: true, balance: await getBalance(req.user.id) });
      }
      return res.status(404).json({ success: false, message: "We couldn't find that order." });
    }

    const paid = claimed.currency === "USD"
      ? `$${Number(claimed.amount).toLocaleString("en-US")}`
      : `₹${Number(claimed.amount || claimed.amount_inr).toLocaleString("en-IN")}`;
    const { balance } = await grant(req.user.id, claimed.credits, {
      reason: "purchase",
      refType: "CreditPayment",
      refId: claimed._id,
      note: claimed.pack_id === "custom" ? `${claimed.credits} credits · ${paid}` : `${claimed.pack_id} pack · ${paid}`,
    });

    console.log(`[billing] +${claimed.credits} credits user=${req.user.id} pack=${claimed.pack_id} ${paid}`);
    return res.json({ success: true, credits_added: claimed.credits, balance });
  } catch (err) {
    console.error("[billing] verify failed:", err);
    return res.status(500).json({ success: false, message: "Something went wrong confirming that payment." });
  }
});

/**
 * POST /billing/abandoned  { order_id }
 * The modal was closed without paying. Best-effort bookkeeping only, it keeps
 * "initiated" rows from looking like payments that vanished.
 */
router.post("/abandoned", authenticateToken, async (req, res) => {
  await CreditPayment.updateOne(
    { rzp_order_id: String(req.body?.order_id || ""), user: req.user.id, status: "initiated" },
    { $set: { status: "abandoned", updated_at: new Date() } }
  ).catch(() => {});
  return res.json({ success: true });
});

export default router;
