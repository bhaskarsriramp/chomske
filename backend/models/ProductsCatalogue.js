import mongoose from "mongoose";
const { Schema } = mongoose;

const ProductsCatalogue_Schema = new Schema({

    user_id: { type: Schema.Types.ObjectId, ref: "users", required: false },
  type: { type: String, enum: ["affiliate", "digital"], default: "affiliate"},
  title: { type: String },
  link: { type: String },
  description: { type: String },
  price: { type: Number },
  currency: { type: String, default: "INR" },
  category_id: { type: Schema.Types.ObjectId, ref: "product_categories"},
  category_name: { type: String }, // denormalized for quick display
  imageUrl: { type: String },
  imagePublicId: { type: String },
    productCategory: {
    type: Schema.Types.ObjectId,
    ref: "product_categories",
    default: null  },
  image_last_checked: Date,


    link_click_analytics: [{
  ip: { type: String},
  user_agent: { type: String },
  referrer: { type: String },
  country: { type: String },
  country_code: { type: String},
  region: { type: String },
  city: { type: String },
  postal: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  created_at: { type: Date, default: Date.now }
}],
   
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

ProductsCatalogue_Schema.index({ user_id: 1, is_del: 1, category_id: 1, type: 1 });


const ProductsCatalogue_Schema_Model = mongoose.model("products_catalogue", ProductsCatalogue_Schema);
export default ProductsCatalogue_Schema_Model;
