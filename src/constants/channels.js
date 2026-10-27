const CHANNEL = Object.freeze({
  WEBSITE: 'website',
  PHONE: 'phone',
  WHATSAPP: 'whatsapp',
  RETELL: 'retell',
});

const CHANNELS = Object.freeze(Object.values(CHANNEL));

const INTEGRATION_EVENT_STATUS = Object.freeze({
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
});

const INTEGRATION_EVENT_TYPE = Object.freeze({
  AVAILABILITY: 'availability',
  BOOKING_CREATED: 'booking.created',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_RESCHEDULED: 'booking.rescheduled',
  WAITLIST_CREATED: 'waitlist.created',
});

module.exports = {
  CHANNEL,
  CHANNELS,
  INTEGRATION_EVENT_STATUS,
  INTEGRATION_EVENT_TYPE,
};
