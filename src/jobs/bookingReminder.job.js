const Booking = require('../models/Booking');
const User = require('../models/User');
const { runJob } = require('../services/job.service');
const { notifyBookingReminder } = require('../services/notification.service');
const { readJobConfig } = require('../config/env');
const { BOOKING_STATUS } = require('../constants/bookings');
const { ROLES } = require('../constants/roles');
const { combineServerLocalDateTime, formatServerLocalClock } = require('../utils/calendar');

const REMINDER_WINDOW_MINUTES = 5;

function reminderDates(now, leadMinutes) {
  const earliest = new Date(now.getTime() + (leadMinutes - REMINDER_WINDOW_MINUTES) * 60000);
  const latest = new Date(now.getTime() + leadMinutes * 60000);
  return [...new Set([
    formatServerLocalClock(earliest).date,
    formatServerLocalClock(latest).date,
  ])];
}

async function remindDueBookings(options) {
  if (options.wait) {
    await options.wait;
  }

  const now = options.at instanceof Date ? options.at : new Date();
  const leadMinutes = readJobConfig().bookingReminderMinutes;
  const bookings = await Booking.find({
    status: BOOKING_STATUS.CONFIRMED,
    date: { $in: reminderDates(now, leadMinutes) },
  });
  const customerIds = [...new Set(bookings.map((booking) => String(booking.customerId)))];
  const customers = await User.find({
    _id: { $in: customerIds },
    role: ROLES.CUSTOMER,
  }).select('_id');
  const customerSet = new Set(customers.map((customer) => String(customer._id)));
  let reminded = 0;

  for (const booking of bookings) {
    if (!customerSet.has(String(booking.customerId))) {
      continue;
    }

    const start = combineServerLocalDateTime(booking.date, booking.startTime);

    if (!start) {
      continue;
    }

    const minutesUntil = Math.floor((start.getTime() - now.getTime()) / 60000);
    const due = minutesUntil >= 0
      && minutesUntil <= leadMinutes
      && minutesUntil > leadMinutes - REMINDER_WINDOW_MINUTES;

    if (!due) {
      continue;
    }

    await notifyBookingReminder(booking, leadMinutes);
    reminded += 1;
  }

  return { reminded };
}

function runBookingReminderJob(options = {}) {
  return runJob('bookingReminder', () => remindDueBookings(options));
}

module.exports = {
  runBookingReminderJob,
};
