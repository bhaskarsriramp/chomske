import mongoose from "mongoose";
const { Schema } = mongoose;

const ParticipantUser_Schema = new Schema({
  email: { type: String, required: true },
  name: { type: String },
  picture: { type: String },
  is_google_user: { type: Boolean },
  account_delete_code: { type: Number },
  last_login: { type: Date },
  loginHistory: [{ type: Date }],
  is_del: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date },
});

// Login lookup by email
ParticipantUser_Schema.index({ email: 1 });

// Register model as "ParticipantUser" using existing collection "participant_user"
const ParticipantUser = mongoose.models.ParticipantUser || mongoose.model("ParticipantUser", ParticipantUser_Schema, "participant_user");
export default ParticipantUser;
