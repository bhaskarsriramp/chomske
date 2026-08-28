// models/Message.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const ActorSubSchema = new Schema(
  {
    model: { type: String, enum: ["User", "ParticipantUser"], required: true },
    id: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const AttachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    name: String,
    mime_type: String,
    size: Number,
    provider: String,
    meta: Schema.Types.Mixed,
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    sender: { type: ActorSubSchema, required: true },
    sender_key: { type: String, index: true }, // "User:..."/"ParticipantUser:..."

    recipients: { type: [ActorSubSchema], default: [] },

    text: { type: String, default: "" },
    attachments: { type: [AttachmentSchema], default: [] },

    status: {
      type: String,
      enum: ["sent", "delivered", "read", "spam", "deleted", "blocked"],
      default: "sent",
    },
    categories: { type: [String], default: [] },

    delivery: {
      delivered_at: { type: Date },
      read_at: { type: Date },
    },

    meta: {
      ip: String,
      user_agent: String,
      extra: Schema.Types.Mixed,
    },

    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.pre("validate", function (next) {
  if (this.sender?.model && this.sender?.id) {
    this.sender_key = `${this.sender.model}:${this.sender.id.toString()}`;
  }
  next();
});

// Critical indexes
MessageSchema.index({ conversation: 1, _id: -1 }); // cursor pagination
MessageSchema.index({ sender_key: 1, createdAt: -1 });
MessageSchema.index(
  { is_deleted: 1 },
  { partialFilterExpression: { is_deleted: false } }
);

export default mongoose.models.Message ||
  mongoose.model("Message", MessageSchema, "messages");
