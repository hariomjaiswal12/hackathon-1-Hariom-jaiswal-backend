const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const channel = require('../services/channel');

const createBooking = asyncHandler(async (req, res) => {
  const outcome = await channel.createExternalBooking({
    channel: req.body.channel,
    idempotencyKey: req.get('Idempotency-Key'),
    input: {
      customer: req.body.customer,
      date: req.body.date,
      startTime: req.body.startTime,
      guests: req.body.guests,
      tableId: req.body.tableId,
      tableIds: req.body.tableIds,
      notes: req.body.notes,
    },
  });

  const payload = { booking: outcome.result };
  if (outcome.replayed) {
    return ApiResponse.ok(res, 'Existing booking returned', payload);
  }
  return ApiResponse.created(res, 'Booking created', payload);
});

const cancelBooking = asyncHandler(async (req, res) => {
  const outcome = await channel.cancelExternalBooking({
    channel: req.body.channel,
    idempotencyKey: req.get('Idempotency-Key'),
    reference: req.params.reference,
    reason: req.body.reason,
  });
  return ApiResponse.ok(res, 'Booking cancelled', { booking: outcome.result });
});

const rescheduleBooking = asyncHandler(async (req, res) => {
  const outcome = await channel.rescheduleExternalBooking({
    channel: req.body.channel,
    idempotencyKey: req.get('Idempotency-Key'),
    reference: req.params.reference,
    input: {
      date: req.body.date,
      startTime: req.body.startTime,
      tableId: req.body.tableId,
    },
  });
  return ApiResponse.ok(res, 'Booking rescheduled', { booking: outcome.result });
});

const checkAvailability = asyncHandler(async (req, res) => {
  const availability = await channel.checkAvailability({
    date: req.body.date,
    startTime: req.body.startTime,
    guests: req.body.guests,
  });
  return ApiResponse.ok(res, 'Availability retrieved', { availability });
});

const getStatus = asyncHandler(async (_req, res) => {
  return ApiResponse.ok(res, 'Integration status retrieved', channel.integrationStatus());
});

module.exports = {
  createBooking,
  cancelBooking,
  rescheduleBooking,
  checkAvailability,
  getStatus,
};
