/**
 * creditsService.js — the only place credits move.
 *
 * Every grant and every spend goes through here. Routes never touch
 * CreditWallet directly, because the correctness of this system is entirely in
 * HOW the balance is written, and that argument only holds if there is one
 * writer.
 *
 * ── THE RULE: NEVER READ THEN WRITE ─────────────────────────────────────────
 * The obvious implementation is "read the balance, check it's enough, subtract,
 * save". It is also wrong. Two script requests from the same account arriving
 * together both read 30, both decide 30 ≥ 23, and both write 7 — two scripts
 * for the price of one, forever, for anyone who double-clicks. It is not a rare
 * race: the frontend can fire it by itself on a slow connection.
 *
 * So a spend is ONE conditional update — match this user AND a balance at least
 * the cost, decrement in the same operation. Mongo applies it atomically. If it
 * matches nothing, the balance was insufficient at that instant and no credits
 * moved. There is no window between the check and the write because there is no
 * check; the match IS the check.
 */
import mongoose from "mongoose";
import CreditWallet from "../models/CreditWallet.js";
import CreditLedger from "../models/CreditLedger.js";
import { SIGNUP_FREE_CREDITS } from "./creditPricing.js";

export class InsufficientCredits extends Error {
  constructor(needed, balance) {
    super(`Needs ${needed} credits, has ${balance}`);
    this.name = "InsufficientCredits";
    this.needed = needed;
    this.balance = balance;
  }
}

/**
 * The wallet for this user, created if missing, with the signup grant applied
 * exactly once.
 *
 * `signup_granted_at` in $setOnInsert is what makes the grant single: on the
 * insert it is stamped and the credits are included; on every later call the
 * upsert matches an existing row and $setOnInsert does nothing at all. Two
 * simultaneous first-requests cannot both insert — the unique index on `user`
 * rejects the loser, which is caught below and re-read.
 */
export async function getWallet(userId) {
  const now = new Date();
  try {
    return await CreditWallet.findOneAndUpdate(
      { user: userId },
      {
        $setOnInsert: {
          user: userId,
          balance: SIGNUP_FREE_CREDITS,
          lifetime_purchased: 0,
          lifetime_spent: 0,
          signup_granted_at: now,
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // 11000 = the other request created it a microsecond earlier. Theirs is as
    // good as ours; read it back.
    if (err?.code === 11000) return CreditWallet.findOne({ user: userId });
    throw err;
  }
}

/** Balance only — the number the header shows on every page load. */
export async function getBalance(userId) {
  const w = await getWallet(userId);
  return w?.balance ?? 0;
}

/**
 * Take credits for work about to be done.
 *
 * @throws {InsufficientCredits} when the balance will not cover it — nothing is
 *   written, so the caller can answer with a "top up" prompt and no cleanup.
 * @returns {{ balance, spent }} the balance AFTER the spend
 */
export async function spend(userId, amount, { reason = "script", refType = "", refId = null, note = "" } = {}) {
  const cost = Math.ceil(Number(amount) || 0);
  if (cost <= 0) return { balance: await getBalance(userId), spent: 0 };

  await getWallet(userId);   // ensures the row (and the signup grant) exists

  // THE atomic operation. `balance: { $gte: cost }` in the FILTER is the whole
  // safety argument — a balance that dropped between this call and the last
  // read simply fails to match, and no credits move.
  const wallet = await CreditWallet.findOneAndUpdate(
    { user: userId, balance: { $gte: cost } },
    { $inc: { balance: -cost, lifetime_spent: cost }, $set: { updated_at: new Date() } },
    { new: true }
  );

  if (!wallet) {
    const balance = await getBalance(userId);
    throw new InsufficientCredits(cost, balance);
  }

  // Written after the fact deliberately. If this insert fails the creator has
  // still been charged correctly and their script still runs; a missing audit
  // row is a support inconvenience, where refusing the work over one would be a
  // paid-for script that never arrives.
  await CreditLedger.create({
    user: userId,
    delta: -cost,
    reason,
    balance_after: wallet.balance,
    ref_type: refType,
    ref_id: refId,
    note,
  }).catch((err) => console.error("[credits] ledger write failed (spend):", err.message));

  return { balance: wallet.balance, spent: cost };
}

/**
 * Put credits in — a purchase, or a refund for work that failed after billing.
 *
 * Unconditional: there is no balance a grant can fail against. The caller is
 * responsible for making sure it happens once (see verifyAndGrant in
 * routes/billing.js, where the Razorpay order id is the idempotency key).
 */
export async function grant(userId, amount, { reason = "purchase", refType = "", refId = null, note = "" } = {}) {
  const credits = Math.ceil(Number(amount) || 0);
  if (credits <= 0) return { balance: await getBalance(userId), granted: 0 };

  await getWallet(userId);

  const inc = { balance: credits };
  // Only real money bought counts toward lifetime_purchased — refunds and
  // hand-adjustments would otherwise inflate the one number used to answer
  // "what has this account actually paid us".
  if (reason === "purchase") inc.lifetime_purchased = credits;

  const wallet = await CreditWallet.findOneAndUpdate(
    { user: userId },
    { $inc: inc, $set: { updated_at: new Date() } },
    { new: true }
  );

  await CreditLedger.create({
    user: userId,
    delta: credits,
    reason,
    balance_after: wallet.balance,
    ref_type: refType,
    ref_id: refId,
    note,
  }).catch((err) => console.error("[credits] ledger write failed (grant):", err.message));

  return { balance: wallet.balance, granted: credits };
}

/**
 * Give back credits for a job that was charged and then failed.
 *
 * Called from the script runner's failure path. A creator who was billed for a
 * script that errored and has to email us to get 30 credits back will not be a
 * creator for long, and the alternative — charging only on success — means
 * every failure is a free retry loop against a metered model.
 */
export async function refund(userId, amount, { refType = "", refId = null, note = "" } = {}) {
  return grant(userId, amount, { reason: "refund", refType, refId, note });
}

/** Recent movements, for the wallet screen and for answering support. */
export async function history(userId, limit = 25) {
  return CreditLedger.find({ user: userId })
    .sort({ created_at: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .select("delta reason balance_after note created_at")
    .lean();
}

/**
 * Does the stored balance match the sum of the ledger?
 *
 * Not called in the request path — this is for a support script or a nightly
 * check. If these ever disagree the ledger is right by definition (it is the
 * append-only record) and the wallet is what gets repaired.
 */
export async function reconcile(userId) {
  const [agg] = await CreditLedger.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
    { $group: { _id: null, sum: { $sum: "$delta" } } },
  ]);
  const ledgerSum = agg?.sum ?? 0;
  const wallet = await CreditWallet.findOne({ user: userId }).lean();
  const balance = wallet?.balance ?? 0;
  return { balance, ledgerSum, ok: balance === ledgerSum, drift: balance - ledgerSum };
}

export default { getWallet, getBalance, spend, grant, refund, history, reconcile, InsufficientCredits };
