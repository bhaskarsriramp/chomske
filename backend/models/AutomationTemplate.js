import mongoose from "mongoose";
const { Schema } = mongoose;

const AutomationTemplateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "users", required: true },
    name: { type: String, required: true, trim: true },
    dmMessage: { type: String },
    buttonText: { type: String },
    flowNodes: { type: Array, default: [] },
    hasReply: { type: Boolean, default: false },
    replyComments: { type: [String], default: [] },
    createdAt: { type: Date },
  },
  { timestamps: true }
);

AutomationTemplateSchema.index({ userId: 1, createdAt: -1 });

const AutomationTemplate =
  mongoose.models.AutomationTemplate ||
  mongoose.model("AutomationTemplate", AutomationTemplateSchema, "automationtemplates");
export default AutomationTemplate;
