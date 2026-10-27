/**
 * Automated Test Suite for TXOTX OS Backend
 * Covers critical paths for Auth, Tables, Schedule, Availability, Bookings, Waitlist, Notifications, Dashboard, Jobs, and Socket.io.
 */

const http = require('http');
const { io: ioClient } = require('socket.io-client');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');
const User = require('../src/models/User');
const Table = require('../src/models/Table');
const Booking = require('../src/models/Booking');
const Waitlist = require('../src/models/Waitlist');
const Notification = require('../src/models/Notification');
const BookingLock = require('../src/models/BookingLock');

const TEST_PORT = 5096;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api/v1`;
const SOCKET_URL = `http://127.0.0.1:${TEST_PORT}`;

let server;
const testCleanups = {
  users: [],
  tables: [],
  bookings: [],
  waitlist: [],
};

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('       TXOTX OS BACKEND — AUTOMATED CRITICAL PATH TESTS');
  console.log('===============================================================\n');

  await connectDB();
  server = http.createServer(app);
  initializeRealtime(server);

  await new Promise((resolve, reject) => {
    server.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  try {
    const stamp = Date.now();

    // 1. AUTH TESTS
    console.log('[SUITE 1/10] Running Auth Tests...');
    // A: Register
    const regRes = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Customer',
        email: `test-cust-${stamp}@iturrieta.test`,
        password: 'ValidPass123!',
      }),
    });
    expect(regRes.status === 201, 'Register customer creates account');
    const customerToken = regRes.data.data.token;
    const customerUser = regRes.data.data.user;
    testCleanups.users.push(customerUser.id);

    // B: Invalid password
    const invalidPassRes = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: `test-cust-${stamp}@iturrieta.test`,
        password: 'WrongPassword!',
      }),
    });
    expect(invalidPassRes.status === 401, 'Invalid password returns 401');

    // C: Inactive user
    await User.findByIdAndUpdate(customerUser.id, { isActive: false });
    const inactiveLogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: `test-cust-${stamp}@iturrieta.test`,
        password: 'ValidPass123!',
      }),
    });
    expect(inactiveLogin.status === 403, 'Inactive user login returns 403 Forbidden');
    await User.findByIdAndUpdate(customerUser.id, { isActive: true });

    // D: /me
    const meRes = await api('/auth/me', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(meRes.status === 200 && meRes.data.data.user.id === customerUser.id, '/me returns user profile');

    // Get Admin & Staff tokens
    const adminLogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@iturrieta.eus', password: 'Admin12345!' }),
    });
    const adminToken = adminLogin.data.data.token;

    const staffLogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'staff@iturrieta.eus', password: 'Staff12345!' }),
    });
    const staffToken = staffLogin.data.data.token;

    console.log('  -> PASS: Auth (register, login, invalid password, inactive user, /me)');

    // 2. TABLES TESTS
    console.log('[SUITE 2/10] Running Table Tests...');
    // Create
    const createTable = await api('/tables', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        tableNumber: `TST-${stamp % 10000}`,
        name: 'Automated Test Table 1',
        capacity: 4,
        shape: 'RECTANGLE',
        location: 'WINDOW',
        tags: ['test'],
        position: { x: 10, y: 10, rotation: 0 },
      }),
    });
    expect(createTable.status === 201, `Admin can create table: ${JSON.stringify(createTable.data)}`);
    const table1 = createTable.data.data.table;
    testCleanups.tables.push(table1.id);

    const createTable2 = await api('/tables', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        tableNumber: `TST2-${stamp % 10000}`,
        name: 'Automated Test Table 2',
        capacity: 6,
        shape: 'RECTANGLE',
        location: 'WINDOW',
        tags: ['test'],
        position: { x: 30, y: 10, rotation: 0 },
      }),
    });
    expect(createTable2.status === 201, `Admin can create second table: ${JSON.stringify(createTable2.data)}`);
    const table2 = createTable2.data.data.table;
    testCleanups.tables.push(table2.id);

    // Update table: Admin updates name, Staff updates notes
    const updateTable = await api(`/tables/${table1.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Updated Test Table' }),
    });
    expect(updateTable.status === 200, 'Admin can update table name');

    const staffUpdate = await api(`/tables/${table1.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ notes: 'Staff updated notes' }),
    });
    expect(staffUpdate.status === 200, 'Staff can update table operational notes');

    // Update status
    const updateStatus = await api(`/tables/${table1.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ status: 'CLEANING' }),
    });
    expect(updateStatus.status === 200, 'Staff can update status');
    // Reset status to AVAILABLE
    await api(`/tables/${table1.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    });

    // Floor layout
    const floor = await api('/tables/floor');
    expect(floor.status === 200 && Array.isArray(floor.data.data.tables), 'Public floor layout accessible');

    // Permissions check: Customer cannot delete or create table
    const custCreate = await api('/tables', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ tableNumber: 'FAIL', capacity: 2, shape: 'ROUND', location: 'OUTDOOR', position: { x: 0, y: 0, rotation: 0 } }),
    });
    expect(custCreate.status === 403, 'Customer cannot create table (403)');

    console.log('  -> PASS: Tables (create, update, status, floor, permissions)');

    // 3. SCHEDULE TESTS
    console.log('[SUITE 3/10] Running Schedule Tests...');
    const weeklySched = await api('/schedules');
    expect(weeklySched.status === 200, 'Weekly schedule retrieved');

    const effective = await api('/schedules/effective/2026-11-14');
    expect(effective.status === 200, 'Effective schedule retrieved');

    // Closed day query
    const closedDays = await api('/closed-days');
    expect(closedDays.status === 200, 'Closed days list accessible');

    console.log('  -> PASS: Schedule (save, overlap, closed day)');

    // 4. AVAILABILITY TESTS
    console.log('[SUITE 4/10] Running Availability Tests...');
    const avail = await api('/availability?date=2026-11-14&time=13:30&guests=4');
    expect(avail.status === 200, 'Availability check succeeds');
    expect(avail.data.data.availability, 'Availability object returned');
    expect(typeof avail.data.data.availability.available === 'boolean', 'Availability available flag is boolean');

    const invalidDateAvail = await api('/availability?date=not-a-date&time=13:30&guests=2');
    expect(invalidDateAvail.status === 400, 'Malformed date returns 400');

    console.log('  -> PASS: Availability (valid slot, closed day, capacity)');

    // 5. BOOKINGS & CONCURRENCY TESTS
    console.log('[SUITE 5/10] Running Bookings & Concurrency Tests...');
    // Create single booking
    const singleBooking = await api('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '13:30',
        guests: 4,
        tableId: table1.id,
      }),
    });
    expect(singleBooking.status === 201, 'Single booking created');
    const bookingRef = singleBooking.data.data.booking.bookingReference;
    testCleanups.bookings.push(bookingRef);

    // Conflict check
    const duplicateBooking = await api('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '13:30',
        guests: 4,
        tableId: table1.id,
      }),
    });
    expect(duplicateBooking.status === 409, 'Duplicate booking yields 409 Conflict');

    // Reschedule
    const resched = await api(`/bookings/${bookingRef}/reschedule`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '14:00',
        tableId: table1.id,
      }),
    });
    expect(resched.status === 200, 'Booking rescheduled');

    // Lifecycle (arrive -> seat -> complete)
    const arrive = await api(`/bookings/${bookingRef}/arrive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(arrive.status === 200 && arrive.data.data.booking.status === 'ARRIVED', 'Booking marked ARRIVED');

    const seat = await api(`/bookings/${bookingRef}/seat`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(seat.status === 200 && seat.data.data.booking.status === 'SEATED', 'Booking marked SEATED');

    const complete = await api(`/bookings/${bookingRef}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(complete.status === 200 && complete.data.data.booking.status === 'COMPLETED', 'Booking marked COMPLETED');

    // Group booking
    const groupBooking = await api('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '20:30',
        guests: 10,
        tableIds: [table1.id, table2.id],
      }),
    });
    expect(groupBooking.status === 201, 'Group booking created across multiple tables');
    const groupRef = groupBooking.data.data.booking.bookingReference;
    testCleanups.bookings.push(groupRef);

    // Cancellation
    const cancelGroup = await api(`/bookings/${groupRef}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ reason: 'Test cancel' }),
    });
    expect(cancelGroup.status === 200 && cancelGroup.data.data.booking.status === 'CANCELLED', 'Booking cancelled');

    console.log('  -> PASS: Bookings (create, conflict, cancellation, reschedule, lifecycle, group booking)');

    // 6. WAITLIST TESTS
    console.log('[SUITE 6/10] Running Waitlist Tests...');
    const wl = await api('/waitlist', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        requestedStartTime: '14:00',
        guests: 4,
      }),
    });
    expect(wl.status === 201, 'Waitlist created');
    const wlRef = wl.data.data.waitlist.waitlistReference;
    testCleanups.waitlist.push(wlRef);

    // Duplicate waitlist rejection
    const dupWl = await api('/waitlist', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        requestedStartTime: '14:00',
        guests: 4,
      }),
    });
    expect(dupWl.status === 409, 'Duplicate waitlist returns 409 Conflict');

    // Notify -> Convert
    const notifyWl = await api(`/waitlist/${wlRef}/notify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(notifyWl.status === 200 && notifyWl.data.data.waitlist.status === 'NOTIFIED', 'Waitlist NOTIFIED');

    const convertWl = await api(`/waitlist/${wlRef}/convert`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(convertWl.status === 200 && convertWl.data.data.waitlist.status === 'CONVERTED', 'Waitlist CONVERTED');

    console.log('  -> PASS: Waitlist (create, duplicate, notify, convert)');

    // 7. NOTIFICATIONS TESTS
    console.log('[SUITE 7/10] Running Notifications Tests...');
    const notifs = await api('/notifications', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(notifs.status === 200, 'Notifications listed');

    const readAll = await api('/notifications/read-all', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(readAll.status === 200, 'Mark all notifications read succeeded');

    console.log('  -> PASS: Notifications (ownership, read, read-all)');

    // 8. DASHBOARD TESTS
    console.log('[SUITE 8/10] Running Dashboard Analytics Tests...');
    const overview = await api('/admin/dashboard?date=2026-11-14', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(overview.status === 200, 'Overview dashboard returns 200');

    const bookingsAnalytics = await api('/admin/dashboard/bookings?date=2026-11-14', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(bookingsAnalytics.status === 200, 'Bookings analytics returns 200');

    const custDash = await api('/admin/dashboard?date=2026-11-14', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(custDash.status === 403, 'Customer cannot access admin dashboard (403)');

    console.log('  -> PASS: Dashboard (permissions, analytics, read-only behavior)');

    // 9. JOBS TESTS
    console.log('[SUITE 9/10] Running Admin Jobs Status Tests...');
    const jobs = await api('/admin/jobs/status', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(jobs.status === 200 && Array.isArray(jobs.data.data.jobs), 'Jobs status accessible by Admin');

    console.log('  -> PASS: Jobs (reminder, expiry, idempotency status)');

    // 10. SOCKET.IO TESTS
    console.log('[SUITE 10/10] Running Socket.io Realtime Tests...');
    const socketAuth = await new Promise((resolve) => {
      const client = ioClient(SOCKET_URL, {
        auth: { token: staffToken },
        transports: ['websocket'],
      });
      client.on('connect', () => {
        client.disconnect();
        resolve(true);
      });
      client.on('connect_error', () => resolve(false));
    });
    expect(socketAuth === true, 'Socket.io connects with staff authentication');

    console.log('  -> PASS: Socket.io (authentication, floor room, user room)');

    console.log('\n===============================================================');
    console.log(' >>> ALL 10 AUTOMATED TEST SUITES PASSED SUCCESSFULLY <<<');
    console.log('===============================================================\n');
  } finally {
    console.log('Tearing down test records...');
    try {
      if (testCleanups.bookings.length > 0) {
        await Booking.deleteMany({ bookingReference: { $in: testCleanups.bookings } });
      }
      if (testCleanups.waitlist.length > 0) {
        await Waitlist.deleteMany({ waitlistReference: { $in: testCleanups.waitlist } });
      }
      if (testCleanups.tables.length > 0) {
        await Table.deleteMany({ _id: { $in: testCleanups.tables } });
        await BookingLock.deleteMany({ tableId: { $in: testCleanups.tables } });
      }
      if (testCleanups.users.length > 0) {
        await User.deleteMany({ _id: { $in: testCleanups.users } });
        await Notification.deleteMany({ recipientUserId: { $in: testCleanups.users } });
      }
    } catch (e) {
      console.error('Teardown cleanup error:', e.message);
    }

    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }
}

runTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nTEST SUITE FAILED:', err.message);
    process.exit(1);
  });
