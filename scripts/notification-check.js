const assert = require('assert');
require('../src/config/env');
const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const { parseCalendarDate } = require('../src/utils/calendar');

const baseUrl = 'http://127.0.0.1:5000/api/v1';
const socketUrl = 'http://127.0.0.1:5000';
const stamp = Date.now().toString().slice(-6);
const password = 'notification-pass-1';
const emails = {
  customer: `p10-customer-${stamp}@example.com`,
  other: `p10-other-${stamp}@example.com`,
  staff: `p10-staff-${stamp}@example.com`,
  admin: `p10-admin-${stamp}@example.com`,
};
const numbers = {
  a: `N${stamp}A`,
  b: `N${stamp}B`,
  c: `N${stamp}C`,
  d: `N${stamp}D`,
};
const state = {
  ready: false,
  openDay: null,
  previous: null,
  sockets: [],
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
  const body = await response.json();
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

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(socketUrl, {
      auth: token ? { token } : {},
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

function expectRejectedSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(socketUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('expected the socket to be rejected'));
    }, 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error('socket connected when it should have been rejected'));
    });
    socket.on('connect_error', () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    });
  });
}

async function waitFor(predicate, label) {
  const start = Date.now();
  while (Date.now() - start < 4000) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        if (!settled) {
          settled = true;
          resolve(this);
        }
        return this;
      },
    };
    handler(req, res, (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

async function main() {
  const health = await request('/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.success, true);

  for (const [role, email] of Object.entries(emails)) {
    const response = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: `Phase Ten ${role}`, email, password }),
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.body));
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../src/models/User');
  const Schedule = require('../src/models/Schedule');
  const Booking = require('../src/models/Booking');
  const Notification = require('../src/models/Notification');
  await User.updateOne({ email: emails.staff }, { role: 'STAFF' });
  await User.updateOne({ email: emails.admin }, { role: 'ADMIN' });

  const open = findDate('SUNDAY');
  state.openDay = open.dayOfWeek;
  state.previous = await Schedule.findOne({ dayOfWeek: open.dayOfWeek }).lean();
  state.ready = true;

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

  await expectRejectedSocket();
  await expectRejectedSocket('not-a-token');

  const customerSocket = await connectSocket(customer.token);
  const otherSocket = await connectSocket(other.token);
  const staffSocket = await connectSocket(staff.token);
  state.sockets.push(customerSocket, otherSocket, staffSocket);
  const customerNotifications = collect(customerSocket, 'notification:new');
  const customerFloorEvents = collect(customerSocket, 'booking:created');
  const otherNotifications = collect(otherSocket, 'notification:new');
  const staffFloorEvents = collect(staffSocket, 'booking:created');
  const staffNotifications = collect(staffSocket, 'notification:new');

  const denied = await customerSocket.timeout(2000).emitWithAck('subscribe', `user:${other.user.id}`);
  assert.strictEqual(denied.ok, false);
  const ownRoom = await customerSocket.timeout(2000).emitWithAck('subscribe', `user:${customer.user.id}`);
  assert.strictEqual(ownRoom.ok, true);
  const floorDenied = await customerSocket.timeout(2000).emitWithAck('subscribe', 'floor:live');
  assert.strictEqual(floorDenied.ok, false);

  const saved = await request(`/schedules/${open.dayOfWeek}`, {
    method: 'PUT',
    headers: authHeader(admin.token),
    body: JSON.stringify({
      isOpen: true,
      services: [
        {
          name: 'LUNCH',
          startTime: '12:00',
          endTime: '23:00',
          lastBookingTime: '22:00',
          bookingDurationMinutes: 60,
          maxGuestsPerBooking: 20,
        },
      ],
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
  const catalog = await request('/tables');
  assert.strictEqual(catalog.status, 200);
  assert.ok(catalog.body.data.tables.some((table) => table.id === tableA.id));

  const availability = await request(`/availability?date=${open.iso}&time=13:00&guests=2`);
  assert.strictEqual(availability.status, 200);
  assert.strictEqual(availability.body.data.availability.available, true);
  const recommendation = await request(`/tables/recommendation?date=${open.iso}&time=13:00&guests=2`);
  assert.strictEqual(recommendation.status, 200);
  assert.ok(recommendation.body.data.recommendation.recommendations.length > 0);

  async function book(token, body) {
    return request('/bookings', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ date: open.iso, ...body }),
    });
  }

  async function notificationsFor(token, query = '') {
    const response = await request(`/notifications${query}`, { headers: authHeader(token) });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    return response.body.data.notifications;
  }

  function countType(items, reference, type) {
    return items.filter((item) => item.bookingReference === reference && item.type === type).length;
  }

  const created = await book(customer.token, {
    startTime: '13:00',
    guests: 2,
    tableId: tableC.id,
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  const lifecycle = created.body.data.booking;
  assert.deepStrictEqual(lifecycle.tableIds.map(String), [String(tableC.id)]);
  await waitFor(
    () => customerNotifications.some((item) => item.type === 'BOOKING_CREATED' && item.notificationReference),
    'booking created notification'
  );
  const persisted = await Notification.find({ bookingReference: lifecycle.bookingReference, type: 'BOOKING_CREATED' });
  assert.strictEqual(persisted.length, 1);
  assert.strictEqual(persisted[0].channel, 'IN_APP');
  assert.strictEqual(persisted[0].status, 'UNREAD');
  assert.strictEqual(String(persisted[0].recipientUserId), String(customer.user.id));
  assert.ok(!JSON.stringify(persisted[0].metadata).includes('password'));

  const notificationService = require('../src/services/notification.service');
  const beforeDuplicate = await Notification.countDocuments({
    bookingReference: lifecycle.bookingReference,
    type: 'BOOKING_CREATED',
  });
  await notificationService.notifyBookingEvent('booking:created', lifecycle);
  const afterDuplicate = await Notification.countDocuments({
    bookingReference: lifecycle.bookingReference,
    type: 'BOOKING_CREATED',
  });
  assert.strictEqual(beforeDuplicate, 1);
  assert.strictEqual(afterDuplicate, 1);

  const rescheduled = await request(`/bookings/${lifecycle.bookingReference}/reschedule`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
    body: JSON.stringify({ date: open.iso, startTime: '13:30', tableId: tableC.id }),
  });
  assert.strictEqual(rescheduled.status, 200, JSON.stringify(rescheduled.body));
  const arrived = await request(`/bookings/${lifecycle.bookingReference}/arrive`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  });
  assert.strictEqual(arrived.status, 200, JSON.stringify(arrived.body));
  const seated = await request(`/bookings/${lifecycle.bookingReference}/seat`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  });
  assert.strictEqual(seated.status, 200, JSON.stringify(seated.body));
  const completed = await request(`/bookings/${lifecycle.bookingReference}/complete`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  });
  assert.strictEqual(completed.status, 200, JSON.stringify(completed.body));

  const cancelledBooking = await book(customer.token, {
    startTime: '16:00',
    guests: 2,
    tableId: tableD.id,
  });
  assert.strictEqual(cancelledBooking.status, 201, JSON.stringify(cancelledBooking.body));
  const cancelReference = cancelledBooking.body.data.booking.bookingReference;
  const cancelled = await request(`/bookings/${cancelReference}/cancel`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
    body: JSON.stringify({ reason: 'Plans changed' }),
  });
  assert.strictEqual(cancelled.status, 200, JSON.stringify(cancelled.body));

  const noShowBooking = await book(customer.token, {
    startTime: '17:00',
    guests: 2,
    tableId: tableA.id,
  });
  assert.strictEqual(noShowBooking.status, 201, JSON.stringify(noShowBooking.body));
  const noShowReference = noShowBooking.body.data.booking.bookingReference;
  assert.strictEqual((await request(`/bookings/${noShowReference}/arrive`, {
    method: 'PATCH',
    headers: authHeader(admin.token),
  })).status, 200);
  const noShow = await request(`/bookings/${noShowReference}/no-show`, {
    method: 'PATCH',
    headers: authHeader(admin.token),
  });
  assert.strictEqual(noShow.status, 200, JSON.stringify(noShow.body));

  const group = await book(customer.token, {
    startTime: '14:00',
    guests: 10,
    tableIds: [tableA.id, tableB.id],
  });
  assert.strictEqual(group.status, 201, JSON.stringify(group.body));
  const groupReference = group.body.data.booking.bookingReference;
  assert.strictEqual(group.body.data.booking.tableIds.length, 2);
  assert.strictEqual(await Booking.countDocuments({ bookingReference: groupReference }), 1);
  assert.strictEqual(await Notification.countDocuments({
    bookingReference: groupReference,
    type: 'BOOKING_CREATED',
  }), 1);

  const beforeConflict = (await notificationsFor(customer.token)).length;
  const conflict = await book(other.token, {
    startTime: '14:00',
    guests: 4,
    tableIds: [tableA.id, tableD.id],
  });
  assert.strictEqual(conflict.status, 409);
  assert.strictEqual(conflict.body.code, 'BOOKING_CONFLICT');
  assert.strictEqual((await notificationsFor(customer.token)).length, beforeConflict);
  assert.strictEqual((await notificationsFor(other.token)).length, 0);

  const hidden = await request(`/availability?date=${open.iso}&time=14:00&guests=2`);
  const offered = hidden.body.data.availability.tables.map((table) => table.id);
  assert.ok(!offered.includes(tableA.id));
  assert.ok(!offered.includes(tableB.id));

  const otherBooking = await book(other.token, {
    startTime: '19:00',
    guests: 2,
    tableId: tableB.id,
  });
  assert.strictEqual(otherBooking.status, 201, JSON.stringify(otherBooking.body));
  const otherReference = otherBooking.body.data.booking.bookingReference;

  const listed = await notificationsFor(customer.token);
  assert.strictEqual(countType(listed, lifecycle.bookingReference, 'BOOKING_CREATED'), 1);
  assert.strictEqual(countType(listed, lifecycle.bookingReference, 'BOOKING_UPDATED'), 1);
  assert.strictEqual(countType(listed, lifecycle.bookingReference, 'BOOKING_ARRIVED'), 1);
  assert.strictEqual(countType(listed, lifecycle.bookingReference, 'BOOKING_SEATED'), 1);
  assert.strictEqual(countType(listed, lifecycle.bookingReference, 'BOOKING_COMPLETED'), 1);
  assert.strictEqual(countType(listed, cancelReference, 'BOOKING_CANCELLED'), 1);
  assert.strictEqual(countType(listed, noShowReference, 'BOOKING_NO_SHOW'), 1);
  assert.strictEqual(countType(listed, groupReference, 'BOOKING_CREATED'), 1);
  assert.ok(listed.every((item) => String(item.recipientUserId) === String(customer.user.id)));
  assert.ok(!listed.some((item) => item.bookingReference === otherReference));
  for (let index = 1; index < listed.length; index += 1) {
    assert.ok(new Date(listed[index - 1].createdAt) >= new Date(listed[index].createdAt));
  }

  const cancelledOnly = await notificationsFor(customer.token, '?type=BOOKING_CANCELLED');
  assert.ok(cancelledOnly.every((item) => item.type === 'BOOKING_CANCELLED'));
  assert.ok(cancelledOnly.some((item) => item.bookingReference === cancelReference));
  const filteredAway = await request('/notifications?recipientUserId=' + other.user.id, {
    headers: authHeader(customer.token),
  });
  assert.strictEqual(filteredAway.status, 400);
  assert.strictEqual(filteredAway.body.code, 'VALIDATION_ERROR');

  const ownNotification = listed.find((item) => item.bookingReference === lifecycle.bookingReference);
  const opened = await request(`/notifications/${ownNotification.id}`, {
    headers: authHeader(customer.token),
  });
  assert.strictEqual(opened.status, 200);
  assert.strictEqual(opened.body.data.notification.id, ownNotification.id);
  const otherListed = await notificationsFor(other.token);
  const otherNotification = otherListed.find((item) => item.bookingReference === otherReference);
  assert.ok(otherNotification);
  const hiddenDetail = await request(`/notifications/${otherNotification.id}`, {
    headers: authHeader(customer.token),
  });
  assert.strictEqual(hiddenDetail.status, 404);
  assert.strictEqual(hiddenDetail.body.code, 'NOT_FOUND');

  const marked = await request(`/notifications/${ownNotification.id}/read`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
  });
  assert.strictEqual(marked.status, 200);
  assert.strictEqual(marked.body.data.notification.status, 'READ');
  assert.ok(marked.body.data.notification.readAt);
  const markedAgain = await request(`/notifications/${ownNotification.id}/read`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
  });
  assert.strictEqual(markedAgain.status, 200);
  assert.strictEqual(markedAgain.body.data.notification.status, 'READ');
  assert.strictEqual(await Notification.countDocuments({ _id: ownNotification.id }), 1);
  const forbiddenRead = await request(`/notifications/${otherNotification.id}/read`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
  });
  assert.strictEqual(forbiddenRead.status, 404);

  const staffListed = await notificationsFor(staff.token);
  assert.ok(!staffListed.some((item) => item.bookingReference === lifecycle.bookingReference));
  const createdPost = await request('/notifications', {
    method: 'POST',
    headers: authHeader(customer.token),
    body: JSON.stringify({ title: 'nope' }),
  });
  assert.strictEqual(createdPost.status, 404);

  const waitlist = await request('/waitlist', {
    method: 'POST',
    headers: authHeader(customer.token),
    body: JSON.stringify({ date: open.iso, requestedStartTime: '15:30', guests: 2 }),
  });
  assert.strictEqual(waitlist.status, 201, JSON.stringify(waitlist.body));
  const waitlistReference = waitlist.body.data.waitlist.waitlistReference;
  const bookingsBeforeConvert = await Booking.countDocuments({ customerId: customer.user.id });
  assert.strictEqual((await request(`/waitlist/${waitlistReference}/notify`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  const converted = await request(`/waitlist/${waitlistReference}/convert`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  });
  assert.strictEqual(converted.status, 200, JSON.stringify(converted.body));
  assert.strictEqual(converted.body.data.waitlist.status, 'CONVERTED');
  assert.strictEqual(await Booking.countDocuments({ customerId: customer.user.id }), bookingsBeforeConvert);

  const cancelWait = await request('/waitlist', {
    method: 'POST',
    headers: authHeader(customer.token),
    body: JSON.stringify({ date: open.iso, requestedStartTime: '16:30', guests: 2 }),
  });
  assert.strictEqual(cancelWait.status, 201, JSON.stringify(cancelWait.body));
  const cancelWaitReference = cancelWait.body.data.waitlist.waitlistReference;
  assert.strictEqual((await request(`/waitlist/${cancelWaitReference}/cancel`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
  })).status, 200);

  const expireWait = await request('/waitlist', {
    method: 'POST',
    headers: authHeader(customer.token),
    body: JSON.stringify({ date: open.iso, requestedStartTime: '12:30', guests: 3 }),
  });
  assert.strictEqual(expireWait.status, 201, JSON.stringify(expireWait.body));
  const expireReference = expireWait.body.data.waitlist.waitlistReference;
  assert.strictEqual((await request(`/waitlist/${expireReference}/expire`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  assert.strictEqual(await Notification.countDocuments({ waitlistReference: expireReference }), 1);

  const beforeFailedWaitlist = (await notificationsFor(customer.token)).length;
  const failedWaitlist = await request('/waitlist', {
    method: 'POST',
    headers: authHeader(customer.token),
    body: JSON.stringify({ date: open.iso, requestedStartTime: '12:00', guests: 80 }),
  });
  assert.strictEqual(failedWaitlist.status, 409);
  assert.strictEqual(failedWaitlist.body.code, 'PARTY_TOO_LARGE');
  assert.strictEqual((await notificationsFor(customer.token)).length, beforeFailedWaitlist);

  const waitlistNotes = await notificationsFor(customer.token);
  assert.strictEqual(waitlistNotes.filter((item) => item.waitlistReference === waitlistReference && item.type === 'WAITLIST_CREATED').length, 1);
  assert.strictEqual(waitlistNotes.filter((item) => item.waitlistReference === waitlistReference && item.type === 'WAITLIST_NOTIFIED').length, 1);
  assert.strictEqual(waitlistNotes.filter((item) => item.waitlistReference === waitlistReference && item.type === 'WAITLIST_CONVERTED').length, 1);
  assert.strictEqual(waitlistNotes.filter((item) => item.waitlistReference === cancelWaitReference && item.type === 'WAITLIST_CANCELLED').length, 1);

  const otherBeforeMarkAll = await Notification.findById(otherNotification.id);
  assert.strictEqual(otherBeforeMarkAll.status, 'UNREAD');
  const markAll = await request('/notifications/read-all', {
    method: 'PATCH',
    headers: authHeader(customer.token),
  });
  assert.strictEqual(markAll.status, 200);
  assert.ok(markAll.body.data.updatedCount > 0);
  assert.strictEqual((await notificationsFor(customer.token, '?status=UNREAD')).length, 0);
  const otherAfterMarkAll = await Notification.findById(otherNotification.id);
  assert.strictEqual(otherAfterMarkAll.status, 'UNREAD');
  const otherRead = await request(`/notifications/${otherNotification.id}/read`, {
    method: 'PATCH',
    headers: authHeader(other.token),
  });
  assert.strictEqual(otherRead.status, 200);
  assert.strictEqual(otherRead.body.data.notification.status, 'READ');

  await waitFor(
    () => staffFloorEvents.some((item) => item.bookingReference === lifecycle.bookingReference),
    'floor booking event'
  );
  await waitFor(
    () => otherNotifications.some((item) => item.type === 'BOOKING_CREATED'),
    'other customer notification'
  );
  assert.strictEqual(customerFloorEvents.length, 0);
  assert.ok(customerNotifications.every((item) => item.notificationReference && item.title && item.message && item.createdAt));
  assert.ok(!customerNotifications.some((item) => JSON.stringify(item).includes(otherReference)));
  assert.ok(!otherNotifications.some((item) => JSON.stringify(item).includes(lifecycle.bookingReference)));
  assert.strictEqual(staffNotifications.length, 0);

  const floor = await request('/tables/floor/live', { headers: authHeader(staff.token) });
  assert.strictEqual(floor.status, 200);
  assert.ok(Array.isArray(floor.body.data.tables));
  const customerFloor = await request('/tables/floor/live', { headers: authHeader(customer.token) });
  assert.strictEqual(customerFloor.status, 403);

  const bookingController = require('../src/controllers/booking.controller');
  const waitlistController = require('../src/controllers/waitlist.controller');
  const originalCreate = Notification.create;
  Notification.create = async () => {
    throw new Error('notification store unavailable');
  };

  try {
    const failedNoticeBooking = await invoke(bookingController.createBooking, {
      user: customer.user,
      body: {
        date: open.iso,
        startTime: '21:30',
        guests: 2,
        tableId: tableC.id,
      },
    });
    assert.strictEqual(failedNoticeBooking.statusCode, 201);
    const isolatedReference = failedNoticeBooking.body.data.booking.bookingReference;
    assert.ok(await Booking.exists({ bookingReference: isolatedReference }));
    assert.strictEqual(await Notification.countDocuments({ bookingReference: isolatedReference }), 0);

    const failedNoticeWaitlist = await invoke(waitlistController.createWaitlist, {
      user: customer.user,
      body: {
        date: open.iso,
        requestedStartTime: '18:45',
        guests: 2,
      },
    });
    assert.strictEqual(failedNoticeWaitlist.statusCode, 201);
    const isolatedWaitlist = failedNoticeWaitlist.body.data.waitlist.waitlistReference;
    const Waitlist = require('../src/models/Waitlist');
    assert.ok(await Waitlist.exists({ waitlistReference: isolatedWaitlist }));
    assert.strictEqual(await Notification.countDocuments({ waitlistReference: isolatedWaitlist }), 0);
  } finally {
    Notification.create = originalCreate;
  }

  console.log('notification-checks-passed');
}

async function cleanup() {
  state.sockets.forEach((socket) => socket.close());

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const Table = require('../src/models/Table');
  const Booking = require('../src/models/Booking');
  const BookingLock = require('../src/models/BookingLock');
  const Waitlist = require('../src/models/Waitlist');
  const Notification = require('../src/models/Notification');
  const User = require('../src/models/User');
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
