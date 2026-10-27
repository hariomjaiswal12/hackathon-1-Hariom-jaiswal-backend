const mongoose = require('mongoose');
const { CALENDAR_DATE_PATTERN, TIME_PATTERN } = require('../utils/calendar');
const { BOOKING_SOURCES } = require('../constants/bookings');
const { WAITLIST_STATUSES, WAITLIST_STATUS, ACTIVE_WAITLIST_STATUSES } = require('../constants/waitlist');

const waitlistSchema = new mongoose.Schema(
  {
    waitlistReference: {
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
    date: {
      type: String,
      required: true,
      match: CALENDAR_DATE_PATTERN,
    },
    requestedStartTime: {
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
    status: {
      type: String,
      required: true,
      enum: WAITLIST_STATUSES,
      default: WAITLIST_STATUS.WAITING,
    },
    source: {
      type: String,
      required: true,
      enum: BOOKING_SOURCES,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

waitlistSchema.index(
  { customerId: 1, date: 1, requestedStartTime: 1, guests: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [...ACTIVE_WAITLIST_STATUSES] } },
  }
);
waitlistSchema.index({ date: 1, requestedStartTime: 1, createdAt: 1, waitlistReference: 1 });
waitlistSchema.index({ date: 1, status: 1 });

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

waitlistSchema.set('toJSON', {
  virtuals: true,
  transform: removeInternalFields,
});

waitlistSchema.set('toObject', {
  virtuals: true,
  transform: removeInternalFields,
});

module.exports = mongoose.model('Waitlist', waitlistSchema);
