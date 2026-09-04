import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * CreditLedger — every credit that ever moved, and why.
 *
 * ── WHY A LEDGER AND NOT JUST A BALANCE ─────────────────────────────────────
 * The first support email will be "I bought 700 credits and I have 340, where
 * did they go?" Without this, the honest answer is "I don't know", and the only
 * fix is to hand back credits and hope. With it, the answer is a list of dated
 * lines. The balance on the wallet is a running total of these rows; if the two
 * ever disagree, THIS is the one to trust and the wallet is what gets repaired.
 *
 * Append-only by convention: nothing in the codebase updates or deletes a row
 * here. A correction is a new row with a positive or negative delta, exactly
 * as an accountant would do it — because a mutable audit trail audits nothing.
 */
const CreditLedgerSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  // Positive = credits in, negative = credits out. Signed so the sum of this
  // column IS the balance, which makes reconciliation one aggregation.
  delta: { type: Number, required: true },

  // What happened. "signup" and "purchase" add; "script" and "packaging" spend;
  // "refund" returns credits for work that failed after it was charged;
  // "adjustment" is a human fixing something by hand.
  reason: {
    type: String,
    required: true,
    enum: ["signup", "purchase", "script", "packaging", "refund", "adjustment"],
    index: true,
  },

  // Balance immediately AFTER this row was applied. Denormalised on purpose:
  // it turns "what did they have at 3pm on Tuesday" into a lookup instead of a
  // replay of every prior row, and it makes a corrupted balance obvious.
  balance_after: { type: Number, required: true },

  // What it was spent on or paid for — a Script id, a CreditPayment id. Kept
  // loose because it points at different collections depending on `reason`.
  ref_type: { type: String, default: "" },
  ref_id:   { type: Schema.Types.ObjectId, default: null },

  // Human-readable, for the support conversation: "60s script + English twin".
  note: { type: String, default: "" },

  created_at: { type: Date, default: Date.now, index: true },
});

// The support query: this user's history, newest first.
CreditLedgerSchema.index({ user: 1, created_at: -1 });

export default mongoose.models.CreditLedger ||
  mongoose.model("CreditLedger", CreditLedgerSchema, "credit_ledger");
