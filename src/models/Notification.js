const mongoose = require('mongoose');
const {
  NOTIFICATION_TYPES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_STATUS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL,
} = require('../constants/notifications');

const notificationSchema = new mongoose.Schema(
  {
    notificationReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    type: {
      type: String,
      required: true,
      enum: NOTIFICATION_TYPES,
    },
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bookingReference: {
      type: String,
      trim: true,
      uppercase: true,
    },
    waitlistReference: {
      type: String,
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    channel: {
      type: String,
      required: true,
      enum: NOTIFICATION_CHANNELS,
      default: NOTIFICATION_CHANNEL.IN_APP,
    },
    status: {
      type: String,
      required: true,
      enum: NOTIFICATION_STATUSES,
      default: NOTIFICATION_STATUS.UNREAD,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    readAt: {
      type: Date,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, status: 1 });
notificationSchema.index({ recipientUserId: 1, type: 1 });

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

notificationSchema.set('toJSON', {
  virtuals: true,
  transform: removeInternalFields,
});

notificationSchema.set('toObject', {
  virtuals: true,
  transform: removeInternalFields,
});

module.exports = mongoose.model('Notification', notificationSchema);
