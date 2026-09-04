/**
 * billing.js — buying credits.
 *
 * Razorpay, in INR, because the buyer is an Indian creator and INR is what
 * surfaces UPI. Card-only checkout in a market that runs on UPI is a checkout
 * most people abandon.
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
import Razorpay from "razorpay";
import CreditPayment from "../models/CreditPayment.js";
import { PACKS, getPack, DURATION_PRESETS, SECONDS_PER_CREDIT, MIN_SECONDS, MAX_SECONDS, PACKAGING_CREDITS, ENGLISH_TWIN_RATE, quote } from "../services/creditPricing.js";
import { getBalance, grant, history } from "../services/creditsService.js";
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();

const RZP_KEY_ID = String(process.env.RZP_KEY_ID || "").trim();
const RZP_KEY_SECRET = String(process.env.RZP_KEY_SECRET || "").trim();

// Built lazily so the server still boots without payment keys — the rest of the
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
 * GET /billing/packs — the price list, plus the rules that produced it.
 *
 * The frontend renders whatever this returns and hardcodes no rupee figure.
 * A price that lives in two places disagrees eventually, and the version the
 * customer sees is the one they hold you to.
 */
router.get("/packs", authenticateToken, async (req, res) => {
  return res.json({
    success: true,
    configured: isBillingConfigured(),
    currency: "INR",
    packs: PACKS.map((p) => ({
      ...p,
      // Shown as "≈ ₹21 per 60s script", which is the comparison a creator
      // actually makes — against what they pay an editor, not per credit.
      per_short_inr: +(p.inr / (p.credits / (60 / SECONDS_PER_CREDIT))).toFixed(1),
      shorts: Math.floor(p.credits / (60 / SECONDS_PER_CREDIT)),
    })),
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

/** GET /billing/wallet — balance and recent movements. */
router.get("/wallet", authenticateToken, async (req, res) => {
  try {
    const [balance, rows] = await Promise.all([
      getBalance(req.user.id),
      history(req.user.id, 25),
    ]);
    return res.json({ success: true, balance, history: rows });
  } catch (err) {
    console.error("[billing] wallet failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't read your credits." });
  }
});

/**
 * GET /billing/quote?seconds=60&english=1&packaging=1
 *
 * What a job would cost, before committing to it. The script screen calls this
 * as the duration slider moves, so the price is on screen before the button is
 * pressed rather than as a surprise afterwards.
 */
router.get("/quote", authenticateToken, async (req, res) => {
  const q = quote({
    seconds: req.query.seconds,
    englishTwin: req.query.english === "1" || req.query.english === "true",
    packaging: req.query.packaging === "1" || req.query.packaging === "true",
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

    const pack = getPack(req.body?.pack_id);
    if (!pack) return res.status(400).json({ success: false, message: "Unknown pack." });

    const order = await rz.orders.create({
      // Razorpay counts in paise. A rupee figure sent here charges 1/100th of
      // the intended amount — the classic way to give a product away.
      amount: pack.inr * 100,
      currency: "INR",
      receipt: `lipi_${String(req.user.id).slice(-8)}_${Date.now().toString(36)}`,
      notes: { userId: String(req.user.id), pack_id: pack.id, credits: String(pack.credits) },
    });

    await CreditPayment.create({
      user: req.user.id,
      pack_id: pack.id,
      credits: pack.credits,
      amount_inr: pack.inr,
      rzp_order_id: order.id,
      status: "initiated",
    });

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,        // paise, for the checkout widget
      currency: order.currency,
      key_id: RZP_KEY_ID,          // publishable; the secret never leaves the server
      pack: { id: pack.id, label: pack.label, credits: pack.credits, inr: pack.inr },
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
 * The client can call this twice — a double-click, a retry after a timeout, a
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
      // Either already granted (a retry — answer success, the credits are
      // there) or no such order for this user (answer honestly).
      const existing = await CreditPayment.findOne({ rzp_order_id: order_id, user: req.user.id }).lean();
      if (existing?.status === "success") {
        return res.json({ success: true, already_granted: true, balance: await getBalance(req.user.id) });
      }
      return res.status(404).json({ success: false, message: "We couldn't find that order." });
    }

    const { balance } = await grant(req.user.id, claimed.credits, {
      reason: "purchase",
      refType: "CreditPayment",
      refId: claimed._id,
      note: `${claimed.pack_id} pack · ₹${claimed.amount_inr}`,
    });

    console.log(`[billing] +${claimed.credits} credits user=${req.user.id} pack=${claimed.pack_id} ₹${claimed.amount_inr}`);
    return res.json({ success: true, credits_added: claimed.credits, balance });
  } catch (err) {
    console.error("[billing] verify failed:", err);
    return res.status(500).json({ success: false, message: "Something went wrong confirming that payment." });
  }
});

/**
 * POST /billing/abandoned  { order_id }
 * The modal was closed without paying. Best-effort bookkeeping only — it keeps
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
