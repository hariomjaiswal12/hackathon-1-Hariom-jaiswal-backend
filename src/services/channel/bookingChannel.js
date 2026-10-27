const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');
const HTTP_STATUS = require('../../constants/httpStatus');
const ERROR_CODES = require('../../constants/errorCodes');
const { ROLES } = require('../../constants/roles');
const { BOOKING_SOURCE, BOOKING_STATUS } = require('../../constants/bookings');
const { REALTIME_EVENT } = require('../../constants/realtime');
const { CHANNEL } = require('../../constants/channels');
const bookingService = require('../booking.service');
const availabilityService = require('../availability.service');
const { recommendTables } = require('../tableAllocation.service');
const depositConfigService = require('../depositConfig.service');
const { assertCustomerCanOriginateBooking } = require('../blacklist.service');
const { resolveExternalCustomer } = require('./customers');
const { publishBooking } = require('../realtime.service');
const { notifyBookingEvent } = require('../notification.service');
const logger = require('../../utils/logger');

const CHANNEL_SOURCE = Object.freeze({
  [CHANNEL.WEBSITE]: BOOKING_SOURCE.WEBSITE,
  [CHANNEL.PHONE]: BOOKING_SOURCE.PHONE,
  [CHANNEL.WHATSAPP]: BOOKING_SOURCE.WHATSAPP,
  [CHANNEL.RETELL]: BOOKING_SOURCE.PHONE,
});

function sourceForChannel(channel) {
  const source = CHANNEL_SOURCE[channel];
  if (!source) {
    throw ApiError.validation([{ field: 'channel', message: 'Channel is not valid' }]);
  }
  return source;
}

async function restaurantActor() {
  const admin = await User.findOne({ role: ROLES.ADMIN, isActive: true }).sort({ createdAt: 1 });

  if (!admin) {
    throw new ApiError(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'Restaurant integration is not configured',
      ERROR_CODES.SERVICE_UNAVAILABLE
    );
  }

  return { id: String(admin.id), role: ROLES.STAFF };
}

function safeBooking(result) {
  const booking = result && result.booking ? result.booking : result;
  const tables = Array.isArray(booking.tables) && booking.tables.length > 0
    ? booking.tables
    : [booking.table].filter(Boolean);

  return {
    bookingReference: booking.bookingReference,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guests: booking.guests,
    serviceName: booking.serviceName,
    status: booking.status,
    source: booking.source,
    tables: tables.map((table) => ({
      id: String(table.id || table._id),
      tableNumber: table.tableNumber,
      capacity: table.capacity,
    })),
  };
}

async function assertDepositCanBeCollected(channel, guests) {
  if (channel === CHANNEL.WEBSITE) {
    return;
  }

  const deposit = await depositConfigService.calculateDepositRequirement(guests);
  if (deposit.required) {
    throw new ApiError(
      HTTP_STATUS.FORBIDDEN,
      'A deposit is required and this channel cannot collect it',
      ERROR_CODES.PAYMENT_REQUIRED
    );
  }
}

async function announceBooking(event, result) {
  const booking = result && result.booking ? result.booking : result;
  try {
    publishBooking(event, booking);
    if (event !== REALTIME_EVENT.BOOKING_CREATED || booking.status === BOOKING_STATUS.CONFIRMED) {
      await notifyBookingEvent(event, booking);
    }
  } catch (error) {
    logger.warn(`integration notification failed ${error.code || 'INTERNAL'}`);
  }
  return result;
}

async function createBooking({ channel, customer, date, startTime, guests, tableId, tableIds, notes }) {
  const source = sourceForChannel(channel);
  const resolved = await resolveExternalCustomer(customer || {});
  await assertCustomerCanOriginateBooking(resolved.id);
  await assertDepositCanBeCollected(channel, guests);

  const input = {
    date,
    startTime,
    guests,
    tableId,
    tableIds,
    notes,
    source,
    customerId: String(resolved.id),
  };
  const actor = source === BOOKING_SOURCE.WEBSITE
    ? { id: String(resolved.id), role: ROLES.CUSTOMER }
    : await restaurantActor();

  const created = await bookingService.createBooking({ actor, input });
  await announceBooking(REALTIME_EVENT.BOOKING_CREATED, created);
  return safeBooking(created);
}

async function cancelBooking({ reference, reason }) {
  const actor = await restaurantActor();
  const cancelled = await bookingService.cancelBooking({
    actor,
    bookingReference: reference,
    reason,
  });
  await announceBooking(REALTIME_EVENT.BOOKING_CANCELLED, cancelled);
  return safeBooking(cancelled);
}

async function rescheduleBooking({ reference, customerId, date, startTime, tableId }) {
  const actor = await restaurantActor();
  let customer = customerId;
  if (!customer) {
    const existing = await bookingService.getBooking({ actor, bookingReference: reference });
    customer = existing.customerId;
  }
  if (customer) {
    await assertCustomerCanOriginateBooking(customer);
  }

  const moved = await bookingService.rescheduleBooking({
    actor,
    bookingReference: reference,
    input: { date, startTime, tableId },
  });
  await announceBooking(REALTIME_EVENT.BOOKING_UPDATED, moved);
  return safeBooking(moved);
}

async function getBooking(reference) {
  const actor = await restaurantActor();
  return safeBooking(await bookingService.getBooking({
    actor,
    bookingReference: reference,
  }));
}

async function checkAvailability({ date, startTime, guests, location, shape, tag }) {
  const availability = await availabilityService.getAvailability({ date, startTime, guests });
  const recommendation = await recommendTables({ date, startTime, guests, location, shape, tag });

  return {
    available: Boolean(availability.available),
    reason: availability.reason || null,
    date: availability.date || date,
    startTime: availability.startTime || startTime,
    endTime: availability.endTime || null,
    serviceName: availability.service ? availability.service.name : null,
    maxGuests: availability.service ? availability.service.maxGuestsPerBooking : null,
    tables: (availability.tables || []).map((table) => ({
      id: String(table.id),
      tableNumber: table.tableNumber,
      capacity: table.capacity,
    })),
    recommendations: (recommendation.recommendations || []).map((item) => ({
      tableId: String(item.table.id),
      tableNumber: item.table.tableNumber,
      capacity: item.table.capacity,
      score: item.score,
    })),
  };
}

function channelStatus(options = {}) {
  const webhookConfigured = Boolean(options.webhookConfigured);
  const retellConfigured = Boolean(options.retellConfigured);
  const whatsappConfigured = Boolean(options.whatsappConfigured);
  const whatsappOutbound = Boolean(options.whatsappOutbound);

  return [
    {
      channel: 'website',
      label: 'Website',
      status: 'connected',
      detail: 'Website bookings use the booking API.',
    },
    {
      channel: 'phone',
      label: 'Phone',
      status: webhookConfigured ? 'ready' : 'not_configured',
      detail: webhookConfigured
        ? 'Signed phone requests can use the booking engine. No external phone provider is connected.'
        : 'Not configured',
    },
    {
      channel: 'whatsapp',
      label: 'WhatsApp',
      status: whatsappConfigured ? 'ready' : 'not_configured',
      detail: whatsappConfigured
        ? (whatsappOutbound
          ? 'WhatsApp webhooks can be verified and replies are configured. This screen does not send a message.'
          : 'WhatsApp webhooks can be verified. Outbound WhatsApp messages are not configured.')
        : 'Not configured. WhatsApp is not connected.',
    },
    {
      channel: 'retell',
      label: 'Retell',
      status: retellConfigured ? 'ready' : 'not_configured',
      detail: retellConfigured
        ? 'Retell webhook signatures can be verified. Retell bookings are stored as PHONE. This screen does not open a call.'
        : 'Not configured. Retell is not connected.',
    },
  ];
}

module.exports = {
  sourceForChannel,
  restaurantActor,
  createBooking,
  cancelBooking,
  rescheduleBooking,
  checkAvailability,
  getBooking,
  channelStatus,
};
