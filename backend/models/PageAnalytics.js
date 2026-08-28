import mongoose from "mongoose";
const { Schema } = mongoose;

const LanguageSchema = new Schema({
  name: { type: String },
  native: { type: String },
  code: { type: String }, // e.g. "hi", "en"
}, { _id: false });



const PageAnalytics_Schema = new Schema({

    user_id: { type: Schema.Types.ObjectId, ref: "users", required: false },
    user_agent: { type: String, required: false },
    referrer: { type: String, required: false },
    ip: { type: String, required: false },
    country: { type: String, required: false },
    region: { type: String, required: false },
    city: { type: String, required: false },
    postal: { type: String, required: false },
    latitude: { type: String, required: false },
    longitude: { type: String, required: false },
     geo_languages: { type: [LanguageSchema], default: [] },
   
      is_del: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
  }
});

PageAnalytics_Schema.index({ user_id: 1, created_at: 1, is_del: 1});


const PageAnalytics_Schema_Model = mongoose.model("page_analytics", PageAnalytics_Schema);
export default PageAnalytics_Schema_Model;
