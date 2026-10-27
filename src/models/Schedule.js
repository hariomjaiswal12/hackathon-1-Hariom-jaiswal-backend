const mongoose = require('mongoose');
const {
  DAYS_OF_WEEK,
  TIME_PATTERN,
  SERVICE_NAME_PATTERN,
} = require('../utils/calendar');

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
      uppercase: true,
      maxlength: [32, 'Service name must be at most 32 characters'],
      match: [SERVICE_NAME_PATTERN, 'Service name must use letters, numbers, and hyphens'],
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [TIME_PATTERN, 'Start time must be HH:mm'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [TIME_PATTERN, 'End time must be HH:mm'],
    },
    lastBookingTime: {
      type: String,
      required: [true, 'Last booking time is required'],
      match: [TIME_PATTERN, 'Last booking time must be HH:mm'],
    },
    bookingDurationMinutes: {
      type: Number,
      required: [true, 'Booking duration is required'],
      min: [1, 'Booking duration must be positive'],
      max: [720, 'Booking duration must be at most 720 minutes'],
    },
    maxGuestsPerBooking: {
      type: Number,
      required: [true, 'Maximum guests is required'],
      min: [1, 'Maximum guests must be positive'],
      max: [100, 'Maximum guests must be at most 100'],
    },
  },
  { _id: false }
);

const scheduleSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: String,
      required: [true, 'Day of week is required'],
      enum: DAYS_OF_WEEK,
      unique: true,
    },
    isOpen: {
      type: Boolean,
      required: [true, 'Open flag is required'],
    },
    services: {
      type: [serviceSchema],
      default: [],
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

scheduleSchema.set('toJSON', {
  virtuals: true,
  transform: removeInternalFields,
});

scheduleSchema.set('toObject', {
  virtuals: true,
  transform: removeInternalFields,
});

module.exports = mongoose.model('Schedule', scheduleSchema);
