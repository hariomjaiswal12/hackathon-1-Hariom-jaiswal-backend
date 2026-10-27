/**
 * No-show blacklist checks.
 * Uses its own API port and removes only the customers it creates.
 */
process.env.NO_SHOW_BLACKLIST_THRESHOLD = '2';

const http = require('http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');
const { readNoShowBlacklistThreshold } = require('../src/config/env');

const PORT = 5094;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const password = 'Blacklist16!pass';
const stamp = Date.now();
const createdUserIds = [];
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail || '' });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function login(email, pass) {
  return api('/auth/login', { method: 'POST', body: { email, password: pass } });
}

async function findSlot() {
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  for (let index = 0; index < 21; index += 1) {
    const date = isoDate(cursor);
    const schedule = await api(`/schedules/effective/${date}`);
    const day = schedule.data?.data?.schedule;
    const service = day?.services?.[0];
    if (day?.isConfigured && !day.isClosed && service) {
      const availability = await api(`/availability?date=${date}&time=${service.startTime}&guests=2`);
      const tables = availability.data?.data?.availability?.tables || [];
      if (availability.data?.data?.availability?.available && tables.length >= 8) {
        return { date, time: service.startTime, tables };
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

async function book(token, slot, table, extra = {}) {
  return api('/bookings', {
    method: 'POST',
    token,
    body: {
      date: slot.date,
      startTime: slot.time,
      guests: 2,
      tableId: table.id,
      notes: `blacklist-check ${stamp}`,
      ...extra,
    },
  });
}

async function profile(token) {
  const response = await api('/auth/me', { token });
  return response.data?.data?.user;
}

async function cleanup() {
  if (!createdUserIds.length || !env.mongodbUri) return;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.mongodbUri);
  }
  const ids = createdUserIds.map((id) => new mongoose.Types.ObjectId(id));
  const db = mongoose.connection.db;
  await db.collection('notifications').deleteMany({ recipientUserId: { $in: ids } });
  await db.collection('bookings').deleteMany({ customerId: { $in: ids } });
  await db.collection('waitlists').deleteMany({ customerId: { $in: ids } });
  await db.collection('users').deleteMany({ _id: { $in: ids } });
}

async function main() {
  const configuredThreshold = process.env.NO_SHOW_BLACKLIST_THRESHOLD;
  delete process.env.NO_SHOW_BLACKLIST_THRESHOLD;
  record('Threshold default is 3', readNoShowBlacklistThreshold() === 3 && readNoShowBlacklistThreshold('') === 3, '');
  process.env.NO_SHOW_BLACKLIST_THRESHOLD = configuredThreshold;
  record('Invalid threshold falls back to 3', readNoShowBlacklistThreshold('0') === 3 && readNoShowBlacklistThreshold('nope') === 3, '');
  record('Threshold is configurable', readNoShowBlacklistThreshold('4') === 4 && readNoShowBlacklistThreshold() === 2, String(readNoShowBlacklistThreshold()));

  await connectDB();
  const server = http.createServer(app);
  initializeRealtime(server);
  await new Promise((resolve, reject) => {
    server.listen(PORT, (error) => (error ? reject(error) : resolve()));
  });

  try {
    const adminLogin = await login('admin@iturrieta.eus', 'Admin12345!');
    const staffLogin = await login('staff@iturrieta.eus', 'Staff12345!');
    const adminToken = adminLogin.data?.data?.token;
    const staffToken = staffLogin.data?.data?.token;
    if (!adminToken || !staffToken) throw new Error('Seeded staff login failed');

    const registered = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Blacklist Customer', email: `blacklist-${stamp}@example.com`, password, phone: '+34 600 111 333' },
    });
    const customerToken = registered.data?.data?.token;
    const customerId = registered.data?.data?.user?.id;
    if (customerId) createdUserIds.push(customerId);
    const fresh = registered.data?.data?.user;
    record('New customer has noShowCount 0', fresh?.noShowCount === 0 && fresh?.blacklistStatus === 'ACTIVE', String(fresh?.noShowCount));

    const slot = await findSlot();
    if (!slot) throw new Error('No open service with eight free tables');
    const [completeTable, cancelTable, firstNoShowTable, keepTable, secondNoShowTable, staffTable, againTable, raceTable] = slot.tables;

    const completed = await book(customerToken, slot, completeTable);
    const completedRef = completed.data?.data?.booking?.bookingReference;
    await api(`/bookings/${completedRef}/arrive`, { method: 'PATCH', token: staffToken });
    await api(`/bookings/${completedRef}/seat`, { method: 'PATCH', token: staffToken });
    const done = await api(`/bookings/${completedRef}/complete`, { method: 'PATCH', token: staffToken });
    record('Completed booking does not increment count', done.status === 200 && (await profile(customerToken))?.noShowCount === 0, '');

    const cancelled = await book(customerToken, slot, cancelTable);
    const cancelResult = await api(`/bookings/${cancelled.data?.data?.booking?.bookingReference}/cancel`, {
      method: 'PATCH',
      token: customerToken,
      body: { reason: 'blacklist-check cancel' },
    });
    record('Cancelled booking does not increment count', cancelResult.status === 200 && (await profile(customerToken))?.noShowCount === 0, '');

    const first = await book(customerToken, slot, firstNoShowTable);
    const firstRef = first.data?.data?.booking?.bookingReference;
    const noShow = await api(`/bookings/${firstRef}/no-show`, { method: 'PATCH', token: staffToken });
    record('NO_SHOW increments count', noShow.status === 200 && (await profile(customerToken))?.noShowCount === 1, String((await profile(customerToken))?.noShowCount));
    const repeat = await api(`/bookings/${firstRef}/no-show`, { method: 'PATCH', token: staffToken });
    record(
      'Same booking cannot increment twice',
      repeat.status === 409 && repeat.data?.code === 'INVALID_BOOKING_STATE' && (await profile(customerToken))?.noShowCount === 1,
      repeat.data?.code || String(repeat.status)
    );

    const kept = await book(customerToken, slot, keepTable);
    const keptRef = kept.data?.data?.booking?.bookingReference;
    const second = await book(customerToken, slot, secondNoShowTable);
    const secondResult = await api(`/bookings/${second.data?.data?.booking?.bookingReference}/no-show`, {
      method: 'PATCH',
      token: staffToken,
    });
    const restricted = await profile(customerToken);
    record(
      'Customer becomes BLACKLISTED at threshold',
      secondResult.status === 200 && restricted?.noShowCount === 2 && restricted?.blacklistStatus === 'BLACKLISTED' && restricted?.blacklistReason === 'Repeated no-shows' && restricted?.blacklistedAt,
      `${restricted?.blacklistStatus} ${restricted?.noShowCount}`
    );
    const notes = await api('/notifications?type=CUSTOMER_BLACKLISTED', { token: customerToken });
    record('One blacklist notification', (notes.data?.data?.notifications || []).length === 1, String((notes.data?.data?.notifications || []).length));
    const keptBooking = await api(`/bookings/${keptRef}`, { token: customerToken });
    record('Existing booking remains confirmed', keptBooking.data?.data?.booking?.status === 'CONFIRMED', keptBooking.data?.data?.booking?.status || '');

    const before = await api('/bookings', { token: customerToken });
    const blocked = await book(customerToken, slot, staffTable);
    const after = await api('/bookings', { token: customerToken });
    record(
      'Blacklisted customer cannot create booking',
      blocked.status === 403 && blocked.data?.code === 'CUSTOMER_BLACKLISTED' && (after.data?.data?.bookings || []).length === (before.data?.data?.bookings || []).length,
      blocked.data?.code || String(blocked.status)
    );
    const otherCustomer = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Other Customer', email: `blacklist-other-${stamp}@example.com`, password },
    });
    const otherCustomerId = otherCustomer.data?.data?.user?.id;
    if (otherCustomerId) createdUserIds.push(otherCustomerId);
    const spoofedSource = await book(customerToken, slot, staffTable, { source: 'ADMIN' });
    const spoofedCustomer = await book(customerToken, slot, staffTable, { customerId: otherCustomerId });
    const afterSpoof = await api('/bookings', { token: customerToken });
    record(
      'Customer cannot bypass blacklist with payload fields',
      spoofedSource.status === 403 && spoofedCustomer.status === 403 && (afterSpoof.data?.data?.bookings || []).length === (before.data?.data?.bookings || []).length,
      `${spoofedSource.data?.code || spoofedSource.status} / ${spoofedCustomer.data?.code || spoofedCustomer.status}`
    );
    const moved = await api(`/bookings/${keptRef}/reschedule`, {
      method: 'PATCH',
      token: customerToken,
      body: { date: slot.date, startTime: slot.time, tableId: staffTable.id },
    });
    record('Blacklisted customer cannot reschedule', moved.status === 403 && moved.data?.code === 'CUSTOMER_BLACKLISTED', moved.data?.code || '');

    const staffBooking = await book(staffToken, slot, staffTable, { customerId, source: 'STAFF' });
    record('Staff can book for a blacklisted customer', staffBooking.status === 201, staffBooking.data?.code || String(staffBooking.status));

    const customerList = await api('/admin/blacklist', { token: customerToken });
    const customerUnblock = await api(`/admin/blacklist/${customerId}/unblock`, { method: 'PATCH', token: customerToken });
    const staffList = await api('/admin/blacklist', { token: staffToken });
    record('Customer cannot manage the blacklist', customerList.status === 403 && customerUnblock.status === 403, '');
    record('Staff cannot access blacklist endpoints', staffList.status === 403, String(staffList.status));

    const adminList = await api('/admin/blacklist?blacklistStatus=BLACKLISTED&minNoShowCount=2', { token: adminToken });
    const listed = (adminList.data?.data?.customers || []).find((customer) => customer.id === customerId);
    const serialized = JSON.stringify(adminList.data || {});
    record(
      'Admin can list safe blacklist records',
      adminList.status === 200 && listed?.email && listed?.noShowCount === 2 && !('password' in listed) && !serialized.includes('passwordHash') && !serialized.toLowerCase().includes('jwt'),
      String(adminList.status)
    );

    const other = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Manual Blacklist', email: `blacklist-manual-${stamp}@example.com`, password },
    });
    const otherId = other.data?.data?.user?.id;
    if (otherId) createdUserIds.push(otherId);
    const manual = await api(`/admin/blacklist/${otherId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { reason: '  Repeated no-shows  ' },
    });
    record(
      'Manual blacklist does not change noShowCount',
      manual.status === 200 && manual.data?.data?.customer?.blacklistStatus === 'BLACKLISTED' && manual.data?.data?.customer?.noShowCount === 0 && manual.data?.data?.customer?.blacklistReason === 'Repeated no-shows',
      manual.data?.code || ''
    );

    const unblocked = await api(`/admin/blacklist/${customerId}/unblock`, { method: 'PATCH', token: adminToken });
    const unblockedCustomer = unblocked.data?.data?.customer;
    record(
      'Unblock keeps the no-show count',
      unblocked.status === 200 && unblockedCustomer?.blacklistStatus === 'ACTIVE' && unblockedCustomer?.noShowCount === 2 && unblockedCustomer?.blacklistedAt === null && unblockedCustomer?.blacklistReason === null,
      `${unblockedCustomer?.blacklistStatus} ${unblockedCustomer?.noShowCount}`
    );

    const again = await book(customerToken, slot, againTable);
    const againResult = await api(`/bookings/${again.data?.data?.booking?.bookingReference}/no-show`, {
      method: 'PATCH',
      token: staffToken,
    });
    const againProfile = await profile(customerToken);
    const againNotes = await api('/notifications?type=CUSTOMER_BLACKLISTED', { token: customerToken });
    record(
      'Crossing the threshold again blacklists once more',
      againResult.status === 200 && againProfile?.noShowCount === 3 && againProfile?.blacklistStatus === 'BLACKLISTED' && (againNotes.data?.data?.notifications || []).length === 2,
      `${againProfile?.blacklistStatus} ${againProfile?.noShowCount}`
    );

    await api(`/admin/blacklist/${customerId}/unblock`, { method: 'PATCH', token: adminToken });
    const raceBooking = await book(customerToken, slot, raceTable);
    const raceRef = raceBooking.data?.data?.booking?.bookingReference;
    const countBeforeRace = (await profile(customerToken))?.noShowCount;
    const [left, right] = await Promise.all([
      api(`/bookings/${raceRef}/no-show`, { method: 'PATCH', token: staffToken }),
      api(`/bookings/${raceRef}/no-show`, { method: 'PATCH', token: staffToken }),
    ]);
    const raceStatuses = [left.status, right.status].sort();
    const countAfterRace = (await profile(customerToken))?.noShowCount;
    record(
      'Concurrent no-show increments once',
      raceStatuses[0] === 200 && raceStatuses[1] === 409 && countAfterRace === countBeforeRace + 1,
      `${raceStatuses.join('/')} count ${countBeforeRace} -> ${countAfterRace}`
    );
  } finally {
    await cleanup();
    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }

  const failed = results.filter((item) => !item.pass);
  console.log(`\n${results.length - failed.length}/${results.length} blacklist checks passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error('Blacklist check aborted:', error);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error('Cleanup failed:', cleanupError.message);
  }
  process.exit(1);
});
