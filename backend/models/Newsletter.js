// models/newsletters.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const EmailEntrySchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    subscribed_at: { type: Date, default: Date.now },
    ip: { type: String, required: false },
    referrer: { type: String, required: false },
    country: { type: String, required: false },
    region: { type: String, required: false },
    city: { type: String, required: false },
    postal: { type: String, required: false },
    latitude: { type: String, required: false },
    longitude: { type: String, required: false },
    // optional metadata per email (IP, source, etc.)
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false } // don't create separate _id for each subdocument to save space
);

const Newsletter_Schema = new Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },

    handle: { type: String, default: null }, // keep original handle for auditing

    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "blocks",
      default: null,
    },

    newsletterText: { type: String, default: "" },

    // store emails as an array of small objects (no _id for each entry — saves space)
    emails: {
      type: [EmailEntrySchema],
      default: [],
    },

    is_del: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updatedAt" },
    versionKey: false,
  }
);

Newsletter_Schema.index({ user_id: 1, blockId: 1, is_del: 1});

const Newsletter_Schema_Model = mongoose.model("newsletters", Newsletter_Schema);
export default Newsletter_Schema_Model;
