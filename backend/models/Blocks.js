// models/Block.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const FieldSchema = new Schema(
  {
    key: { type: String, required: false }, // Optional for booking fields
    label: { type: String, required: true }, // Supports multiline questions now
    type: { 
      type: String, 
      default: "text",
      enum: ["text", "email", "tel", "textarea", "number", "radio", "checkbox", "select", "duration", "buffer", "maxDays"]
    },
    placeholder: { type: String, default: "" },
    required: { type: Boolean, default: false },
    value: { type: String, required: false }, // For booking configuration values
    options: {
      type: [String],
      required: false,
      default: undefined,
    },
    multiple: { type: Boolean, default: false }, // For checkbox - allow multiple selections
    minSelections: { type: Number, default: 0 }, // Min selections for checkbox
    maxSelections: { type: Number, default: undefined }, // Max selections for checkbox
  },
  { _id: false }
);

const BlockSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, required: true, ref: "users" },
    type: {
      type: String,
      enum: ["link", "video", "product", "store", "form", "cta", "newsletter", "booking"],
      required: true,
    },

    name: { type: String, required: true, trim: true },
    action: {
      type: String,
      trim: true,
      required: function () {
        // Action not required for form and booking (stored in fields instead)
        return this.type !== "form" && this.type !== "booking";
      },
      default: "",
    },

    fields: {
      type: [FieldSchema],
      required: false,
      default: undefined,
    },

    // Booking-specific fields
    duration: { type: Number, required: false },
    description: { type: String, required: false, trim: true },
    bufferTime: { type: Number, required: false, default: 0 },
    interactionType: { type: String, required: false, default: 'voice' },
    pricing: { type: Number, required: false, default: 0 }, 

    order: { type: Number, required: true, default: 1000},
    published: { type: Boolean, default: true },
    archived: { type: Boolean, default: false },

    is_del: { type: Boolean, default: false },
    clicks: { type: Number, default: 0 },
    link_click_analytics: [{
      ip: { type: String },
      user_agent: { type: String },
      referrer: { type: String },
      country: { type: String },
      country_code: { type: String },
      region: { type: String },
      city: { type: String },
      postal: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
      created_at: { type: Date, default: Date.now },
    }],

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
  }
);

// Keep updated_at fresh
BlockSchema.pre("save", function (next) {
  this.updated_at = Date.now();
  next();
});

BlockSchema.pre("findOneAndUpdate", function (next) {
  this.set({ updated_at: Date.now() });
  next();
});

// Indexes
BlockSchema.index({ user_id: 1 });
BlockSchema.index({ user_id: 1, order: 1 });
BlockSchema.index({ user_id: 1, type: 1 });
BlockSchema.index({ user_id: 1, type: 1, is_del: 1 });
BlockSchema.index({ user_id: 1, is_del: 1 });

const BlockModel = mongoose.model("blocks", BlockSchema);
export default BlockModel;
