import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  picture: { type: String },
  is_google_user: { type: Boolean, default: true },
  hasAccess: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date },
});

const Admin = mongoose.model("Admin", AdminSchema, "admins");
export default Admin;
