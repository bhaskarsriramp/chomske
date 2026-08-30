// models/BankDetails.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const BankDetails_Schema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "users", index: true, required: true, unique: true },
    name_on_bank: { type: String, required: true, trim: true },
    bank_name: { type: String, trim: true }, // optional, keep if you plan to use
    account_number: { type: String, required: true, trim: true }, // <-- STRING
    bank_ifsc: { type: String, required: true, uppercase: true, trim: true },
    bank_name: { type: String, required: true, trim: true},
    is_del: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const BankDetailsModel = mongoose.models.bank_details || mongoose.model("bank_details", BankDetails_Schema);
export default BankDetailsModel;
