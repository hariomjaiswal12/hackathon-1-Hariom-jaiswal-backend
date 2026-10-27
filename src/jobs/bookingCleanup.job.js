const Booking = require('../models/Booking');
const { runJob } = require('../services/job.service');
const logger = require('../utils/logger');
const { ACTIVE_BOOKING_STATUSES } = require('../constants/bookings');
const { combineServerLocalDateTime } = require('../utils/calendar');

async function reportStaleBookings(options) {
  if (options.wait) {
    await options.wait;
  }

  const now = options.at instanceof Date ? options.at : new Date();
  const bookings = await Booking.find({ status: { $in: ACTIVE_BOOKING_STATUSES } })
    .select('date endTime status');
  let staleCount = 0;

  bookings.forEach((booking) => {
    const end = combineServerLocalDateTime(booking.date, booking.endTime);

    if (end && end.getTime() <= now.getTime()) {
      staleCount += 1;
    }
  });

  logger.info(`[JOB] bookingCleanup observed ${staleCount} operational bookings past their end time`);
  return { staleCount };
}

function runBookingCleanupJob(options = {}) {
  return runJob('bookingCleanup', () => reportStaleBookings(options));
}

module.exports = {
  runBookingCleanupJob,
};
