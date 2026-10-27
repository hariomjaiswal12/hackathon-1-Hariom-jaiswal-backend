const assert = require('assert');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const { parseCalendarDate, formatServerLocalClock } = require('../src/utils/calendar');

require('../src/config/env');

const baseUrl = 'http://127.0.0.1:5000/api/v1';
const socketUrl = 'http://127.0.0.1:5000';
const stamp = Date.now().toString().slice(-6);
const password = 'dashboard-pass-1';
const emails = {
  customer: `p12-customer-${stamp}@example.com`,
  staff: `p12-staff-${stamp}@example.com`,
  admin: `p12-admin-${stamp}@example.com`,
};
const numbers = {
  a: `D${stamp}A`,
  b: `D${stamp}B`,
  c: `D${stamp}C`,
  d: `D${stamp}D`,
};
const state = {
  ready: false,
  openDay: null,
  previous: null,
  sockets: [],
};

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
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

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(socketUrl, {
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

function assertPublic(value, label) {
  const blocked = new Set(['password', 'passwordHash', 'email', 'phone', 'token', 'jwt', 'authorization']);

  function walk(node) {
    if (!node || typeof node !== 'object') {
      return;
    }

    Object.keys(node).forEach((key) => {
      assert.ok(!blocked.has(key), `${label} exposed ${key}`);
      walk(node[key]);
    });
  }

  walk(value);
  const text = JSON.stringify(value);
  Object.values(emails).forEach((email) => {
    assert.ok(!text.includes(email), `${label} exposed an email address`);
  });
  assert.ok(!text.toLowerCase().includes(password), `${label} exposed a password`);
}

function assertRanked(rows) {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];

    if (previous.utilizationMinutes !== current.utilizationMinutes) {
      assert.ok(previous.utilizationMinutes > current.utilizationMinutes);
      continue;
    }

    if (previous.bookingCount !== current.bookingCount) {
      assert.ok(previous.bookingCount > current.bookingCount);
      continue;
    }

    assert.ok(previous.tableNumber <= current.tableNumber);
  }
}

async function main() {
  const health = await request('/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.success, true);

  for (const [role, email] of Object.entries(emails)) {
    const response = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: `Phase Twelve ${role}`, email, password }),
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.body));
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../src/models/User');
  const Schedule = require('../src/models/Schedule');
  const Booking = require('../src/models/Booking');
  const Waitlist = require('../src/models/Waitlist');
  const Notification = require('../src/models/Notification');
  const Table = require('../src/models/Table');
  const ClosedDay = require('../src/models/ClosedDay');
  await User.updateOne({ email: emails.staff }, { role: 'STAFF' });
  await User.updateOne({ email: emails.admin }, { role: 'ADMIN' });

  async function findDates(dayOfWeek, count) {
    const found = [];

    for (let year = 2096; year <= 2099 && found.length < count; year += 1) {
      for (let month = 1; month <= 12 && found.length < count; month += 1) {
        for (let day = 1; day <= 28 && found.length < count; day += 1) {
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const parsed = parseCalendarDate(iso);

          if (parsed.dayOfWeek !== dayOfWeek) {
            continue;
          }

          const [bookings, waitlist, closed] = await Promise.all([
            Booking.countDocuments({ date: iso }),
            Waitlist.countDocuments({ date: iso }),
            ClosedDay.countDocuments({ date: iso, isActive: true }),
          ]);

          if (bookings === 0 && waitlist === 0 && closed === 0) {
            found.push(parsed);
          }
        }
      }
    }

    if (found.length < count) {
      throw new Error(`Not enough free ${dayOfWeek} dates`);
    }

    return found;
  }

  async function findEmptyWaitlistDate() {
    for (let year = 2090; year <= 2093; year += 1) {
      const iso = `${year}-06-15`;

      if (await Waitlist.countDocuments({ date: iso }) === 0) {
        return iso;
      }
    }

    throw new Error('No empty waitlist date');
  }

  const [open, waitingDay] = await findDates('WEDNESDAY', 2);
  const emptyWaitlistDate = await findEmptyWaitlistDate();
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
  const staff = await login(emails.staff);
  const admin = await login(emails.admin);
  const me = await request('/auth/me', { headers: authHeader(customer.token) });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.data.user.email, emails.customer);

  const saved = await request(`/schedules/${open.dayOfWeek}`, {
    method: 'PUT',
    headers: authHeader(admin.token),
    body: JSON.stringify({
      isOpen: true,
      services: [
        {
          name: 'LUNCH',
          startTime: '12:00',
          endTime: '16:00',
          lastBookingTime: '15:00',
          bookingDurationMinutes: 60,
          maxGuestsPerBooking: 20,
        },
        {
          name: 'DINNER',
          startTime: '18:00',
          endTime: '23:00',
          lastBookingTime: '21:30',
          bookingDurationMinutes: 90,
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

  async function createBooking(token, payload) {
    const response = await request('/bookings', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify(payload),
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.body));
    return response.body.data.booking;
  }

  async function patchBooking(reference, action, token = admin.token) {
    const response = await request(`/bookings/${reference}/${action}`, {
      method: 'PATCH',
      headers: authHeader(token),
      body: action === 'cancel' ? JSON.stringify({ reason: 'Guest called' }) : undefined,
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    return response.body.data.booking;
  }

  const confirmed = await createBooking(customer.token, {
    date: open.iso,
    startTime: '12:00',
    guests: 2,
    tableId: tableA.id,
  });
  const arrived = await createBooking(staff.token, {
    date: open.iso,
    startTime: '12:30',
    guests: 4,
    tableId: tableB.id,
    customerId: customer.user.id,
    source: 'PHONE',
  });
  await patchBooking(arrived.bookingReference, 'arrive');
  const completed = await createBooking(admin.token, {
    date: open.iso,
    startTime: '13:00',
    guests: 3,
    tableId: tableC.id,
    customerId: customer.user.id,
    source: 'ADMIN',
  });
  await patchBooking(completed.bookingReference, 'arrive');
  await patchBooking(completed.bookingReference, 'seat');
  await patchBooking(completed.bookingReference, 'complete');
  const cancelled = await createBooking(customer.token, {
    date: open.iso,
    startTime: '14:00',
    guests: 2,
    tableId: tableD.id,
  });
  await patchBooking(cancelled.bookingReference, 'cancel', customer.token);
  const group = await createBooking(customer.token, {
    date: open.iso,
    startTime: '18:00',
    guests: 8,
    tableIds: [tableA.id, tableB.id],
  });
  assert.strictEqual(group.tableIds.length, 2);
  const noShow = await createBooking(staff.token, {
    date: open.iso,
    startTime: '19:00',
    guests: 2,
    tableId: tableC.id,
    customerId: customer.user.id,
    source: 'PHONE',
  });
  await patchBooking(noShow.bookingReference, 'no-show');
  const seated = await createBooking(staff.token, {
    date: open.iso,
    startTime: '18:00',
    guests: 2,
    tableId: tableD.id,
    customerId: customer.user.id,
    source: 'STAFF',
  });
  await patchBooking(seated.bookingReference, 'arrive');
  await patchBooking(seated.bookingReference, 'seat');

  const legacyReference = `TX-${open.iso.replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  await Booking.create({
    bookingReference: legacyReference,
    customerId: customer.user.id,
    tableId: tableD.id,
    date: open.iso,
    startTime: '15:00',
    endTime: '16:00',
    guests: 5,
    serviceName: 'LUNCH',
    source: 'PHONE',
    status: 'CONFIRMED',
    createdBy: admin.user.id,
    history: [{
      action: 'CREATED',
      toStatus: 'CONFIRMED',
      actorId: admin.user.id,
      at: new Date(),
    }],
  });
  const legacy = await Booking.findOne({ bookingReference: legacyReference }).lean();
  assert.ok(legacy.tableId);
  assert.ok(!legacy.tableIds || legacy.tableIds.length === 0);

  async function addWaitlist(date, time, guests = 2) {
    const response = await request('/waitlist', {
      method: 'POST',
      headers: authHeader(customer.token),
      body: JSON.stringify({ date, requestedStartTime: time, guests }),
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.body));
    return response.body.data.waitlist;
  }

  const waiting = await addWaitlist(open.iso, '12:10');
  const notified = await addWaitlist(open.iso, '12:20');
  assert.strictEqual((await request(`/waitlist/${notified.waitlistReference}/notify`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  const converted = await addWaitlist(open.iso, '12:40');
  assert.strictEqual((await request(`/waitlist/${converted.waitlistReference}/notify`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  assert.strictEqual((await request(`/waitlist/${converted.waitlistReference}/convert`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  assert.strictEqual(await Booking.countDocuments({
    customerId: customer.user.id,
    date: open.iso,
    startTime: '12:40',
  }), 0);
  const cancelledWait = await addWaitlist(open.iso, '12:50');
  assert.strictEqual((await request(`/waitlist/${cancelledWait.waitlistReference}/cancel`, {
    method: 'PATCH',
    headers: authHeader(customer.token),
  })).status, 200);
  const expired = await addWaitlist(open.iso, '13:10');
  assert.strictEqual((await request(`/waitlist/${expired.waitlistReference}/expire`, {
    method: 'PATCH',
    headers: authHeader(staff.token),
  })).status, 200);
  const waitingOnly = await addWaitlist(waitingDay.iso, '12:10');

  async function counts() {
    return {
      bookings: await Booking.countDocuments(),
      waitlist: await Waitlist.countDocuments(),
      tables: await Table.countDocuments(),
      notifications: await Notification.countDocuments(),
    };
  }

  const before = await counts();
  const dateQuery = `date=${open.iso}`;
  const dashboardPaths = [
    '/admin/dashboard',
    `/admin/dashboard?${dateQuery}`,
    `/admin/dashboard/bookings?${dateQuery}`,
    `/admin/dashboard/hourly?${dateQuery}`,
    `/admin/dashboard/services?${dateQuery}`,
    `/admin/dashboard/tables?${dateQuery}`,
    `/admin/dashboard/waitlist?${dateQuery}`,
    '/admin/dashboard/waitlist',
    '/admin/dashboard/live',
    '/admin/dashboard/activity',
  ];

  const adminResponses = {};
  for (const path of dashboardPaths) {
    const response = await request(path, { headers: authHeader(admin.token) });
    assert.strictEqual(response.status, 200, `${path} ${JSON.stringify(response.body)}`);
    assert.strictEqual(response.body.success, true);
    assertPublic(response.body.data, path);
    adminResponses[path] = response.body.data;
  }

  const staffAllowed = dashboardPaths.filter((path) => path !== '/admin/dashboard' && !path.startsWith('/admin/dashboard?'));
  for (const path of staffAllowed) {
    const response = await request(path, { headers: authHeader(staff.token) });
    assert.strictEqual(response.status, 200, `${path} ${JSON.stringify(response.body)}`);
  }
  assert.strictEqual((await request('/admin/dashboard', { headers: authHeader(staff.token) })).status, 403);
  assert.strictEqual((await request(`/admin/dashboard?${dateQuery}`, { headers: authHeader(staff.token) })).status, 403);

  for (const path of dashboardPaths) {
    assert.strictEqual((await request(path, { headers: authHeader(customer.token) })).status, 403);
    assert.strictEqual((await request(path)).status, 401);
  }
  assert.strictEqual((await request('/admin/dashboard', { method: 'POST', headers: authHeader(admin.token) })).status, 404);

  const invalidDates = ['2026-02-31', '14-11-2026', '2026/11/14', '2026-11-14 '];
  for (const value of invalidDates) {
    for (const path of [
      `/admin/dashboard?date=${encodeURIComponent(value)}`,
      `/admin/dashboard/bookings?date=${encodeURIComponent(value)}`,
      `/admin/dashboard/hourly?date=${encodeURIComponent(value)}`,
      `/admin/dashboard/services?date=${encodeURIComponent(value)}`,
      `/admin/dashboard/tables?date=${encodeURIComponent(value)}`,
      `/admin/dashboard/waitlist?date=${encodeURIComponent(value)}`,
    ]) {
      const response = await request(path, { headers: authHeader(admin.token) });
      assert.strictEqual(response.status, 400, `${path} ${JSON.stringify(response.body)}`);
      assert.strictEqual(response.body.code, 'INVALID_DATE');
    }
  }

  for (const path of [
    '/admin/dashboard/bookings',
    '/admin/dashboard/hourly',
    '/admin/dashboard/services',
    '/admin/dashboard/tables',
  ]) {
    const response = await request(path, { headers: authHeader(admin.token) });
    assert.strictEqual(response.status, 400, JSON.stringify(response.body));
    assert.strictEqual(response.body.code, 'VALIDATION_ERROR');
  }

  const after = await counts();
  assert.deepStrictEqual(after, before);

  const overview = adminResponses[`/admin/dashboard?${dateQuery}`];
  assert.strictEqual(overview.date, open.iso);
  assert.deepStrictEqual(overview.bookings, {
    total: 8,
    confirmed: 3,
    arrived: 1,
    seated: 1,
    completed: 1,
    cancelled: 1,
    noShow: 1,
  });
  assert.deepStrictEqual(overview.guests, {
    total: 28,
    confirmed: 15,
    arrived: 4,
    seated: 2,
    completed: 3,
  });
  assert.deepStrictEqual(overview.waitlist, {
    waiting: 1,
    notified: 1,
    converted: 1,
    cancelled: 1,
    expired: 1,
  });
  const tableStatusRows = await Table.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const tableStatus = Object.fromEntries(tableStatusRows.map((row) => [row._id, row.count]));
  assert.strictEqual(overview.tables.total, tableStatusRows.reduce((sum, row) => sum + row.count, 0));
  assert.strictEqual(overview.tables.available, tableStatus.AVAILABLE || 0);
  assert.strictEqual(overview.tables.reserved, tableStatus.RESERVED || 0);
  assert.strictEqual(overview.tables.occupied, tableStatus.OCCUPIED || 0);
  assert.strictEqual(overview.tables.cleaning, tableStatus.CLEANING || 0);
  assert.strictEqual(overview.tables.outOfService, tableStatus.OUT_OF_SERVICE || 0);
  assert.strictEqual(adminResponses['/admin/dashboard'].date, formatServerLocalClock().date);

  const bookings = adminResponses[`/admin/dashboard/bookings?${dateQuery}`];
  assert.strictEqual(bookings.total, 8);
  assert.strictEqual(bookings.totalGuests, 28);
  assert.strictEqual(bookings.averageGuestsPerBooking, 3.5);
  assert.strictEqual(bookings.groupBookingCount, 1);
  assert.strictEqual(bookings.singleTableBookingCount, 7);
  assert.strictEqual(bookings.byStatus.CONFIRMED, 3);
  assert.strictEqual(bookings.byStatus.ARRIVED, 1);
  assert.strictEqual(bookings.byStatus.SEATED, 1);
  assert.strictEqual(bookings.byStatus.COMPLETED, 1);
  assert.strictEqual(bookings.byStatus.CANCELLED, 1);
  assert.strictEqual(bookings.byStatus.NO_SHOW, 1);
  assert.strictEqual(bookings.byStatus.PENDING, 0);
  assert.strictEqual(bookings.bySource.WEBSITE, 3);
  assert.strictEqual(bookings.bySource.PHONE, 3);
  assert.strictEqual(bookings.bySource.ADMIN, 1);
  assert.strictEqual(bookings.bySource.STAFF, 1);
  assert.strictEqual(bookings.bySource.WHATSAPP, 0);
  assert.strictEqual(await Booking.countDocuments({ date: open.iso }), 8);

  const confirmedOnly = await request(`/admin/dashboard/bookings?${dateQuery}&status=CONFIRMED`, {
    headers: authHeader(staff.token),
  });
  assert.strictEqual(confirmedOnly.status, 200);
  assert.strictEqual(confirmedOnly.body.data.total, 3);
  assert.strictEqual(confirmedOnly.body.data.totalGuests, 15);
  assert.strictEqual(confirmedOnly.body.data.groupBookingCount, 1);
  assert.strictEqual(confirmedOnly.body.data.singleTableBookingCount, 2);
  assert.strictEqual(confirmedOnly.body.data.averageGuestsPerBooking, 5);

  const none = await request(`/admin/dashboard/bookings?${dateQuery}&status=PENDING`, {
    headers: authHeader(admin.token),
  });
  assert.strictEqual(none.body.data.total, 0);
  assert.strictEqual(none.body.data.averageGuestsPerBooking, 0);
  assert.strictEqual(none.body.data.groupBookingCount, 0);
  assert.strictEqual(none.body.data.singleTableBookingCount, 0);

  const tableABookings = await request(`/admin/dashboard/bookings?${dateQuery}&tableId=${tableA.id}`, {
    headers: authHeader(admin.token),
  });
  assert.strictEqual(tableABookings.body.data.total, 2);
  assert.strictEqual(tableABookings.body.data.totalGuests, 10);
  assert.strictEqual(tableABookings.body.data.groupBookingCount, 1);
  assert.strictEqual(tableABookings.body.data.singleTableBookingCount, 1);

  const hourly = adminResponses[`/admin/dashboard/hourly?${dateQuery}`];
  assert.deepStrictEqual(hourly.hours, [
    { time: '12:00', bookings: 2, guests: 6 },
    { time: '13:00', bookings: 1, guests: 3 },
    { time: '14:00', bookings: 1, guests: 2 },
    { time: '15:00', bookings: 1, guests: 5 },
    { time: '18:00', bookings: 2, guests: 10 },
    { time: '19:00', bookings: 1, guests: 2 },
  ]);
  assert.strictEqual(hourly.hours.reduce((sum, hour) => sum + hour.bookings, 0), 8);
  assert.strictEqual(hourly.hours.reduce((sum, hour) => sum + hour.guests, 0), 28);

  const services = adminResponses[`/admin/dashboard/services?${dateQuery}`];
  assert.deepStrictEqual(services.services, [
    {
      serviceName: 'DINNER',
      bookings: 3,
      guests: 12,
      averageGuests: 4,
      cancelled: 0,
      completed: 0,
      noShow: 1,
    },
    {
      serviceName: 'LUNCH',
      bookings: 5,
      guests: 16,
      averageGuests: 3.2,
      cancelled: 1,
      completed: 1,
      noShow: 0,
    },
  ]);

  const utilization = adminResponses[`/admin/dashboard/tables?${dateQuery}`];
  assertRanked(utilization.tables);
  const byNumber = Object.fromEntries(utilization.tables.map((table) => [table.tableNumber, table]));
  assert.deepStrictEqual(
    utilization.tables.slice(0, 4).map((table) => table.tableNumber),
    [numbers.d, numbers.a, numbers.b, numbers.c]
  );
  assert.strictEqual(byNumber[numbers.a].bookingCount, 2);
  assert.strictEqual(byNumber[numbers.a].guestCount, 10);
  assert.strictEqual(byNumber[numbers.a].utilizationMinutes, 150);
  assert.strictEqual(byNumber[numbers.b].bookingCount, 2);
  assert.strictEqual(byNumber[numbers.b].guestCount, 12);
  assert.strictEqual(byNumber[numbers.b].utilizationMinutes, 150);
  assert.strictEqual(byNumber[numbers.c].bookingCount, 2);
  assert.strictEqual(byNumber[numbers.c].guestCount, 5);
  assert.strictEqual(byNumber[numbers.c].completedCount, 1);
  assert.strictEqual(byNumber[numbers.c].utilizationMinutes, 150);
  assert.strictEqual(byNumber[numbers.d].bookingCount, 3);
  assert.strictEqual(byNumber[numbers.d].guestCount, 9);
  assert.strictEqual(byNumber[numbers.d].cancelledCount, 1);
  assert.strictEqual(byNumber[numbers.d].utilizationMinutes, 210);
  const ourBookingCount = [numbers.a, numbers.b, numbers.c, numbers.d]
    .reduce((sum, number) => sum + byNumber[number].bookingCount, 0);
  assert.strictEqual(ourBookingCount, 9);
  assert.strictEqual(bookings.total, 8);

  const waitlist = adminResponses[`/admin/dashboard/waitlist?${dateQuery}`];
  assert.strictEqual(waitlist.total, 5);
  assert.strictEqual(waitlist.waiting, 1);
  assert.strictEqual(waitlist.notified, 1);
  assert.strictEqual(waitlist.converted, 1);
  assert.strictEqual(waitlist.cancelled, 1);
  assert.strictEqual(waitlist.expired, 1);
  assert.strictEqual(waitlist.conversionRate, 0.25);

  const waitingOnlyAnalytics = await request(`/admin/dashboard/waitlist?date=${waitingDay.iso}`, {
    headers: authHeader(admin.token),
  });
  assert.strictEqual(waitingOnlyAnalytics.body.data.total, 1);
  assert.strictEqual(waitingOnlyAnalytics.body.data.waiting, 1);
  assert.strictEqual(waitingOnlyAnalytics.body.data.converted, 0);
  assert.strictEqual(waitingOnlyAnalytics.body.data.conversionRate, 0);
  const emptyWaitlist = await request(`/admin/dashboard/waitlist?date=${emptyWaitlistDate}`, {
    headers: authHeader(admin.token),
  });
  assert.strictEqual(emptyWaitlist.body.data.total, 0);
  assert.strictEqual(emptyWaitlist.body.data.conversionRate, 0);

  const liveFloor = await request('/tables/floor/live', { headers: authHeader(staff.token) });
  const live = adminResponses['/admin/dashboard/live'];
  assert.strictEqual(liveFloor.status, 200);
  assert.strictEqual(live.businessDate, liveFloor.body.data.date);
  if (live.currentTime === liveFloor.body.data.currentTime) {
    assert.deepStrictEqual(live.tables, liveFloor.body.data.tables);
  }
  const summaryTotal = Object.values(live.summary).reduce((sum, count) => sum + count, 0);
  assert.strictEqual(summaryTotal, live.tables.length);
  live.tables.forEach((table) => {
    assert.ok(table.operationalState);
  });

  const activity = adminResponses['/admin/dashboard/activity'];
  assert.ok(activity.events.length <= 50);
  assert.ok(activity.events.length > 0);
  activity.events.forEach((event, index) => {
    assert.deepStrictEqual(Object.keys(event).sort(), ['reference', 'status', 'timestamp', 'type']);
    if (index > 0) {
      assert.ok(activity.events[index - 1].timestamp >= event.timestamp);
    }
  });
  const groupEvents = activity.events.filter((event) => event.reference === group.bookingReference);
  assert.strictEqual(groupEvents.length, 1);
  assert.strictEqual(groupEvents[0].type, 'BOOKING_CREATED');
  assert.ok(activity.events.some((event) => event.reference === waiting.waitlistReference && event.type === 'WAITLIST'));
  assert.ok(activity.events.some((event) => event.reference === waitingOnly.waitlistReference));

  assert.deepStrictEqual(await counts(), before);

  const healthAgain = await request('/health');
  assert.strictEqual(healthAgain.status, 200);
  assert.strictEqual(healthAgain.body.data.status === 'ok' || healthAgain.body.data.status === 'degraded', true);
  const meAgain = await request('/auth/me', { headers: authHeader(customer.token) });
  assert.strictEqual(meAgain.status, 200);
  assert.strictEqual(meAgain.body.data.user.role, 'CUSTOMER');
  const availability = await request(`/availability?date=${open.iso}&time=15:00&guests=2`);
  assert.strictEqual(availability.status, 200);
  assert.strictEqual(availability.body.data.availability.available, true);

  const staffSocket = await connectSocket(staff.token);
  state.sockets.push(staffSocket);
  const bookingEvents = [];
  staffSocket.on('booking:created', (payload) => bookingEvents.push(payload));
  const regression = await createBooking(customer.token, {
    date: open.iso,
    startTime: '15:00',
    guests: 2,
    tableId: tableA.id,
  });
  assert.strictEqual(regression.tableIds.length, 1);
  const started = Date.now();
  while (!bookingEvents.some((event) => event.bookingReference === regression.bookingReference)) {
    if (Date.now() - started > 3000) {
      throw new Error('Timed out waiting for booking:created');
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  const regressionGroup = await createBooking(customer.token, {
    date: open.iso,
    startTime: '20:00',
    guests: 6,
    tableIds: [tableA.id, tableB.id],
  });
  assert.strictEqual(regressionGroup.tableIds.length, 2);
  assert.strictEqual(await Booking.countDocuments({ bookingReference: regressionGroup.bookingReference }), 1);

  const regressionWait = await addWaitlist(open.iso, '12:15');
  assert.strictEqual(regressionWait.status, 'WAITING');
  const listed = await request('/notifications', { headers: authHeader(customer.token) });
  assert.strictEqual(listed.status, 200);
  assert.ok(listed.body.data.notifications.some((item) => (
    item.type === 'BOOKING_CREATED' && item.bookingReference === confirmed.bookingReference
  )));
  const jobs = await request('/admin/jobs/status', { headers: authHeader(admin.token) });
  assert.strictEqual(jobs.status, 200);
  assert.ok(Array.isArray(jobs.body.data.jobs));
  assert.strictEqual(typeof jobs.body.data.jobsEnabled, 'boolean');
  jobs.body.data.jobs.forEach((job) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(job, 'stack'));
  });
  assert.strictEqual((await request('/admin/jobs/status', { headers: authHeader(staff.token) })).status, 403);
  assert.strictEqual((await request('/admin/jobs/status', { headers: authHeader(customer.token) })).status, 403);
  assert.strictEqual((await request('/tables/floor/live', { headers: authHeader(customer.token) })).status, 403);

  console.log('dashboard-checks-passed');
}

async function cleanup() {
  state.sockets.forEach((socket) => socket.close());

  if (mongoose.connection.readyState === 0) {
    if (!process.env.MONGODB_URI) {
      return;
    }
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
    $or: [
      { tableId: { $in: tableIds } },
      { tableIds: { $in: tableIds } },
      { customerId: { $in: userIds } },
    ],
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
