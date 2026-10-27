const REALTIME_EVENT = Object.freeze({
  BOOKING_CREATED: 'booking:created',
  BOOKING_UPDATED: 'booking:updated',
  BOOKING_CANCELLED: 'booking:cancelled',
  BOOKING_ARRIVED: 'booking:arrived',
  BOOKING_SEATED: 'booking:seated',
  BOOKING_COMPLETED: 'booking:completed',
  BOOKING_NO_SHOW: 'booking:no_show',
  TABLE_UPDATED: 'table:updated',
  WAITLIST_CREATED: 'waitlist:created',
  WAITLIST_UPDATED: 'waitlist:updated',
  WAITLIST_CANCELLED: 'waitlist:cancelled',
  NOTIFICATION_NEW: 'notification:new',
  PAYMENT_PAID: 'payment:paid',
  PAYMENT_REFUNDED: 'payment:refunded',
});

const FLOOR_LIVE_ROOM = 'floor:live';

function userRoom(userId) {
  return `user:${userId}`;
}

module.exports = {
  REALTIME_EVENT,
  FLOOR_LIVE_ROOM,
  userRoom,
};
