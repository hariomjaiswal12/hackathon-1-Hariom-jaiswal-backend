const ApiError = require('../../../utils/ApiError');
const HTTP_STATUS = require('../../../constants/httpStatus');
const { CHANNEL, INTEGRATION_EVENT_TYPE } = require('../../../constants/channels');
const { BOOKING_SOURCE } = require('../../../constants/bookings');
const bookingChannel = require('../../channel/bookingChannel');
const { resolveExternalCustomer } = require('../../channel/customers');
const { assertCustomerCanOriginateBooking } = require('../../blacklist.service');
const { createWaitlist } = require('../../waitlist.service');
const { notifyWaitlistEvent } = require('../../notification.service');
const { publishWaitlist } = require('../../realtime.service');
const { REALTIME_EVENT } = require('../../../constants/realtime');
const logger = require('../../../utils/logger');
const { runIdempotent } = require('../../channel/idempotency');
const { presentAvailability, presentExternalBooking, presentFailure } = require('../present');
const { sendText } = require('./whatsapp.client');
const {
  commandText,
  parseCommand,
  phoneFrom,
  contactName,
  incomingMessages,
  idempotencyKey,
} = require('./whatsapp.mapper');

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

function idsForNumbers(numbers, availability) {
  const candidates = [
    ...(availability.recommendations || []),
    ...(availability.tables || []),
  ];
  return numbers.map((number) => {
    const match = candidates.find((table) => String(table.tableNumber) === String(number));
    return match ? String(match.tableId || match.id) : '';
  });
}

async function chooseTable(fields, tableNumbers = []) {
  const availability = await bookingChannel.checkAvailability(fields);
  if (!availability.available) {
    throw unavailableError(availability.reason);
  }

  if (tableNumbers.length > 3) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'A booking can include at most three tables', 'VALIDATION_ERROR');
  }

  if (tableNumbers.length > 0) {
    const ids = idsForNumbers(tableNumbers, availability);
    if (ids.some((id) => !id)) {
      throw unavailableError('NO_SUITABLE_TABLE');
    }
    return tableNumbers.length === 1 ? { tableId: ids[0] } : { tableIds: ids };
  }

  const first = (availability.recommendations || [])[0];
  if (!first) {
    throw unavailableError('NO_SUITABLE_TABLE');
  }

  return { tableId: String(first.tableId) };
}

async function reply(to, data) {
  if (!data || data.success === false) {
    return { ...data, sent: false };
  }

  try {
    const delivery = await sendText(to, data.result);
    return { ...data, sent: Boolean(delivery.sent) };
  } catch (error) {
    return { ...data, sent: false };
  }
}

function presentWaitlist(entry) {
  return {
    success: true,
    waitlistReference: entry.waitlistReference,
    date: entry.date,
    requestedStartTime: entry.requestedStartTime,
    guests: entry.guests,
    serviceName: entry.serviceName,
    status: entry.status,
    result: `Waitlist ${entry.waitlistReference} is saved for ${entry.date} at ${entry.requestedStartTime}.`,
  };
}

async function runCommand(command, message, contact) {
  if (command.action === 'availability') {
    const availability = await bookingChannel.checkAvailability(command);
    const view = presentAvailability(availability);
    const tables = view.recommendedTables.map((table) => table.tableNumber).join(', ');
    const result = view.available
      ? `Available${view.service ? ` for ${view.service}` : ''} until ${view.endTime || 'the end of service'}. Tables: ${tables || 'none'}.`
      : `Not available. ${view.reason || ''}`.trim();
    return { ...view, result };
  }

  if (command.action === 'book') {
    return withBookingErrors(() => runIdempotent({
      idempotencyKey: idempotencyKey(message.id, 'book'),
      source: CHANNEL.WHATSAPP,
      eventType: INTEGRATION_EVENT_TYPE.BOOKING_CREATED,
      work: async () => {
        const selected = await chooseTable(command, command.tableNumbers || []);
        return bookingChannel.createBooking({
          channel: CHANNEL.WHATSAPP,
          customer: {
            name: command.name || contactName(contact),
            email: command.email,
            phone: phoneFrom(message),
          },
          date: command.date,
          startTime: command.startTime,
          guests: command.guests,
          ...(selected.tableIds ? { tableIds: selected.tableIds } : { tableId: selected.tableId }),
          notes: command.notes || undefined,
        });
      },
    }).then((outcome) => {
      const view = presentExternalBooking(outcome.result);
      return {
        ...view,
        result: `Reservation ${view.bookingReference} is confirmed for ${view.date} at ${view.startTime}.`,
      };
    }));
  }

  if (command.action === 'cancel') {
    return withBookingErrors(() => runIdempotent({
      idempotencyKey: idempotencyKey(message.id, 'cancel'),
      source: CHANNEL.WHATSAPP,
      eventType: INTEGRATION_EVENT_TYPE.BOOKING_CANCELLED,
      work: () => bookingChannel.cancelBooking({
        reference: command.reference,
        reason: command.reason || 'Cancelled by WhatsApp',
      }),
    }).then((outcome) => {
      const view = presentExternalBooking(outcome.result);
      return { ...view, result: `Reservation ${view.bookingReference} is cancelled.` };
    }));
  }

  if (command.action === 'waitlist') {
    return withBookingErrors(() => runIdempotent({
      idempotencyKey: idempotencyKey(message.id, 'waitlist'),
      source: CHANNEL.WHATSAPP,
      eventType: INTEGRATION_EVENT_TYPE.WAITLIST_CREATED,
      work: async () => {
        const customer = await resolveExternalCustomer({
          name: command.name || contactName(contact),
          email: command.email,
          phone: phoneFrom(message),
        });
        await assertCustomerCanOriginateBooking(customer.id);
        const actor = await bookingChannel.restaurantActor();
        const created = await createWaitlist({
          actor,
          input: {
            customerId: String(customer.id),
            date: command.date,
            requestedStartTime: command.startTime,
            guests: command.guests,
            source: BOOKING_SOURCE.WHATSAPP,
            notes: 'WhatsApp waitlist',
          },
        });
        try {
          publishWaitlist(REALTIME_EVENT.WAITLIST_CREATED, created.entry);
          await notifyWaitlistEvent(REALTIME_EVENT.WAITLIST_CREATED, created.entry);
        } catch (error) {
          logger.warn(`integration notification failed ${error.code || 'INTERNAL'}`);
        }
        return presentWaitlist(created.entry);
      },
    }).then((outcome) => outcome.result));
  }

  if (command.action === 'reschedule') {
    return withBookingErrors(() => runIdempotent({
      idempotencyKey: idempotencyKey(message.id, 'reschedule'),
      source: CHANNEL.WHATSAPP,
      eventType: INTEGRATION_EVENT_TYPE.BOOKING_RESCHEDULED,
      work: async () => {
        const current = await bookingChannel.getBooking(command.reference);
        const selected = await chooseTable({ ...command, guests: current.guests });
        return bookingChannel.rescheduleBooking({
          reference: command.reference,
          customerId: undefined,
          date: command.date,
          startTime: command.startTime,
          tableId: selected.tableId,
        });
      },
    }).then((outcome) => {
      const view = presentExternalBooking(outcome.result);
      return {
        ...view,
        result: `Reservation ${view.bookingReference} is now ${view.date} at ${view.startTime}.`,
      };
    }));
  }

  return {
    success: false,
    code: 'VALIDATION_ERROR',
    result: 'Send availability, book, cancel, or reschedule.',
  };
}

async function handle(body) {
  const messages = incomingMessages(body);
  const results = [];

  for (let index = 0; index < messages.length; index += 1) {
    const { message, contact } = messages[index];
    const command = parseCommand(commandText(message));
    if (!message.id || !command) {
      results.push({
        success: false,
        code: 'IGNORED',
        sent: false,
        result: 'No booking command was found.',
      });
      continue;
    }

    const data = await runCommand(command, message, contact);
    const bookingFailed = command.action !== 'availability' && (!data || data.success === false);
    if (bookingFailed) {
      results.push({ ...data, sent: false });
      continue;
    }
    const notified = await reply(phoneFrom(message), {
      ...data,
      success: data.success !== false || command.action === 'availability',
    });
    results.push({ ...data, sent: notified.sent });
  }

  return { results };
}

module.exports = {
  handle,
};
