const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const bookingService = require('../services/booking.service');
const { publishBooking } = require('../services/realtime.service');
const { notifyBookingEvent } = require('../services/notification.service');
const { BOOKING_STATUS } = require('../constants/bookings');
const { REALTIME_EVENT } = require('../constants/realtime');

const createBooking = asyncHandler(async (req, res) => {
  const result = await bookingService.createBooking({
    actor: req.user,
    input: {
      date: req.body.date,
      startTime: req.body.startTime,
      guests: req.body.guests,
      tableId: req.body.tableId,
      tableIds: req.body.tableIds,
      notes: req.body.notes,
      customerId: req.body.customerId,
      source: req.body.source,
    },
  });

  const booking = result.booking || result;
  const payment = result.payment || null;

  publishBooking(REALTIME_EVENT.BOOKING_CREATED, booking);
  if (booking.status === BOOKING_STATUS.CONFIRMED) {
    await notifyBookingEvent(REALTIME_EVENT.BOOKING_CREATED, booking);
  }

  const message = booking.status === BOOKING_STATUS.PENDING
    ? 'Booking created — deposit payment required'
    : 'Booking confirmed';

  return ApiResponse.created(res, message, { booking, payment });
});

const listBookings = asyncHandler(async (req, res) => {
  const bookings = await bookingService.listBookings({
    actor: req.user,
    query: req.query,
  });

  return ApiResponse.ok(res, 'Bookings retrieved', { bookings });
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBooking({
    actor: req.user,
    bookingReference: req.params.reference,
  });

  return ApiResponse.ok(res, 'Booking retrieved', { booking });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancelBooking({
    actor: req.user,
    bookingReference: req.params.reference,
    reason: req.body.reason,
  });

  publishBooking(REALTIME_EVENT.BOOKING_CANCELLED, booking);
  await notifyBookingEvent(REALTIME_EVENT.BOOKING_CANCELLED, booking);
  return ApiResponse.ok(res, 'Booking cancelled', { booking });
});

const rescheduleBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.rescheduleBooking({
    actor: req.user,
    bookingReference: req.params.reference,
    input: {
      date: req.body.date,
      startTime: req.body.startTime,
      tableId: req.body.tableId,
    },
  });

  publishBooking(REALTIME_EVENT.BOOKING_UPDATED, booking);
  await notifyBookingEvent(REALTIME_EVENT.BOOKING_UPDATED, booking);
  return ApiResponse.ok(res, 'Booking rescheduled', { booking });
});

function statusAction(toStatus, message, event) {
  return asyncHandler(async (req, res) => {
    const booking = await bookingService.changeBookingStatus({
      actor: req.user,
      bookingReference: req.params.reference,
      toStatus,
    });

    publishBooking(event, booking);
    await notifyBookingEvent(event, booking);
    return ApiResponse.ok(res, message, { booking });
  });
}

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  cancelBooking,
  rescheduleBooking,
  arriveBooking: statusAction(BOOKING_STATUS.ARRIVED, 'Guest arrived', REALTIME_EVENT.BOOKING_ARRIVED),
  seatBooking: statusAction(BOOKING_STATUS.SEATED, 'Guest seated', REALTIME_EVENT.BOOKING_SEATED),
  completeBooking: statusAction(BOOKING_STATUS.COMPLETED, 'Booking completed', REALTIME_EVENT.BOOKING_COMPLETED),
  markNoShow: statusAction(BOOKING_STATUS.NO_SHOW, 'Booking marked as no-show', REALTIME_EVENT.BOOKING_NO_SHOW),
};
