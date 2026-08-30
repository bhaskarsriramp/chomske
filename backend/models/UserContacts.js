import mongoose from "mongoose";
const { Schema } = mongoose;

const UserContactsSchema = new Schema(
  {
    commentId: { type: String, required: true },
    automationId: { type: Schema.Types.ObjectId, ref: "automations", required: true },
    postId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "users", required: true },
    repliedAt: { type: Date, default: Date.now },
    igUserId: String,
    username: String,
    profilePic: String,
    followsBusiness: Boolean,
    businessFollowsUser: Boolean,
  },
  { timestamps: true }
);

// Updated index - removed 'channel' as it's not in schema
UserContactsSchema.index({ automationId: 1, commentId: 1 });
UserContactsSchema.index(
  { userId: 1, igUserId: 1 },
  { unique: true }
);



const UserContacts =
  mongoose.models.UserContacts ||
  mongoose.model("UserContact", UserContactsSchema, "user_contacts");

export default UserContacts;
