import mongoose from 'mongoose';
const { Schema } = mongoose;

const Subscriptions_Schema = new Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"    },

    razorpay_payment_id: String,
    razorpay_subscription_id: {
        type: String    },

    razorpay_signature: String,
    subscription_starts_at: Date,
    status: {
        type: String    },
    recurring: {
        type: Boolean,
        default: false
    },

    is_del: {
        type: Boolean,
        default: false
    },

    created_at: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date
    }
});

// Compound indexes for common query patterns
Subscriptions_Schema.index({ user_id: 1, is_del: 1, created_at: 1, status: 1 }); // Get user's active subscriptions
Subscriptions_Schema.index({ razorpay_subscription_id: 1, is_del: 1 }); // Webhook lookups


const Subscriptions_Schema_Model = mongoose.model('subscriptions', Subscriptions_Schema);
export default Subscriptions_Schema_Model;