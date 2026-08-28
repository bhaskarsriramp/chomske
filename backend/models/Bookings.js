import mongoose from 'mongoose';
const { Schema } = mongoose;

const Bookings_Schema = new Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true
    },

    block_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "blocks",
        required: true    },

    customer_name: {
        type: String,
        required: true
    },

    customer_mobile: {
        type: String,
        required: true
    },

    customer_email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },

    selected_date: {
        type: Date,  // Format: 'YYYY-MM-DD'
        required: true
    },

    selected_timeSlot: {
        type: String,  // Format: '10:00 AM', '02:30 PM', etc.
        required: true
    },

    booking_id: { type: String, unique: true, sparse: true},

    // Payment-related fields
    payment_status: {
        type: String,
        enum: ['free', 'pending', 'paid', 'failed', 'refunded'],
        default: 'free'    },

     // Session-related fields
    session_status: {
        type: String,
        enum: ['active', 'completed', 'expired', 'cancelled'],
        default: 'active'    },

    // Booking status
    status: {
        type: String,
        enum: ['confirmed', 'cancelled', 'completed', 'no_show', 'pending'],
        default: 'confirmed'    },

    // Razorpay transaction references
    transaction_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'transactions',
        default: null
    },

    order_id: {
        type: String,
        default: null,
        sparse: true
    },

    payment_id: {
        type: String,
        default: null,
        sparse: true
    },

    // Booking metadata
    duration: {
        type: Number,
        default: 30
    },

    interaction_type: {
        type: String,
        enum: ['voice', 'video'],
        default: 'voice'
    },

    // Cancellation info
    cancellation_reason: {
        type: String,
        default: null
    },

    cancelled_at: {
        type: Date,
        default: null
    },

    cancelled_by: {
        type: String,
        enum: ['customer', 'host', 'system'],
        default: null
    },

    // Soft delete
    is_del: {
        type: Boolean,
        default: false    },

    created_at: {
        type: Date,
        default: Date.now    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound indexes for common query patterns
Bookings_Schema.index({ user_id: 1, is_del: 1, selected_date: 1 });
Bookings_Schema.index({ booking_id: 1 });
Bookings_Schema.index({ block_id: 1, selected_date: 1, selected_timeSlot: 1, is_del: 1, status: 1 });

// Critical index: Prevent double-booking of same slot
Bookings_Schema.index(
    { block_id: 1, selected_date: 1, selected_timeSlot: 1, is_del: 1 },
    { 
        unique: true,
        partialFilterExpression: { 
            is_del: false,
            status: { $ne: 'cancelled' }
        }
    }
);

Bookings_Schema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Pre-update middleware
Bookings_Schema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: new Date() });
    next();
});

const Bookings_Schema_Model = mongoose.model('bookings', Bookings_Schema);
export default Bookings_Schema_Model;
