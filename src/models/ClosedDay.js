const mongoose = require('mongoose');
const { CALENDAR_DATE_PATTERN } = require('../utils/calendar');

const closedDaySchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: [true, 'Date is required'],
      unique: true,
      match: [CALENDAR_DATE_PATTERN, 'Date must be YYYY-MM-DD'],
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      minlength: [2, 'Reason must be at least 2 characters'],
      maxlength: [200, 'Reason must be at most 200 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by is required'],
    },
  },
  {
    timestamps: true,
  }
);

closedDaySchema.index({ isActive: 1, date: 1 });

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

closedDaySchema.set('toJSON', {
  virtuals: true,
  transform: removeInternalFields,
});

closedDaySchema.set('toObject', {
  virtuals: true,
  transform: removeInternalFields,
});

module.exports = mongoose.model('ClosedDay', closedDaySchema);
