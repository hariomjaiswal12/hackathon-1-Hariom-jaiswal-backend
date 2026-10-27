const mongoose = require('mongoose');
const { EVENT_STATUSES, EVENT_STATUS } = require('../constants/content');
const { CALENDAR_DATE_PATTERN, TIME_PATTERN } = require('../utils/calendar');

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: 280,
      default: '',
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    startDate: {
      type: String,
      required: true,
      match: CALENDAR_DATE_PATTERN,
    },
    endDate: {
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
      match: TIME_PATTERN,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: EVENT_STATUSES,
      default: EVENT_STATUS.DRAFT,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

eventSchema.index({ status: 1, startDate: 1, startTime: 1 });
eventSchema.index({ isPublished: 1, endDate: 1 });

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

eventSchema.set('toJSON', { virtuals: true, transform: removeInternalFields });
eventSchema.set('toObject', { virtuals: true, transform: removeInternalFields });

module.exports = mongoose.model('Event', eventSchema);
