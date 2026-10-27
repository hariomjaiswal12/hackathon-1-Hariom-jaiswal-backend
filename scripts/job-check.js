process.env.JOBS_ENABLED = 'false';
process.env.BOOKING_REMINDER_ENABLED = 'false';
process.env.WAITLIST_EXPIRY_ENABLED = 'false';
process.env.BOOKING_CLEANUP_ENABLED = 'false';
process.env.BOOKING_REMINDER_MINUTES = '120';
process.env.WAITLIST_EXPIRY_HOURS = '24';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { io } = require('socket.io-client');
const { parseCalendarDate, combineServerLocalDateTime } = require('../src/utils/calendar');

require('../src/app');

const baseUrl = 'http://127.0.0.1:5000/api/v1';
const socketUrl = 'http://127.0.0.1:5000';
const jobSocketPort = 5057;
const stamp = Date.now().toString().slice(-6);
const password = 'scheduled-job-pass-1';
const emails = {
  customer: `p11-customer-${stamp}@example.com`,
  other: `p11-other-${stamp}@example.com`,
  staff: `p11-staff-${stamp}@example.com`,
  admin: `p11-admin-${stamp}@example.com`,
};
const numbers = {
  a: `J${stamp}A`,
  b: `J${stamp}B`,
  c: `J${stamp}C`,
  d: `J${stamp}D`,
};
const state = {
  ready: false,
  openDay: null,
  previous: null,
  sockets: [],
  foreignWaitingIds: [],
  jobServer: null,
};

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function findDate(dayOfWeek) {
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= 28; day += 1) {
      const iso = `2099-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const parsed = parseCalendarDate(iso);
      if (parsed.dayOfWeek === dayOfWeek) {
        return parsed;
      }
    }
  }
  throw new Error(`No ${dayOfWeek} found`);
}

async function restoreDay(dayOfWeek, previous) {
  const Schedule = require('../src/models/Schedule');
  if (!previous) {
    await Schedule.deleteOne({ dayOfWeek });
    return;
  }
  await Schedule.findOneAndUpdate(
    { dayOfWeek },
    { dayOfWeek, isOpen: previous.isOpen, services: previous.services },
    { upsert: true }
  );
}

function collect(socket, event) {
  const items = [];
  socket.on(event, (payload) => items.push(payload));
  return items;
}

function connectSocket(url, token) {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket timeout'));
    }, 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function listen(server, port) {
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

async function main() {
  const { startScheduler, stopScheduler, runBookingReminderJob, runWaitlistExpiryJob, runBookingCleanupJob } = require('../src/jobs');
  const logger = require('../src/utils/logger');
  const { ACTIVE_BOOKING_STATUSES } = require('../src/constants/bookings');

  assert.strictEqual(cron.getTasks().size, 0);
  const disabled = startScheduler();
  assert.strictEqual(disabled.started, false);
  assert.deepStrictEqual(disabled.jobs, []);
  assert.strictEqual(cron.getTasks().size, 0);

  const jobLogs = [];
  const originalInfo = logger.info.bind(logger);
  logger.info = (message) => {
    jobLogs.push(message);
    originalInfo(message);
  };
  process.env.JOBS_ENABLED = 'true';
  process.env.BOOKING_REMINDER_ENABLED = 'true';
  process.env.WAITLIST_EXPIRY_ENABLED = 'true';
  process.env.BOOKING_CLEANUP_ENABLED = 'true';
  const enabled = startScheduler();
  assert.strictEqual(enabled.started, true);
  assert.deepStrictEqual(enabled.jobs.slice().sort(), ['bookingCleanup', 'bookingReminder', 'waitlistExpiry']);
  assert.ok(jobLogs.includes('[JOB] scheduler started'));
  assert.ok(jobLogs.includes('[JOB] bookingReminder started'));
  assert.strictEqual(cron.getTasks().size, 3);
  const duplicate = startScheduler();
  assert.strictEqual(duplicate.started, false);
  assert.strictEqual(duplicate.alreadyStarted, true);
  await stopScheduler();
  assert.strictEqual(cron.getTasks().size, 0);
  process.env.JOBS_ENABLED = 'false';
  process.env.BOOKING_REMINDER_ENABLED = 'false';
  process.env.WAITLIST_EXPIRY_ENABLED = 'false';
  process.env.BOOKING_CLEANUP_ENABLED = 'false';
  logger.info = originalInfo;

  const health = await request('/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.success, true);

  for (const [role, email] of Object.entries(emails)) {
    const response = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: `Phase Eleven ${role}`, email, password }),
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.body));
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../src/models/User');
  const Schedule = require('../src/models/Schedule');
  const Booking = require('../src/models/Booking');
  const Waitlist = require('../src/models/Waitlist');
  const Notification = require('../src/models/Notification');
  await User.updateOne({ email: emails.staff }, { role: 'STAFF' });
  await User.updateOne({ email: emails.admin }, { role: 'ADMIN' });

  const open = findDate('TUESDAY');
  const [year, month, day] = open.iso.split('-').map(Number);
  const reminderAt = new Date(year, month - 1, day, 13, 0, 0);
  const cleanupAt = new Date(year, month - 1, day, 17, 0, 0);
  const expiryAt = new Date(year, month - 1, day + 2, 12, 0, 0);
  state.openDay = open.dayOfWeek;
  state.previous = await Schedule.findOne({ dayOfWeek: open.dayOfWeek }).lean();
  state.ready = true;
  state.foreignWaitingIds = (await Waitlist.find({ status: 'WAITING' }).select('_id')).map((entry) => entry._id);

  async function login(email) {
    const response = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    return response.body.data;
  }

  const customer = await login(emails.customer);
  const other = await login(emails.other);
  const staff = await login(emails.staff);
  const admin = await login(emails.admin);
  const me = await request('/auth/me', { headers: authHeader(customer.token) });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.data.user.email, emails.customer);

  const staffSocket = await connectSocket(socketUrl, staff.token);
  state.sockets.push(staffSocket);
  const floorEvents = collect(staffSocket, 'booking:created');

  const saved = await request(`/schedules/${open.dayOfWeek}`, {
    method: 'PUT',
    headers: authHeader(admin.token),
    body: JSON.stringify({
      isOpen: true,
      services: [{
        name: 'LUNCH',
        startTime: '12:00',
        endTime: '23:00',
        lastBookingTime: '22:00',
        bookingDurationMinutes: 60,
        maxGuestsPerBooking: 20,
      }],
    }),
  });
  assert.strictEqual(saved.status, 200, JSON.stringify(saved.body));

  async function createTable(tableNumber, capacity) {
    const response = await request('/tables', {
      method: 'POST',
      headers: authHeader(admin.token),
      body: JSON.stringify({
        tableNumber,
        name: tableNumber,
        capacity,
        shape: 'SQUARE',
        location: 'CENTER',
        position: { x: 1, y: 2, rotation: 0 },
      }),
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.body));
    return response.body.data.table;
  }

  const tableA = await createTable(numbers.a, 4);
  const tableB = await createTable(numbers.b, 6);
  const tableC = await createTable(numbers.c, 4);
  const tableD = await createTable(numbers.d, 4);
  assert.strictEqual((await request('/tables')).status, 200);
  const availability = await request(`/availability?date=${open.iso}&time=15:00&guests=2`);
  assert.strictEqual(availability.status, 200);
  assert.strictEqual(availability.body.data.availability.available, true);
  const recommendation = await request(`/tables/recommendation?date=${open.iso}&time=15:00&guests=2`);
  assert.strictEqual(recommendation.status, 200);
  assert.ok(recommendation.body.data.recommendation.recommendations.length > 0);

  async function book(token, body) {
    return request('/bookings', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ date: open.iso, startTime: '15:00', ...body }),
    });
  }

  const confirmed = await book(customer.token, { guests: 2, tableId: tableC.id });
  assert.strictEqual(confirmed.status, 201, JSON.stringify(confirmed.body));
  const confirmedRef = confirmed.body.data.booking.bookingReference;
  assert.ok(floorEvents.some((event) => event.bookingReference === confirmedRef) || await new Promise((resolve) => {
    const timer = setInterval(() => {
      if (floorEvents.some((event) => event.bookingReference === confirmedRef)) {
        clearInterval(timer);
        resolve(true);
      }
    }, 40);
    setTimeout(() => {
      clearInterval(timer);
      resolve(false);
    }, 3000);
  }));
  assert.ok(floorEvents.some((event) => event.bookingReference === confirmedRef));

  const group = await book(customer.token, { guests: 10, tableIds: [tableA.id, tableB.id] });
  assert.strictEqual(group.status, 201, JSON.stringify(group.body));
  const groupRef = group.body.data.booking.bookingReference;
  assert.strictEqual(group.body.data.booking.tableIds.length, 2);

  const cancelled = await book(customer.token, { guests: 2, tableId: tableD.id });
  assert.strictEqual(cancelled.status, 201, JSON.stringify(cancelled.body));
  const cancelledRef = cancelled.body.data.booking.bookingReference;
  assert.strictEqual((await request(`/bookings/${cancelledRef}/cancel`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
    body: JSON.stringify({ reason: 'Changed plans' }),
  })).status, 200);

  const completed = await book(customer.token, { guests: 2, tableId: tableD.id });
  assert.strictEqual(completed.status, 201, JSON.stringify(completed.body));
  const completedRef = completed.body.data.booking.bookingReference;
  assert.strictEqual((await request(`/bookings/${completedRef}/arrive`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  assert.strictEqual((await request(`/bookings/${completedRef}/seat`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  assert.strictEqual((await request(`/bookings/${completedRef}/complete`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);

  const noShow = await book(customer.token, { guests: 2, tableId: tableD.id });
  assert.strictEqual(noShow.status, 201, JSON.stringify(noShow.body));
  const noShowRef = noShow.body.data.booking.bookingReference;
  assert.strictEqual((await request(`/bookings/${noShowRef}/arrive`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  assert.strictEqual((await request(`/bookings/${noShowRef}/no-show`, {
    method: 'PATCH',
    headers: authHeader(admin.token),
  })).status, 200);

  let releaseHold = () => {};
  const hold = new Promise((resolve) => {
    releaseHold = resolve;
  });
  const firstRun = runBookingReminderJob({ at: reminderAt, wait: hold });
  const secondRun = await runBookingReminderJob({ at: reminderAt });
  assert.strictEqual(secondRun.skipped, true);
  releaseHold();
  const finishedRun = await firstRun;
  assert.strictEqual(finishedRun.skipped, false);
  assert.ok(!finishedRun.failed);

  async function reminderCount(reference) {
    return Notification.countDocuments({ bookingReference: reference, type: 'BOOKING_REMINDER' });
  }

  assert.strictEqual(await reminderCount(confirmedRef), 1);
  assert.strictEqual(await reminderCount(groupRef), 1);
  assert.strictEqual(await reminderCount(cancelledRef), 0);
  assert.strictEqual(await reminderCount(completedRef), 0);
  assert.strictEqual(await reminderCount(noShowRef), 0);
  const reminder = await Notification.findOne({ bookingReference: confirmedRef, type: 'BOOKING_REMINDER' });
  assert.strictEqual(reminder.message, `Your reservation ${confirmedRef} starts in about 2 hours.`);
  assert.ok(!JSON.stringify(reminder).includes('password'));
  const repeat = await runBookingReminderJob({ at: reminderAt });
  assert.strictEqual(repeat.skipped, false);
  assert.strictEqual(await reminderCount(confirmedRef), 1);
  assert.strictEqual(await reminderCount(groupRef), 1);

  const untouched = await book(customer.token, { guests: 2, tableId: tableD.id });
  assert.strictEqual(untouched.status, 201, JSON.stringify(untouched.body));
  const untouchedRef = untouched.body.data.booking.bookingReference;
  const originalCreate = Notification.create;
  Notification.create = async () => {
    throw new Error('notification store unavailable');
  };
  try {
    const failedReminder = await runBookingReminderJob({ at: reminderAt });
    assert.strictEqual(failedReminder.failed, undefined);
    const stillConfirmed = await Booking.findOne({ bookingReference: untouchedRef });
    assert.strictEqual(stillConfirmed.status, 'CONFIRMED');
    assert.strictEqual(await reminderCount(untouchedRef), 0);
    assert.strictEqual(await reminderCount(confirmedRef), 1);
  } finally {
    Notification.create = originalCreate;
  }

  const originalFind = Booking.find;
  Booking.find = () => {
    throw new Error('reminder query failed');
  };
  try {
    const failedJob = await runBookingReminderJob({ at: reminderAt });
    assert.strictEqual(failedJob.failed, true);
  } finally {
    Booking.find = originalFind;
  }
  assert.strictEqual((await request('/health')).status, 200);
  assert.strictEqual((await Booking.findOne({ bookingReference: confirmedRef })).status, 'CONFIRMED');

  const beforeCleanup = await Booking.find({
    bookingReference: { $in: [confirmedRef, groupRef] },
  }).select('bookingReference status updatedAt');
  const cleanup = await runBookingCleanupJob({ at: cleanupAt });
  const afterCleanup = await Booking.find({
    bookingReference: { $in: [confirmedRef, groupRef] },
  }).select('bookingReference status updatedAt');
  assert.deepStrictEqual(
    afterCleanup.map((booking) => ({ reference: booking.bookingReference, status: booking.status })),
    beforeCleanup.map((booking) => ({ reference: booking.bookingReference, status: booking.status }))
  );
  const observed = await Booking.find({ status: { $in: ACTIVE_BOOKING_STATUSES } }).select('date endTime');
  const expectedStale = observed.filter((booking) => {
    const end = combineServerLocalDateTime(booking.date, booking.endTime);
    return end && end.getTime() <= cleanupAt.getTime();
  }).length;
  assert.strictEqual(cleanup.result.staleCount, expectedStale);
  assert.ok(expectedStale >= 2);

  async function addWaitlist(time, guests) {
    const response = await request('/waitlist', {
      method: 'POST',
      headers: authHeader(customer.token),
      body: JSON.stringify({ date: open.iso, requestedStartTime: time, guests }),
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.body));
    return response.body.data.waitlist;
  }

  const notified = await addWaitlist('12:15', 2);
  assert.strictEqual((await request(`/waitlist/${notified.waitlistReference}/notify`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  const converted = await addWaitlist('12:30', 2);
  assert.strictEqual((await request(`/waitlist/${converted.waitlistReference}/notify`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  assert.strictEqual((await request(`/waitlist/${converted.waitlistReference}/convert`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  assert.strictEqual(await Booking.countDocuments({ customerId: customer.user.id, date: open.iso, startTime: '12:30' }), 0);
  const cancelledWait = await addWaitlist('12:45', 2);
  assert.strictEqual((await request(`/waitlist/${cancelledWait.waitlistReference}/cancel`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
  })).status, 200);
  const alreadyExpired = await addWaitlist('13:15', 2);
  assert.strictEqual((await request(`/waitlist/${alreadyExpired.waitlistReference}/expire`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);

  const race = await addWaitlist('13:30', 2);
  const originalFindById = Waitlist.findById;
  Waitlist.findById = function findById(id, ...args) {
    if (String(id) !== String(race.id)) {
      return originalFindById.call(Waitlist, id, ...args);
    }
    return Waitlist.updateOne(
      { _id: id, status: 'WAITING' },
      { $set: { status: 'NOTIFIED' } }
    ).then(() => originalFindById.call(Waitlist, id, ...args));
  };
  try {
    await runWaitlistExpiryJob({ at: expiryAt });
  } finally {
    Waitlist.findById = originalFindById;
  }
  assert.strictEqual((await Waitlist.findById(race.id)).status, 'NOTIFIED');

  const waiting = await addWaitlist('13:45', 2);
  const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');
  const jobServer = http.createServer();
  state.jobServer = jobServer;
  initializeRealtime(jobServer);
  await listen(jobServer, jobSocketPort);
  const expirySocket = await connectSocket(`http://127.0.0.1:${jobSocketPort}`, staff.token);
  state.sockets.push(expirySocket);
  const expiryEvents = collect(expirySocket, 'waitlist:updated');
  const expiryRun = await runWaitlistExpiryJob({ at: expiryAt });
  assert.ok(expiryRun.result.expired >= 1);
  assert.strictEqual((await Waitlist.findOne({ waitlistReference: waiting.waitlistReference })).status, 'EXPIRED');
  assert.strictEqual((await Waitlist.findOne({ waitlistReference: notified.waitlistReference })).status, 'NOTIFIED');
  assert.strictEqual((await Waitlist.findOne({ waitlistReference: converted.waitlistReference })).status, 'CONVERTED');
  assert.strictEqual((await Waitlist.findOne({ waitlistReference: cancelledWait.waitlistReference })).status, 'CANCELLED');
  assert.strictEqual((await Waitlist.findOne({ waitlistReference: alreadyExpired.waitlistReference })).status, 'EXPIRED');
  assert.strictEqual((await Waitlist.findById(race.id)).status, 'NOTIFIED');
  const started = Date.now();
  while (!expiryEvents.some((event) => event.waitlistReference === waiting.waitlistReference && event.status === 'EXPIRED')) {
    if (Date.now() - started > 3000) {
      throw new Error('Timed out waiting for waitlist:updated');
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.strictEqual(await Notification.countDocuments({
    waitlistReference: waiting.waitlistReference,
    type: 'WAITLIST_CREATED',
  }), 1);
  assert.strictEqual(await Notification.countDocuments({
    waitlistReference: waiting.waitlistReference,
    type: { $nin: ['WAITLIST_CREATED'] },
  }), 0);

  const listed = await request('/notifications', { headers: authHeader(customer.token) });
  assert.strictEqual(listed.status, 200);
  assert.ok(listed.body.data.notifications.some((item) => item.type === 'BOOKING_CREATED' && item.bookingReference === confirmedRef));
  assert.ok(listed.body.data.notifications.some((item) => item.type === 'BOOKING_REMINDER' && item.bookingReference === confirmedRef));
  const otherListed = await request('/notifications', { headers: authHeader(other.token) });
  assert.ok(!otherListed.body.data.notifications.some((item) => item.bookingReference === confirmedRef));

  const status = await request('/admin/jobs/status', { headers: authHeader(admin.token) });
  assert.strictEqual(status.status, 200, JSON.stringify(status.body));
  assert.strictEqual(status.body.data.jobsEnabled, false);
  assert.deepStrictEqual(status.body.data.jobs.map((job) => job.name), ['bookingReminder', 'waitlistExpiry', 'bookingCleanup']);
  status.body.data.jobs.forEach((job) => {
    assert.strictEqual(job.enabled, false);
    assert.strictEqual(job.running, false);
    assert.strictEqual(job.lastRunAt, null);
    assert.strictEqual(job.lastFailureAt, null);
    assert.ok(!Object.prototype.hasOwnProperty.call(job, 'stack'));
  });
  assert.strictEqual((await request('/admin/jobs/status', { headers: authHeader(customer.token) })).status, 403);
  assert.strictEqual((await request('/admin/jobs/status', { headers: authHeader(staff.token) })).status, 403);
  assert.strictEqual((await request('/admin/jobs/run', {
    method: 'POST',
    headers: authHeader(admin.token),
  })).status, 404);
  assert.strictEqual((await request('/jobs/run', {
    method: 'POST',
    headers: authHeader(customer.token),
  })).status, 404);
  const liveFloor = await request('/tables/floor/live', { headers: authHeader(staff.token) });
  assert.strictEqual(liveFloor.status, 200);
  assert.ok(Array.isArray(liveFloor.body.data.tables));
  assert.strictEqual((await request('/tables/floor/live', { headers: authHeader(customer.token) })).status, 403);

  console.log('job-checks-passed');
}

async function cleanup() {
  const { stopScheduler } = require('../src/jobs');
  const { closeRealtime } = require('../src/services/realtime.service');
  await stopScheduler();
  state.sockets.forEach((socket) => socket.close());
  closeRealtime();
  if (state.jobServer) {
    await new Promise((resolve) => state.jobServer.close(resolve));
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const Table = require('../src/models/Table');
  const Booking = require('../src/models/Booking');
  const BookingLock = require('../src/models/BookingLock');
  const Waitlist = require('../src/models/Waitlist');
  const Notification = require('../src/models/Notification');
  const User = require('../src/models/User');
  if (state.foreignWaitingIds.length > 0) {
    await Waitlist.updateMany(
      { _id: { $in: state.foreignWaitingIds }, status: 'EXPIRED' },
      { $set: { status: 'WAITING' } }
    );
  }
  const users = await User.find({ email: { $in: Object.values(emails) } }).select('_id');
  const userIds = users.map((user) => user._id);
  const tables = await Table.find({ tableNumber: { $in: Object.values(numbers) } }).select('_id');
  const tableIds = tables.map((table) => table._id);
  await Notification.deleteMany({ recipientUserId: { $in: userIds } });
  await Waitlist.deleteMany({ customerId: { $in: userIds } });
  await Booking.deleteMany({
    $or: [{ tableId: { $in: tableIds } }, { tableIds: { $in: tableIds } }],
  });
  await BookingLock.deleteMany({ tableId: { $in: tableIds } });
  await Table.deleteMany({ _id: { $in: tableIds } });
  if (state.ready) {
    await restoreDay(state.openDay, state.previous);
  }
  await User.deleteMany({ email: { $in: Object.values(emails) } });
  await mongoose.disconnect();
}

main()
  .then(() => cleanup())
  .catch(async (error) => {
    console.error(error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error(cleanupError);
    }
    process.exit(1);
  });
