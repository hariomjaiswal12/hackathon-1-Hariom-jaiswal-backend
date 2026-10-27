const Booking = require('../../models/Booking');
const env = require('../../config/env');
const { CHANNEL, INTEGRATION_EVENT_TYPE } = require('../../constants/channels');
const { integrationView } = require('../integrations/providerConfig');
const bookingChannel = require('./bookingChannel');
const { runIdempotent } = require('./idempotency');

const adapters = Object.freeze({
  [CHANNEL.WEBSITE]: {
    createBooking: (input) => bookingChannel.createBooking({ ...input, channel: CHANNEL.WEBSITE }),
    checkAvailability: (input) => bookingChannel.checkAvailability(input),
    resolveCustomer: (customer) => require('./customers').resolveExternalCustomer(customer),
    findCustomer: (customer) => require('./customers').resolveExternalCustomer(customer),
    getBooking: (reference) => Booking.findOne({ bookingReference: String(reference || '').trim().toUpperCase() }),
  },
  [CHANNEL.PHONE]: {
    createBooking: (input) => bookingChannel.createBooking({ ...input, channel: CHANNEL.PHONE }),
    checkAvailability: (input) => bookingChannel.checkAvailability(input),
    resolveCustomer: (customer) => require('./customers').resolveExternalCustomer(customer),
    findCustomer: (customer) => require('./customers').resolveExternalCustomer(customer),
    cancelBooking: (input) => bookingChannel.cancelBooking(input),
    rescheduleBooking: (input) => bookingChannel.rescheduleBooking(input),
    getBooking: (reference) => Booking.findOne({ bookingReference: String(reference || '').trim().toUpperCase() }),
  },
  [CHANNEL.WHATSAPP]: {
    createBooking: (input) => bookingChannel.createBooking({ ...input, channel: CHANNEL.WHATSAPP }),
    checkAvailability: (input) => bookingChannel.checkAvailability(input),
    resolveCustomer: (customer) => require('./customers').resolveExternalCustomer(customer),
    findCustomer: (customer) => require('./customers').resolveExternalCustomer(customer),
    cancelBooking: (input) => bookingChannel.cancelBooking(input),
    rescheduleBooking: (input) => bookingChannel.rescheduleBooking(input),
    getBooking: (reference) => Booking.findOne({ bookingReference: String(reference || '').trim().toUpperCase() }),
  },
  [CHANNEL.RETELL]: {
    createBooking: (input) => bookingChannel.createBooking({ ...input, channel: CHANNEL.RETELL }),
    checkAvailability: (input) => bookingChannel.checkAvailability(input),
    resolveCustomer: (customer) => require('./customers').resolveExternalCustomer(customer),
    findCustomer: (customer) => require('./customers').resolveExternalCustomer(customer),
    cancelBooking: (input) => bookingChannel.cancelBooking(input),
    rescheduleBooking: (input) => bookingChannel.rescheduleBooking(input),
    getBooking: (reference) => Booking.findOne({ bookingReference: String(reference || '').trim().toUpperCase() }),
  },
});

function adapterFor(channel) {
  return adapters[channel] || null;
}

async function createExternalBooking({ channel, idempotencyKey, input }) {
  return runIdempotent({
    idempotencyKey,
    source: channel,
    eventType: INTEGRATION_EVENT_TYPE.BOOKING_CREATED,
    work: () => adapters[channel].createBooking(input),
  });
}

async function cancelExternalBooking({ channel, idempotencyKey, reference, reason }) {
  return runIdempotent({
    idempotencyKey,
    source: channel,
    eventType: INTEGRATION_EVENT_TYPE.BOOKING_CANCELLED,
    work: () => bookingChannel.cancelBooking({ reference, reason }),
  });
}

async function rescheduleExternalBooking({ channel, idempotencyKey, reference, input }) {
  const current = await Booking.findOne({ bookingReference: String(reference).trim().toUpperCase() });
  return runIdempotent({
    idempotencyKey,
    source: channel,
    eventType: INTEGRATION_EVENT_TYPE.BOOKING_RESCHEDULED,
    work: () => bookingChannel.rescheduleBooking({
      reference,
      customerId: current ? current.customerId : undefined,
      date: input.date,
      startTime: input.startTime,
      tableId: input.tableId,
    }),
  });
}

function integrationStatus() {
  return integrationView(env);
}

module.exports = {
  adapterFor,
  adapters,
  createExternalBooking,
  cancelExternalBooking,
  rescheduleExternalBooking,
  checkAvailability: bookingChannel.checkAvailability,
  integrationStatus,
};
