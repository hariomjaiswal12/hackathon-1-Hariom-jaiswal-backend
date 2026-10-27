const mongoose = require('mongoose');

const bookingLockSchema = new mongoose.Schema(
  {
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    owner: {
      type: String,
      required: true,
    },
    lockedUntil: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

bookingLockSchema.index({ tableId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('BookingLock', bookingLockSchema);
