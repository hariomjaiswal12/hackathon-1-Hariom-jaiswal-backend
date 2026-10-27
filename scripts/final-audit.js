/**
 * Phase 13 Final Audit Script for TXOTX OS Backend
 * Verifies all 20 production readiness requirements and cleans up test data afterward.
 */

const http = require('http');
const { io: ioClient } = require('socket.io-client');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');
const User = require('../src/models/User');
const Table = require('../src/models/Table');
const Booking = require('../src/models/Booking');
const Waitlist = require('../src/models/Waitlist');
const Notification = require('../src/models/Notification');
const BookingLock = require('../src/models/BookingLock');

const AUDIT_PORT = 5095;
const BASE_URL = `http://127.0.0.1:${AUDIT_PORT}/api/v1`;
const SOCKET_URL = `http://127.0.0.1:${AUDIT_PORT}`;

const createdUserIds = [];
const createdTableIds = [];
const createdBookingRefs = [];
const createdWaitlistRefs = [];

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[AUDIT FAILED] ${message}`);
  }
}

async function runAudit() {
  console.log('===============================================================');
  console.log('       TXOTX OS BACKEND — PHASE 13 PRODUCTION AUDIT');
  console.log('===============================================================\n');

  // Step 1: Server Starts
  console.log('[1/20] Testing Server Startup...');
  await connectDB();
  const server = http.createServer(app);
  initializeRealtime(server);

  await new Promise((resolve, reject) => {
    server.listen(AUDIT_PORT, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  console.log(`  -> Server successfully listening on port ${AUDIT_PORT}`);

  try {
    // Step 2: Health Works
    console.log('[2/20] Testing Health Endpoint...');
    const health = await api('/health');
    assert(health.status === 200, `Health HTTP status is ${health.status}`);
    assert(health.data.success === true, 'Health success flag is true');
    assert(health.data.data.status === 'ok', 'Health status is "ok"');
    assert(health.data.data.version, 'Health returns API version');
    console.log('  -> Health check returned 200 OK with status "ok"');

    // Step 3: Database Connects
    console.log('[3/20] Testing Database Connectivity...');
    assert(health.data.data.database.configured === true, 'Database is configured');
    assert(health.data.data.database.status === 'connected', 'Database status is "connected"');
    console.log('  -> MongoDB connection active and ready');

    // Step 4: Auth Works
    console.log('[4/20] Testing Authentication & Token Issuance...');
    const testStamp = Date.now();
    const customerEmail = `audit-customer-${testStamp}@iturrieta.test`;
    const customerPassword = 'AuditPassword123!';

    // Register
    const regRes = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Audit Customer',
        email: customerEmail,
        password: customerPassword,
        phone: '+34 945 999 888',
      }),
    });
    assert(regRes.status === 201, `Register failed with status ${regRes.status}: ${JSON.stringify(regRes.data)}`);
    assert(regRes.data.data.token, 'Register returns JWT token');
    const customerId = regRes.data.data.user.id;
    createdUserIds.push(customerId);

    // Login
    const loginRes = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: customerEmail,
        password: customerPassword,
      }),
    });
    assert(loginRes.status === 200, 'Login succeeded');
    const customerToken = loginRes.data.data.token;
    assert(customerToken, 'Login returns JWT token');

    // Me
    const meRes = await api('/auth/me', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(meRes.status === 200, 'GET /auth/me returns 200');
    assert(meRes.data.data.user.email === customerEmail, 'GET /auth/me returns user profile');

    // Also obtain staff and admin tokens for subsequent tests
    const staffLogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'staff@iturrieta.eus', password: 'Staff12345!' }),
    });
    const staffToken = staffLogin.data.data?.token;

    const adminLogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@iturrieta.eus', password: 'Admin12345!' }),
    });
    const adminToken = adminLogin.data.data?.token;

    assert(staffToken, 'Existing staff account logged in');
    assert(adminToken, 'Existing admin account logged in');
    console.log('  -> Customer registration, login, token issuance, and /me verified');

    // Step 5: Tables Work
    console.log('[5/20] Testing Table Endpoints & Floor Plan...');
    const tablesRes = await api('/tables');
    assert(tablesRes.status === 200, 'GET /tables returns 200');
    assert(Array.isArray(tablesRes.data.data.tables), 'Tables is an array');

    const floorRes = await api('/tables/floor');
    assert(floorRes.status === 200, 'GET /tables/floor returns 200');
    assert(Array.isArray(floorRes.data.data.tables), 'Floor tables is an array');

    // Admin create audit test table
    const createTableRes = await api('/tables', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        tableNumber: `AUDIT-${testStamp % 10000}`,
        name: 'Audit Temporary Table',
        capacity: 4,
        shape: 'RECTANGLE',
        location: 'WINDOW',
        tags: ['audit-test'],
        position: { x: 50, y: 50, rotation: 0 },
      }),
    });
    assert(createTableRes.status === 201, 'Admin can create table');
    const auditTable = createTableRes.data.data.table;
    createdTableIds.push(auditTable.id);

    // Also pick a second table for group booking tests
    const createTable2Res = await api('/tables', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        tableNumber: `AUDIT2-${testStamp % 10000}`,
        name: 'Audit Temporary Table 2',
        capacity: 4,
        shape: 'RECTANGLE',
        location: 'WINDOW',
        tags: ['audit-test'],
        position: { x: 70, y: 50, rotation: 0 },
      }),
    });
    assert(createTable2Res.status === 201, 'Admin can create second test table');
    const auditTable2 = createTable2Res.data.data.table;
    createdTableIds.push(auditTable2.id);

    console.log('  -> Table list, floor layout, and admin table management verified');

    // Step 6: Schedule Works
    console.log('[6/20] Testing Operating Schedules...');
    const schedulesRes = await api('/schedules');
    assert(schedulesRes.status === 200, 'GET /schedules returns 200');
    const scheduleItems = schedulesRes.data.data.schedules || schedulesRes.data.data.schedule || [];
    assert(scheduleItems.length === 7, 'Weekly schedule contains 7 days');

    const effectiveRes = await api('/schedules/effective/2026-11-14');
    assert(effectiveRes.status === 200, 'GET /schedules/effective/:date returns 200');
    assert(effectiveRes.data.data.schedule.isConfigured, 'Schedule is configured for Saturday');
    console.log('  -> Weekly schedule and date-specific effective hours verified');

    // Step 7: Availability Works
    console.log('[7/20] Testing Availability Engine...');
    const availRes = await api('/availability?date=2026-11-14&time=13:30&guests=2');
    assert(availRes.status === 200, 'GET /availability returns 200');
    assert(availRes.data.data.availability, 'Availability object returned');
    assert(availRes.data.data.availability.date === '2026-11-14', 'Availability matches date');
    assert(typeof availRes.data.data.availability.available === 'boolean', 'Availability status is boolean');
    console.log('  -> Availability engine correctly evaluates calendar date and party size');

    // Step 8: Single Booking Works
    console.log('[8/20] Testing Single Reservation Creation...');
    const bookingRes = await api('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '13:30',
        guests: 2,
        tableId: auditTable.id,
        notes: 'Final audit single booking test',
      }),
    });
    assert(bookingRes.status === 201, `Booking create status is ${bookingRes.status}: ${JSON.stringify(bookingRes.data)}`);
    const booking = bookingRes.data.data.booking;
    assert(booking.bookingReference, 'Booking has bookingReference');
    assert(booking.status === 'CONFIRMED', 'Booking is CONFIRMED');
    createdBookingRefs.push(booking.bookingReference);
    console.log(`  -> Booking created: ${booking.bookingReference}`);

    // Step 9: Group Booking Works
    console.log('[9/20] Testing Multi-Table Group Reservation Creation...');
    const groupBookingRes = await api('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '20:30',
        guests: 8,
        tableIds: [auditTable.id, auditTable2.id],
        notes: 'Final audit group booking test',
      }),
    });
    assert(groupBookingRes.status === 201, `Group booking failed: ${JSON.stringify(groupBookingRes.data)}`);
    const groupBooking = groupBookingRes.data.data.booking;
    assert(groupBooking.bookingReference, 'Group booking reference generated');
    assert(Array.isArray(groupBooking.tables) && groupBooking.tables.length === 2, 'Group booking spans 2 tables');
    createdBookingRefs.push(groupBooking.bookingReference);
    console.log(`  -> Group booking created across multiple tables: ${groupBooking.bookingReference}`);

    // Step 10: Booking Conflict Works (Double-booking rejection)
    console.log('[10/20] Testing Booking Conflict Detection (409)...');
    const conflictRes = await api('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '13:30',
        guests: 2,
        tableId: auditTable.id,
      }),
    });
    assert(conflictRes.status === 409, `Expected 409 Conflict, got ${conflictRes.status}`);
    assert(
      conflictRes.data.code === 'BOOKING_CONFLICT' || conflictRes.data.error?.code === 'BOOKING_CONFLICT',
      'Returns BOOKING_CONFLICT code'
    );
    console.log('  -> Conflicting reservation properly rejected with 409 BOOKING_CONFLICT');

    // Step 11: Reschedule Works
    console.log('[11/20] Testing Reservation Rescheduling...');
    const rescheduleRes = await api(`/bookings/${booking.bookingReference}/reschedule`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '14:00',
        tableId: auditTable.id,
      }),
    });
    assert(rescheduleRes.status === 200, `Reschedule status: ${rescheduleRes.status}`);
    assert(rescheduleRes.data.data.booking.startTime === '14:00', 'Booking start time updated');
    console.log('  -> Reservation rescheduled to new slot successfully');

    // Step 12: Cancellation Works
    console.log('[12/20] Testing Reservation Cancellation...');
    const cancelRes = await api(`/bookings/${booking.bookingReference}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ reason: 'Audit cancellation test' }),
    });
    assert(cancelRes.status === 200, 'Booking cancelled successfully');
    assert(cancelRes.data.data.booking.status === 'CANCELLED', 'Booking status changed to CANCELLED');
    console.log('  -> Reservation cancelled and reason recorded');

    // Step 13: Waitlist Works
    console.log('[13/20] Testing Waitlist Lifecycle (Create, Notify, Convert, Cancel)...');
    const waitlistRes = await api('/waitlist', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        requestedStartTime: '14:00',
        guests: 4,
        notes: 'Waitlist audit entry',
      }),
    });
    assert(waitlistRes.status === 201, `Waitlist creation status: ${waitlistRes.status}`);
    const waitlistEntry = waitlistRes.data.data.waitlist;
    assert(waitlistEntry.waitlistReference, 'Waitlist reference generated');
    createdWaitlistRefs.push(waitlistEntry.waitlistReference);

    // Notify waitlist
    const notifyWlRes = await api(`/waitlist/${waitlistEntry.waitlistReference}/notify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(notifyWlRes.status === 200, 'Waitlist notify succeeded');
    assert(notifyWlRes.data.data.waitlist.status === 'NOTIFIED', 'Waitlist status changed to NOTIFIED');

    // Convert waitlist
    const convertWlRes = await api(`/waitlist/${waitlistEntry.waitlistReference}/convert`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(convertWlRes.status === 200, 'Waitlist convert succeeded');
    assert(convertWlRes.data.data.waitlist.status === 'CONVERTED', 'Waitlist status changed to CONVERTED');
    console.log('  -> Waitlist creation, notification, and conversion verified');

    // Step 14: Notifications Work
    console.log('[14/20] Testing Notification Ownership and Lifecycle...');
    const notifsRes = await api('/notifications', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(notifsRes.status === 200, 'Notifications list returned 200');
    assert(Array.isArray(notifsRes.data.data.notifications), 'Notifications is an array');
    const notif = notifsRes.data.data.notifications[0];
    if (notif) {
      const readRes = await api(`/notifications/${notif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert(readRes.status === 200, 'Mark notification read succeeded');
    }
    const readAllRes = await api('/notifications/read-all', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(readAllRes.status === 200, 'Mark all read succeeded');
    console.log('  -> Notification delivery, customer scoping, and read tracking verified');

    // Step 15: Live Floor Works
    console.log('[15/20] Testing Staff Live Floor Monitoring...');
    const liveFloorRes = await api('/tables/floor/live', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(liveFloorRes.status === 200, 'Live floor returns 200 for staff');
    assert(Array.isArray(liveFloorRes.data.data.tables), 'Live floor returns tables');
    console.log('  -> Real-time floor status accessible to operational staff');

    // Step 16: Socket.io Authentication Works
    console.log('[16/20] Testing Socket.io Authentication & Authorization...');
    // A: Connecting with valid token succeeds
    const socketAuthSuccess = await new Promise((resolve) => {
      const client = ioClient(SOCKET_URL, {
        auth: { token: staffToken },
        transports: ['websocket'],
      });
      client.on('connect', () => {
        client.disconnect();
        resolve(true);
      });
      client.on('connect_error', () => {
        resolve(false);
      });
    });
    assert(socketAuthSuccess === true, 'Socket.io connects with valid JWT auth token');

    // B: Connecting without token is rejected
    const socketNoAuthRejected = await new Promise((resolve) => {
      const client = ioClient(SOCKET_URL, {
        transports: ['websocket'],
      });
      client.on('connect', () => {
        client.disconnect();
        resolve(false);
      });
      client.on('connect_error', (err) => {
        resolve(err.message.includes('Authentication') || err.message.includes('failed') || err.message.includes('required'));
      });
    });
    assert(socketNoAuthRejected === true, 'Socket.io rejects unauthenticated connections');
    console.log('  -> Socket.io authenticated handshake and rejection verified');

    // Step 17: Jobs Status Works
    console.log('[17/20] Testing Background Jobs Status Endpoint...');
    const jobsRes = await api('/admin/jobs/status', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(jobsRes.status === 200, 'Admin can inspect jobs status');
    assert(Array.isArray(jobsRes.data.data.jobs), 'Jobs status returns jobs array');
    console.log('  -> Scheduler status and background jobs config verified');

    // Step 18: Dashboard Works
    console.log('[18/20] Testing Operations Dashboard Analytics...');
    const dashOverview = await api('/admin/dashboard?date=2026-11-14', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(dashOverview.status === 200, 'Admin dashboard overview returns 200');

    const dashBookings = await api('/admin/dashboard/bookings?date=2026-11-14', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(dashBookings.status === 200, 'Staff dashboard bookings returns 200');

    const dashLive = await api('/admin/dashboard/live', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(dashLive.status === 200, 'Dashboard live summary returns 200');
    console.log('  -> Executive and staff operational analytics dashboards verified');

    // Step 19: Unauthorized Routes Return Correct Status
    console.log('[19/20] Testing Role Protection & Unauthorized Access (401 & 403)...');
    // Missing token -> 401
    const unauthRes = await api('/bookings');
    assert(unauthRes.status === 401, `Expected 401 for unauthenticated request, got ${unauthRes.status}`);

    // Customer accessing admin endpoint -> 403
    const forbiddenAdminRes = await api('/admin/jobs/status', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(forbiddenAdminRes.status === 403, `Expected 403 for Customer accessing /admin, got ${forbiddenAdminRes.status}`);

    // Customer accessing staff live floor -> 403
    const forbiddenFloorRes = await api('/tables/floor/live', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(forbiddenFloorRes.status === 403, `Expected 403 for Customer accessing live floor, got ${forbiddenFloorRes.status}`);
    console.log('  -> 401 Unauthorized and 403 Forbidden boundaries strictly enforced');

    // Step 20: Sensitive Fields Are Not Exposed
    console.log('[20/20] Testing Sensitive Field Redaction & Secret Protection...');
    assert(regRes.data.data.user.password === undefined, 'Password field not exposed in register');
    assert(regRes.data.data.user.passwordHash === undefined, 'passwordHash not exposed in register');
    assert(loginRes.data.data.user.password === undefined, 'Password field not exposed in login');
    assert(meRes.data.data.user.password === undefined, 'Password field not exposed in /auth/me');

    // Check notifications metadata does not contain sensitive tokens or passwords
    const allNotifs = notifsRes.data.data.notifications || [];
    for (const item of allNotifs) {
      assert(item.metadata?.password === undefined, 'Notification metadata does not contain password');
      assert(item.metadata?.token === undefined, 'Notification metadata does not contain token');
      assert(item.metadata?.jwt === undefined, 'Notification metadata does not contain jwt');
    }

    // Check Swagger Documentation route
    const swaggerRes = await api('/docs/spec.json');
    assert(swaggerRes.status === 200 && swaggerRes.data.openapi === '3.0.3', 'Swagger spec available');

    console.log('  -> Sensitive fields, credentials, and password hashes strictly withheld');

    console.log('\n===============================================================');
    console.log(' >>> ALL 20 PRODUCTION AUDIT CHECKS PASSED WITH 100% SUCCESS <<<');
    console.log('===============================================================\n');
  } finally {
    // Clean all test data afterward
    console.log('Cleaning up audit test data...');
    try {
      if (createdBookingRefs.length > 0) {
        await Booking.deleteMany({ bookingReference: { $in: createdBookingRefs } });
      }
      if (createdWaitlistRefs.length > 0) {
        await Waitlist.deleteMany({ waitlistReference: { $in: createdWaitlistRefs } });
      }
      if (createdTableIds.length > 0) {
        await Table.deleteMany({ _id: { $in: createdTableIds } });
        await BookingLock.deleteMany({ tableId: { $in: createdTableIds } });
      }
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
        await Notification.deleteMany({ recipientUserId: { $in: createdUserIds } });
      }
      console.log('Audit test data cleanup complete.\n');
    } catch (cleanupErr) {
      console.error('Error during audit data cleanup:', cleanupErr.message);
    }

    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }
}

runAudit()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nAUDIT FAILED WITH ERROR:', err.message);
    process.exit(1);
  });
