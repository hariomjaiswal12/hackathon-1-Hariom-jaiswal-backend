const mongoose = require('mongoose');
const {
  PAYMENT_STATUSES,
  PAYMENT_STATUS,
  PAYMENT_TYPES,
  PAYMENT_TYPE,
  PAYMENT_PROVIDERS,
  PAYMENT_PROVIDER,
} = require('../constants/payments');

const paymentSchema = new mongoose.Schema(
  {
    paymentReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },
    bookingReference: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Payment amount cannot be negative'],
    },
    currency: {
      type: String,
      required: true,
      default: 'EUR',
      trim: true,
      uppercase: true,
    },
    provider: {
      type: String,
      required: true,
      enum: PAYMENT_PROVIDERS,
      default: PAYMENT_PROVIDER.DEV_SIMULATED,
    },
    providerOrderId: {
      type: String,
      trim: true,
      default: null,
    },
    providerPaymentId: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: PAYMENT_STATUSES,
      default: PAYMENT_STATUS.PENDING,
    },
    type: {
      type: String,
      required: true,
      enum: PAYMENT_TYPES,
      default: PAYMENT_TYPE.BOOKING_DEPOSIT,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    refundAmount: {
      type: Number,
      default: null,
    },
    refundReason: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ bookingReference: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

paymentSchema.set('toJSON', {
  virtuals: true,
  transform: removeInternalFields,
});

paymentSchema.set('toObject', {
  virtuals: true,
  transform: removeInternalFields,
});

module.exports = mongoose.model('Payment', paymentSchema);
