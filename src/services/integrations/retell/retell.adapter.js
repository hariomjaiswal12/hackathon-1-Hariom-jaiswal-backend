const ApiError = require('../../../utils/ApiError');
const HTTP_STATUS = require('../../../constants/httpStatus');
const { CHANNEL, INTEGRATION_EVENT_TYPE } = require('../../../constants/channels');
const bookingChannel = require('../../channel/bookingChannel');
const { runIdempotent } = require('../../channel/idempotency');
const { presentAvailability, presentExternalBooking, presentFailure } = require('../present');
const { requestFields, customerFrom, idempotencyKey, selectTables, parseRetellBody } = require('./retell.mapper');

function availabilitySpeech(view) {
  if (!view.available) {
    return `That time is not available. ${view.reason || ''}`.trim();
  }

  const tables = view.recommendedTables.map((table) => `table ${table.tableNumber}`).join(', ');
  const until = view.endTime ? ` until ${view.endTime}` : '';
  const service = view.service ? ` during ${view.service}` : '';
  return `Yes, that time is available${service}${until}. Recommended: ${tables || 'ask the restaurant for a table'}.`;
}

function bookingSpeech(booking, action) {
  const tables = booking.tables.map((table) => `table ${table.tableNumber}`).join(', ');
  return `${action} ${booking.bookingReference} for ${booking.date} at ${booking.startTime} until ${booking.endTime}, ${booking.guests} guests${tables ? `, ${tables}` : ''}.`;
}

function unavailableError(reason) {
  return new ApiError(
    HTTP_STATUS.CONFLICT,
    'That time is not available',
    reason || 'NO_SUITABLE_TABLE'
  );
}

async function withBookingErrors(work) {
  try {
    return await work();
  } catch (error) {
    if (!error || !error.isOperational) {
      throw error;
    }
    return presentFailure(error);
  }
}

function speakBooking(booking, action) {
  const view = presentExternalBooking(booking);
  return { ...view, result: bookingSpeech(view, action) };
}

async function chooseTable(args) {
  const fields = requestFields(args);
  const availability = await bookingChannel.checkAvailability(fields);
  if (!availability.available) {
    throw unavailableError(availability.reason);
  }

  const selected = selectTables(args, availability);
  if (!selected.tableId && !(selected.tableIds || []).length) {
    throw unavailableError('NO_SUITABLE_TABLE');
  }

  return { fields, ...selected };
}

async function checkAvailability(args) {
  const availability = await bookingChannel.checkAvailability(requestFields(args));
  const view = presentAvailability(availability);
  return { ...view, result: availabilitySpeech(view) };
}

async function createBooking(args, call) {
  return withBookingErrors(() => runIdempotent({
    idempotencyKey: idempotencyKey(call, 'create_booking', args),
    source: CHANNEL.RETELL,
    eventType: INTEGRATION_EVENT_TYPE.BOOKING_CREATED,
    work: async () => {
      const selected = await chooseTable(args);
      return bookingChannel.createBooking({
        channel: CHANNEL.RETELL,
        customer: customerFrom(args, call),
        date: selected.fields.date,
        startTime: selected.fields.startTime,
        guests: selected.fields.guests,
        ...(selected.tableIds ? { tableIds: selected.tableIds } : { tableId: selected.tableId }),
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      });
    },
  }).then((outcome) => speakBooking(outcome.result, 'Reservation')));
}

async function cancelBooking(args, call) {
  return withBookingErrors(() => runIdempotent({
    idempotencyKey: idempotencyKey(call, 'cancel_booking', args),
    source: CHANNEL.RETELL,
    eventType: INTEGRATION_EVENT_TYPE.BOOKING_CANCELLED,
    work: () => bookingChannel.cancelBooking({
      reference: args.bookingReference || args.reference,
      reason: typeof args.reason === 'string' ? args.reason : 'Cancelled by phone',
    }),
  }).then((outcome) => speakBooking(outcome.result, 'Cancelled')));
}

async function rescheduleBooking(args, call) {
  return withBookingErrors(() => runIdempotent({
    idempotencyKey: idempotencyKey(call, 'reschedule_booking', args),
    source: CHANNEL.RETELL,
    eventType: INTEGRATION_EVENT_TYPE.BOOKING_RESCHEDULED,
    work: async () => {
      const current = await bookingChannel.getBooking(args.bookingReference || args.reference);
      const selected = await chooseTable({ ...args, guests: args.guests || current.guests });
      return bookingChannel.rescheduleBooking({
        reference: args.bookingReference || args.reference,
        date: selected.fields.date,
        startTime: selected.fields.startTime,
        tableId: selected.tableId,
      });
    },
  }).then((outcome) => speakBooking(outcome.result, 'Rescheduled')));
}

async function getBooking(args) {
  return withBookingErrors(async () => {
    const booking = await bookingChannel.getBooking(args.bookingReference || args.reference);
    return speakBooking(booking, 'Reservation');
  });
}

async function dispatch(name, args, call) {
  if (name === 'check_availability') return checkAvailability(args);
  if (name === 'create_booking') return createBooking(args, call);
  if (name === 'cancel_booking') return cancelBooking(args, call);
  if (name === 'reschedule_booking') return rescheduleBooking(args, call);
  if (name === 'get_booking') return getBooking(args);
  return {
    success: false,
    code: 'VALIDATION_ERROR',
    result: 'That action is not available.',
  };
}

async function handle(body) {
  const parsed = parseRetellBody(body);
  if (parsed.kind === 'call') {
    return { acknowledged: true };
  }
  if (parsed.kind !== 'function') {
    return {
      result: 'The request could not be understood.',
      data: { success: false, code: 'VALIDATION_ERROR' },
    };
  }

  const data = await dispatch(parsed.name, parsed.args, parsed.call);
  return { result: data.result, data };
}

module.exports = {
  handle,
};
