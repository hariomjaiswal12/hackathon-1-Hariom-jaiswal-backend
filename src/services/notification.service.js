const crypto = require('crypto');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { publishToUser } = require('./realtime.service');
const { REALTIME_EVENT } = require('../constants/realtime');
const { BOOKING_HISTORY_ACTION } = require('../constants/bookings');
const { WAITLIST_STATUS } = require('../constants/waitlist');
const {
  NOTIFICATION_TYPE,
  NOTIFICATION_STATUS,
  NOTIFICATION_CHANNEL,
} = require('../constants/notifications');

const REFERENCE_ATTEMPTS = 5;
const HIDDEN_METADATA_FIELDS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'jwt',
  'email',
  'phone',
  'notes',
]);

const BOOKING_EVENT_TYPES = Object.freeze({
  [REALTIME_EVENT.BOOKING_CREATED]: NOTIFICATION_TYPE.BOOKING_CREATED,
  [REALTIME_EVENT.BOOKING_UPDATED]: NOTIFICATION_TYPE.BOOKING_UPDATED,
  [REALTIME_EVENT.BOOKING_CANCELLED]: NOTIFICATION_TYPE.BOOKING_CANCELLED,
  [REALTIME_EVENT.BOOKING_ARRIVED]: NOTIFICATION_TYPE.BOOKING_ARRIVED,
  [REALTIME_EVENT.BOOKING_SEATED]: NOTIFICATION_TYPE.BOOKING_SEATED,
  [REALTIME_EVENT.BOOKING_COMPLETED]: NOTIFICATION_TYPE.BOOKING_COMPLETED,
  [REALTIME_EVENT.BOOKING_NO_SHOW]: NOTIFICATION_TYPE.BOOKING_NO_SHOW,
});

function referenceStamp() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function generateNotificationReference() {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `NT-${referenceStamp()}-${suffix}`;
}

function isDuplicate(error, field) {
  return error
    && error.code === 11000
    && (error.keyPattern?.[field] || error.keyValue?.[field] || String(error.message).includes(field));
}

function publicMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata || {}).filter(([key]) => !HIDDEN_METADATA_FIELDS.has(key))
  );
}

function presentNotification(notification) {
  const plain = notification.toObject();

  return {
    id: plain.id,
    notificationReference: plain.notificationReference,
    type: plain.type,
    recipientUserId: plain.recipientUserId,
    bookingReference: plain.bookingReference,
    waitlistReference: plain.waitlistReference,
    title: plain.title,
    message: plain.message,
    channel: plain.channel,
    status: plain.status,
    metadata: publicMetadata(plain.metadata),
    readAt: plain.readAt,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

function bookingIdempotencyKey(type, booking) {
  if (type === NOTIFICATION_TYPE.BOOKING_UPDATED) {
    const updates = (booking.history || []).filter(
      (entry) => entry.action === BOOKING_HISTORY_ACTION.RESCHEDULED
    ).length;
    return `booking:${booking.bookingReference}:${type}:${updates}`;
  }

  return `booking:${booking.bookingReference}:${type}`;
}

function waitlistIdempotencyKey(type, entry) {
  return `waitlist:${entry.waitlistReference}:${type}`;
}

function bookingCopy(type, booking) {
  const reference = booking.bookingReference;
  const when = `${booking.date} at ${booking.startTime}`;
  const copies = {
    [NOTIFICATION_TYPE.BOOKING_CREATED]: ['Booking confirmed', `Your booking ${reference} is confirmed for ${when}.`],
    [NOTIFICATION_TYPE.BOOKING_UPDATED]: ['Booking updated', `Your booking ${reference} is now ${when}.`],
    [NOTIFICATION_TYPE.BOOKING_CANCELLED]: ['Booking cancelled', `Your booking ${reference} has been cancelled.`],
    [NOTIFICATION_TYPE.BOOKING_ARRIVED]: ['Arrival recorded', `Arrival was recorded for booking ${reference}.`],
    [NOTIFICATION_TYPE.BOOKING_SEATED]: ['You are seated', `Booking ${reference} is now seated.`],
    [NOTIFICATION_TYPE.BOOKING_COMPLETED]: ['Booking completed', `Booking ${reference} is complete.`],
    [NOTIFICATION_TYPE.BOOKING_NO_SHOW]: ['No-show recorded', `Booking ${reference} was marked as a no-show.`],
  };

  return copies[type];
}

function waitlistCopy(type, entry) {
  const reference = entry.waitlistReference;
  const when = `${entry.date} at ${entry.requestedStartTime}`;
  const copies = {
    [NOTIFICATION_TYPE.WAITLIST_CREATED]: ['Waitlist request received', `You are on the waitlist for ${when}.`],
    [NOTIFICATION_TYPE.WAITLIST_NOTIFIED]: ['Waitlist update', `Your waitlist request ${reference} has been updated.`],
    [NOTIFICATION_TYPE.WAITLIST_CONVERTED]: ['Waitlist converted', `Your waitlist request ${reference} was converted.`],
    [NOTIFICATION_TYPE.WAITLIST_CANCELLED]: ['Waitlist cancelled', `Your waitlist request ${reference} was cancelled.`],
  };

  return copies[type];
}

function waitlistType(event, entry) {
  if (event === REALTIME_EVENT.WAITLIST_CREATED) {
    return NOTIFICATION_TYPE.WAITLIST_CREATED;
  }

  if (event === REALTIME_EVENT.WAITLIST_CANCELLED) {
    return NOTIFICATION_TYPE.WAITLIST_CANCELLED;
  }

  if (event !== REALTIME_EVENT.WAITLIST_UPDATED) {
    return null;
  }

  if (entry.status === WAITLIST_STATUS.NOTIFIED) {
    return NOTIFICATION_TYPE.WAITLIST_NOTIFIED;
  }

  if (entry.status === WAITLIST_STATUS.CONVERTED) {
    return NOTIFICATION_TYPE.WAITLIST_CONVERTED;
  }

  return null;
}

function bookingMetadata(booking) {
  return publicMetadata({
    bookingReference: booking.bookingReference,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guests: booking.guests,
    status: booking.status,
  });
}

function waitlistMetadata(entry) {
  return publicMetadata({
    waitlistReference: entry.waitlistReference,
    date: entry.date,
    requestedStartTime: entry.requestedStartTime,
    guests: entry.guests,
    status: entry.status,
  });
}

async function insertNotification(payload) {
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      const notification = await Notification.create({
        ...payload,
        notificationReference: generateNotificationReference(),
        channel: NOTIFICATION_CHANNEL.IN_APP,
        status: NOTIFICATION_STATUS.UNREAD,
      });
      return { created: true, notification };
    } catch (error) {
      if (isDuplicate(error, 'idempotencyKey')) {
        const notification = await Notification.findOne({ idempotencyKey: payload.idempotencyKey });
        return { created: false, notification };
      }

      if (!isDuplicate(error, 'notificationReference') || attempt === REFERENCE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error('Could not allocate a notification reference');
}

function emitNotification(notification) {
  publishToUser(notification.recipientUserId, REALTIME_EVENT.NOTIFICATION_NEW, {
    notificationReference: notification.notificationReference,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    createdAt: notification.createdAt instanceof Date
      ? notification.createdAt.toISOString()
      : notification.createdAt,
  });
}

async function createNotification(payload) {
  const result = await insertNotification(payload);

  if (result.created && result.notification) {
    emitNotification(result.notification);
  }

  return result.notification ? presentNotification(result.notification) : null;
}

async function safeNotify(label, work) {
  try {
    await work();
  } catch (error) {
    logger.error(`Notification failed for ${label}: ${error.message}`);
  }
}

async function notifyBookingEvent(event, booking) {
  await safeNotify(event, async () => {
    const type = BOOKING_EVENT_TYPES[event];
    const recipientUserId = booking && booking.customerId;

    if (!type || !recipientUserId || !booking.bookingReference) {
      return;
    }

    const [title, message] = bookingCopy(type, booking);
    await createNotification({
      type,
      recipientUserId,
      bookingReference: booking.bookingReference,
      title,
      message,
      metadata: bookingMetadata(booking),
      idempotencyKey: bookingIdempotencyKey(type, booking),
    });
  });
}

function reminderWindow(minutes) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'about 1 hour' : `about ${hours} hours`;
  }

  return `about ${minutes} minutes`;
}

async function notifyBookingReminder(booking, leadMinutes) {
  await safeNotify('BOOKING_REMINDER', async () => {
    if (!booking || !booking.customerId || !booking.bookingReference) {
      return;
    }

    const when = reminderWindow(leadMinutes);
    await createNotification({
      type: NOTIFICATION_TYPE.BOOKING_REMINDER,
      recipientUserId: booking.customerId,
      bookingReference: booking.bookingReference,
      title: 'Booking reminder',
      message: `Your reservation ${booking.bookingReference} starts in ${when}.`,
      metadata: bookingMetadata(booking),
      idempotencyKey: `${booking.bookingReference}:REMINDER:${booking.date}T${booking.startTime}`,
    });
  });
}

async function notifyCustomerBlacklisted(customer) {
  await safeNotify('CUSTOMER_BLACKLISTED', async () => {
    const recipientUserId = customer && (customer.id || customer._id);

    if (!recipientUserId) {
      return;
    }

    await createNotification({
      type: NOTIFICATION_TYPE.CUSTOMER_BLACKLISTED,
      recipientUserId,
      title: 'Reservation access restricted',
      message: 'Your account has been restricted after repeated no-shows. Please contact the restaurant.',
      metadata: publicMetadata({
        noShowCount: customer.noShowCount,
        blacklistStatus: customer.blacklistStatus,
      }),
      idempotencyKey: `customer:${String(recipientUserId)}:CUSTOMER_BLACKLISTED:${customer.noShowCount}`,
    });
  });
}

async function notifyWaitlistEvent(event, entry) {
  await safeNotify(event, async () => {
    const type = waitlistType(event, entry || {});
    const recipientUserId = entry && entry.customerId;

    if (!type || !recipientUserId || !entry.waitlistReference) {
      return;
    }

    const [title, message] = waitlistCopy(type, entry);
    await createNotification({
      type,
      recipientUserId,
      waitlistReference: entry.waitlistReference,
      title,
      message,
      metadata: waitlistMetadata(entry),
      idempotencyKey: waitlistIdempotencyKey(type, entry),
    });
  });
}

async function listNotifications({ actor, query }) {
  const filter = { recipientUserId: actor.id };

  if (query.status) {
    filter.status = query.status;
  }

  if (query.type) {
    filter.type = query.type;
  }

  const notifications = await Notification.find(filter).sort({ createdAt: -1 });
  return notifications.map(presentNotification);
}

async function getNotification({ actor, id }) {
  const notification = await Notification.findOne({
    _id: id,
    recipientUserId: actor.id,
  });

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  return presentNotification(notification);
}

async function markNotificationRead({ actor, id }) {
  const notification = await Notification.findOne({
    _id: id,
    recipientUserId: actor.id,
  });

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  if (notification.status === NOTIFICATION_STATUS.READ) {
    return presentNotification(notification);
  }

  notification.status = NOTIFICATION_STATUS.READ;
  notification.readAt = new Date();
  await notification.save();
  return presentNotification(notification);
}

async function markAllNotificationsRead({ actor }) {
  const result = await Notification.updateMany(
    {
      recipientUserId: actor.id,
      status: NOTIFICATION_STATUS.UNREAD,
    },
    {
      $set: {
        status: NOTIFICATION_STATUS.READ,
        readAt: new Date(),
      },
    }
  );

  return { updatedCount: result.modifiedCount };
}

module.exports = {
  notifyBookingEvent,
  notifyBookingReminder,
  notifyCustomerBlacklisted,
  notifyWaitlistEvent,
  listNotifications,
  getNotification,
  markNotificationRead,
  markAllNotificationsRead,
};
