/**
 * Removes records identified as automated QA leftovers.
 * Keeps the seeded admin, staff, and Amaia accounts, the weekly schedule,
 * the restaurant tables, and the Christmas closed day.
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');

const KEEP_EMAILS = new Set([
  'admin@iturrieta.eus',
  'staff@iturrieta.eus',
  'amaia@iturrieta.eus',
]);

const TEST_EMAIL = /^(qa15|e2e-cust-|p10-|test-cust-)/i;
const AMAIA_BOOKING_NOTES = [
  'End-to-end integration test booking',
  'QA15 browser flow',
];
const AMAIA_WAITLIST_NOTES = ['Testing waitlist entry'];

async function main() {
  await mongoose.connect(env.mongodbUri);
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const bookings = db.collection('bookings');
  const waitlists = db.collection('waitlists');
  const notifications = db.collection('notifications');
  const closedDays = db.collection('closeddays');

  const allUsers = await users.find({}, { projection: { email: 1 } }).toArray();
  const removeUsers = allUsers.filter((user) => !KEEP_EMAILS.has(user.email) && TEST_EMAIL.test(user.email));
  const removeIds = removeUsers.map((user) => user._id);
  console.log('TEST USERS');
  removeUsers.forEach((user) => console.log(user.email));

  const amaia = allUsers.find((user) => user.email === 'amaia@iturrieta.eus');
  const amaiaBookings = amaia
    ? await bookings.find({ customerId: amaia._id, notes: { $in: AMAIA_BOOKING_NOTES } }).toArray()
    : [];
  const amaiaWaitlist = amaia
    ? await waitlists.find({ customerId: amaia._id, notes: { $in: AMAIA_WAITLIST_NOTES } }).toArray()
    : [];
  console.log('AMAIA TEST BOOKINGS', amaiaBookings.map((booking) => booking.bookingReference).join(', ') || 'none');
  console.log('AMAIA TEST WAITLIST', amaiaWaitlist.map((entry) => entry.waitlistReference).join(', ') || 'none');

  if (removeIds.length) {
    const bookingResult = await bookings.deleteMany({ customerId: { $in: removeIds } });
    const waitResult = await waitlists.deleteMany({ customerId: { $in: removeIds } });
    const noteResult = await notifications.deleteMany({ recipientUserId: { $in: removeIds } });
    const userResult = await users.deleteMany({ _id: { $in: removeIds } });
    console.log('DELETED', {
      users: userResult.deletedCount,
      bookings: bookingResult.deletedCount,
      waitlist: waitResult.deletedCount,
      notifications: noteResult.deletedCount,
    });
  }

  if (amaiaBookings.length) {
    const result = await bookings.deleteMany({ _id: { $in: amaiaBookings.map((booking) => booking._id) } });
    const notes = await notifications.deleteMany({
      recipientUserId: amaia._id,
      bookingId: { $in: amaiaBookings.map((booking) => booking._id) },
    });
    console.log('DELETED AMAIA TEST BOOKINGS', result.deletedCount, 'notifications', notes.deletedCount);
  }

  if (amaiaWaitlist.length) {
    const result = await waitlists.deleteMany({ _id: { $in: amaiaWaitlist.map((entry) => entry._id) } });
    console.log('DELETED AMAIA TEST WAITLIST', result.deletedCount);
  }

  const closed = await closedDays.deleteMany({ reason: /^QA15 / });
  console.log('DELETED QA CLOSED DAYS', closed.deletedCount);

  const remainingUsers = await users.find({}, { projection: { email: 1, role: 1 } }).toArray();
  console.log('REMAINING USERS');
  remainingUsers.forEach((user) => console.log(user.role, user.email));
  const remainingBookings = await bookings.find({}, { projection: { bookingReference: 1, date: 1, notes: 1, status: 1 } }).toArray();
  console.log('REMAINING BOOKINGS', remainingBookings.length);
  remainingBookings.forEach((booking) => console.log(booking.bookingReference, booking.date, booking.status, JSON.stringify(booking.notes || '')));
  const tables = await db.collection('tables').find({}, { projection: { tableNumber: 1, status: 1 } }).toArray();
  console.log('TABLES', tables.map((table) => `${table.tableNumber}:${table.status}`).join(' '));
  const days = await db.collection('schedules').find({}, { projection: { dayOfWeek: 1, isOpen: 1, services: 1 } }).toArray();
  days.sort((a, b) => String(a.dayOfWeek).localeCompare(String(b.dayOfWeek)));
  days.forEach((day) => console.log(day.dayOfWeek, day.isOpen, (day.services || []).map((service) => service.name).join('+')));
  const closedLeft = await closedDays.find({}, { projection: { date: 1, reason: 1, isActive: 1 } }).toArray();
  console.log('CLOSED DAYS', closedLeft.map((day) => `${day.date}:${day.isActive}:${day.reason}`).join(' | ') || 'none');

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
