const mongoose = require('mongoose');
const { DEPOSIT_TYPES, DEPOSIT_TYPE } = require('../constants/payments');

const depositConfigSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: DEPOSIT_TYPES,
      default: DEPOSIT_TYPE.PER_GUEST,
    },
    amount: {
      type: Number,
      required: true,
      default: 10,
      min: [0, 'Deposit amount cannot be negative'],
    },
    currency: {
      type: String,
      required: true,
      default: 'EUR',
      trim: true,
      uppercase: true,
    },
    minGuests: {
      type: Number,
      required: true,
      default: 1,
      min: [1, 'Minimum guests must be at least 1'],
    },
    refundCutoffHours: {
      type: Number,
      required: true,
      default: 24,
      min: [0, 'Refund cutoff hours cannot be negative'],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

depositConfigSchema.set('toJSON', {
  virtuals: true,
  transform: removeInternalFields,
});

depositConfigSchema.set('toObject', {
  virtuals: true,
  transform: removeInternalFields,
});

module.exports = mongoose.model('DepositConfig', depositConfigSchema);
