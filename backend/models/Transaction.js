// models/BankDetails.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const Transaction_Schema = new Schema(
  {
   userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
  userEmail: String,
  userName: String,

  productId: { type: String, index: true },
  productTitle: String,
  productImage: String,
  subdomain: String,

  customer: {
  name: String,
  email: String,
  phone: String,
},


paymentMethod: {
  type: { type: String },        // 'card' | 'netbanking' | 'upi' | 'wallet' | 'emi' | ...
  bank: String,                  // for netbanking
  wallet: String,                // for wallet
  vpa: String,                   // for UPI (mask is fine)
  card: {
    last4: String,
    network: String,             // VISA/MASTERCARD/etc.
    issuer: String,
    type: String,                // credit/debit/prepaid
    international: Boolean
  }
},

cancelledAt: {
  type: Date,
  default: null
},
cancellationReason: {
  type: String,
  default: null
},


customerBookingId: { type: String, unique: true, sparse: true, index: true },


razorpay: {
  order: Object,                 // full order object (rawOrder already stored)
  payment: Object                // store full payment object for audit
},

  orderId: { type: String, required: true, unique: true, index: true },
  paymentId: { type: String },
  signature: { type: String },

  amount: { type: Number, required: true },     // paise
  currency: { type: String, default: "INR" },

  status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },

  rawOrder: { type: Object },
  rawVerifyPayload: { type: Object },

  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date }
  },
);

Transaction_Schema.index({ userId: 1, subdomain: 1, status: 1  });

// Paid transactions analytics with date range
Transaction_Schema.index({ userId: 1, status: 1, cancelledAt: 1, createdAt: -1 });

const TransactionsModel = mongoose.models.transactions || mongoose.model("transactions", Transaction_Schema);
export default TransactionsModel;
