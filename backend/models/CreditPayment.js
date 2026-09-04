import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * CreditPayment — one row per Razorpay order, successful or not.
 *
 * Same shape and reasoning as the reference project's LtdPayment: a record is
 * written when the order is CREATED, not when it succeeds, so a payment that
 * fails, is abandoned at the modal, or succeeds at the bank while our verify
 * call times out still leaves a trace. Without that, a creator saying "the
 * money left my account" is unanswerable.
 *
 *   initiated → success    signature verified, credits granted
 *             → failed     bank declined, or verification failed
 *             → abandoned  modal closed without paying
 *
 * ── THE AMOUNT IS SERVER-DECIDED ─────────────────────────────────────────────
 * `credits` and `amount_inr` are copied from the PACK definition at order time,
 * never from the request body. The client sends a pack id and nothing else. A
 * client that could name its own price would, and the frontend is a file
 * anybody can edit in their own browser.
 */
const CreditPaymentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  pack_id: { type: String, required: true },      // starter | creator | studio
  credits: { type: Number, required: true },      // what a successful payment grants
  amount_inr: { type: Number, required: true },   // rupees, not paise

  // ── Razorpay ──────────────────────────────────────────────────────────────
  // Unique, and that uniqueness is load-bearing: it is what stops the same
  // order being verified twice and granting credits twice.
  rzp_order_id:   { type: String, required: true, unique: true, index: true },
  rzp_payment_id: { type: String, default: null },
  rzp_signature:  { type: String, default: null },

  status: {
    type: String,
    enum: ["initiated", "success", "failed", "abandoned"],
    default: "initiated",
    index: true,
  },
  failure_reason: { type: String, default: "" },

  // When the credits actually landed. Null on anything but a success, and the
  // second guard against double-granting.
  granted_at: { type: Date, default: null },

  created_at: { type: Date, default: Date.now, index: true },
  updated_at: { type: Date, default: Date.now },
});

export default mongoose.models.CreditPayment ||
  mongoose.model("CreditPayment", CreditPaymentSchema, "credit_payments");
