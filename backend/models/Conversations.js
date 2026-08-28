// models/Conversation.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const ActorSubSchema = new Schema(
  {
    model: { type: String, enum: ["User", "ParticipantUser"], required: true },
    id: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const ParticipantSubSchema = new Schema(
  {
    actor: { type: ActorSubSchema, required: true },
    role: {
      type: String,
      enum: ["member", "influencer", "admin", "guest"],
      default: "member",
    },
    joined_at: { type: Date, default: Date.now },
    last_read_at: { type: Date, default: null },
    last_read_message_id: { type: Schema.Types.ObjectId, default: null },
    muted: { type: Boolean, default: false },
  },
  { _id: false }
);

const ConversationSchema = new Schema(
  {
    participants: {
      type: [ParticipantSubSchema],
      validate: (v) => Array.isArray(v) && v.length > 0,
    },

    // String keys like "User:650...|ParticipantUser:651..."
    participant_keys_sorted: { type: String, index: true },

    // DM/Group typing
    conversation_type: {
      type: String,
      enum: ["dm", "group", "system"],
      default: "dm",
      index: true,
    },

    // Denormalized inbox helpers
    last_message: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },
    last_message_text: { type: String, default: "" },
    last_message_at: { type: Date, default: null, index: true },
    message_count: { type: Number, default: 0 },

    // O(1) unread counters — map key must be the actorKey (model:id)
    unread_counts: { type: Map, of: Number, default: {} },

    metadata: {
      title: { type: String, default: null },
      tags: { type: [String], default: [] },
      pinned: { type: Boolean, default: false },
    },

    // NEW: AI-based categorization from first participant message
    category: {
      type: String,
      enum: ["General", "Collaboration", "Uncategorized"],
      default: "Uncategorized",
      index: true,
    },
    category_analyzed_at: { type: Date, default: null },
    category_confidence: { type: Number, min: 0, max: 1, default: null },

    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// derive participant_keys_sorted
ConversationSchema.pre("validate", function (next) {
  try {
    const keys = (this.participants || [])
      .map((p) => `${p.actor?.model}:${p.actor?.id?.toString()}`)
      .filter(Boolean)
      .sort();
    this.participant_keys_sorted = keys.length ? keys.join("|") : undefined;
  } catch (e) {
    return next(e);
  }
  next();
});

// Indexes (tuned for inbox + DM uniqueness + membership filter)
ConversationSchema.index(
  { participant_keys_sorted: 1, conversation_type: 1 },
  {
    unique: true,
    partialFilterExpression: { conversation_type: "dm", is_deleted: { $ne: true } },
  }
);
ConversationSchema.index({
  "participants.actor.model": 1,
  "participants.actor.id": 1,
  updatedAt: -1,
});
ConversationSchema.index({ last_message_at: -1 });
ConversationSchema.index({ is_deleted: 1 });
ConversationSchema.index({ category: 1, updatedAt: -1 });

export default mongoose.models.Conversation ||
  mongoose.model("Conversation", ConversationSchema);