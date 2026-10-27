const mongoose = require('mongoose');
const { CALENDAR_DATE_PATTERN, TIME_PATTERN } = require('../utils/calendar');
const {
  BOOKING_STATUSES,
  BOOKING_STATUS,
  BOOKING_SOURCES,
  BOOKING_HISTORY_ACTIONS,
} = require('../constants/bookings');
const {
  DEPOSIT_STATUS,
  DEPOSIT_STATUSES,
} = require('../constants/payments');

const bookingSlotSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
    serviceName: { type: String, required: true },
  },
  { _id: false }
);

const bookingHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: BOOKING_HISTORY_ACTIONS,
    },
    fromStatus: {
      type: String,
      enum: BOOKING_STATUSES,
    },
    toStatus: {
      type: String,
      enum: BOOKING_STATUSES,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    at: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    fromSlot: {
      type: bookingSlotSchema,
    },
    toSlot: {
      type: bookingSlotSchema,
    },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      required: true,
    },
    tableIds: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table',
      }],
    },
    date: {
      type: String,
      required: true,
      match: CALENDAR_DATE_PATTERN,
    },
    startTime: {
      type: String,
      required: true,
      match: TIME_PATTERN,
    },
    endTime: {
      type: String,
      required: true,
      match: TIME_PATTERN,
    },
    guests: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    serviceName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    source: {
      type: String,
      required: true,
      enum: BOOKING_SOURCES,
    },
    status: {
      type: String,
      required: true,
      enum: BOOKING_STATUSES,
      default: BOOKING_STATUS.CONFIRMED,
    },
    depositRequired: {
      type: Boolean,
      default: false,
    },
    depositAmount: {
      type: Number,
      default: 0,
      min: [0, 'Deposit amount cannot be negative'],
    },
    depositStatus: {
      type: String,
      enum: DEPOSIT_STATUSES,
      default: DEPOSIT_STATUS.NOT_REQUIRED,
    },
    paymentReference: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    history: {
      type: [bookingHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ tableId: 1, date: 1, status: 1 });
bookingSchema.index({ tableIds: 1, date: 1, status: 1 });
bookingSchema.index({ customerId: 1, date: 1 });
bookingSchema.index({ date: 1, status: 1 });
bookingSchema.index({ date: 1, serviceName: 1 });
bookingSchema.index({ date: 1, tableId: 1 });
bookingSchema.index({ date: 1, tableIds: 1 });

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

bookingSchema.set('toJSON', {
  virtuals: true,
  transform: removeInternalFields,
});

bookingSchema.set('toObject', {
  virtuals: true,
  transform: removeInternalFields,
});

module.exports = mongoose.model('Booking', bookingSchema);
