import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * CreditWallet — one row per creator, holding the balance.
 *
 * ── WHY THE BALANCE IS NOT A FIELD ON User ──────────────────────────────────
 * Because it is money, and it is written concurrently. Two script requests
 * arriving together must not both read "30 credits" and both succeed. The spend
 * is done as a single conditional update (see services/creditsService.js) —
 * match only when the balance is high enough, and decrement in the same
 * operation — which is atomic in Mongo and impossible to race. Keeping it on
 * its own tiny document means that one write never contends with a profile
 * edit or a login stamping last_seen_at.
 *
 * ── CREDITS NEVER EXPIRE ────────────────────────────────────────────────────
 * There is deliberately no expiry field here and no cron to add one. The
 * pricing exists because creators are tired of subscriptions and of credits
 * that quietly evaporate; an expiry would be the same trick wearing a different
 * hat, and it is the one promise on the pricing page that costs nothing to keep.
 *
 * The two lifetime_* counters are never used for spending decisions — the
 * balance is the truth. They exist so "what has this account bought, ever"
 * is one read rather than a scan of the ledger.
 */
const CreditWalletSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

  // Always an integer. There is no such thing as half a credit anywhere in this
  // system — see quote() in services/creditPricing.js, which rounds up.
  balance: { type: Number, required: true, default: 0, min: 0 },

  lifetime_purchased: { type: Number, default: 0 },
  lifetime_spent:     { type: Number, default: 0 },

  // Stamped once, so the signup grant can never be handed out twice — even if
  // two requests race to create the wallet.
  signup_granted_at: { type: Date, default: null },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

export default mongoose.models.CreditWallet ||
  mongoose.model("CreditWallet", CreditWalletSchema, "credit_wallets");
