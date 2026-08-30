// models/FormData.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const FormsData_Schema = new Schema({
  block_id: { type: Schema.Types.ObjectId, ref: "blocks", required: false },
  user_id: { type: Schema.Types.ObjectId, ref: "users", required: false },
  block_name: { type: String, required: false },
  
  // Store form field values (supports text, checkbox arrays, etc.)
  values: { type: Schema.Types.Mixed, default: {} },
  
  // Additional metadata
  meta: { type: Schema.Types.Mixed, default: {} },
  
  // Analytics data
  user_agent: { type: String, required: false },
  ip: { type: String, required: false },
  referrer: { type: String, required: false },
  country: { type: String, required: false },
  region: { type: String, required: false },
  city: { type: String, required: false },
  postal: { type: String, required: false },
  latitude: { type: String, required: false },
  longitude: { type: String, required: false },
  
  submitted_at: { type: Date, default: Date.now },
  is_del: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Auto-update updated_at on modification
FormsData_Schema.pre("save", function (next) {
  this.updated_at = Date.now();
  next();
});

FormsData_Schema.pre("findOneAndUpdate", function (next) {
  this.set({ updated_at: Date.now() });
  next();
});

// Indexes for performance
FormsData_Schema.index({ user_id: 1, is_del: 1 });

// Filter submissions by specific form block
FormsData_Schema.index({ user_id: 1, is_del: 1, block_id: 1 });

// Date-sorted submission listing
FormsData_Schema.index({ user_id: 1, is_del: 1, submitted_at: -1 });

const FormsData_Schema_Model = mongoose.model("forms_data", FormsData_Schema);
export default FormsData_Schema_Model;
