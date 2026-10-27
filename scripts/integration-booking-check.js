/**
 * External booking channel checks.
 * Uses its own API port and removes only the records it creates.
 */
process.env.INTEGRATION_WEBHOOK_SECRET = 'integration-check-secret';

const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');

const PORT = 5092;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const SECRET = process.env.INTEGRATION_WEBHOOK_SECRET;
const stamp = Date.now();
const password = 'Channel19!pass';
const results = [];
let depositSnapshot = null;
let adminToken = '';

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail || '' });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body;
  if (options.raw !== undefined) {
    body = options.raw;
    headers['Content-Type'] = 'application/json';
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${BASE}${path}`, { method: options.method || 'GET', headers, body });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, text: JSON.stringify(data) };
}

function sign(raw, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

function signed(path, payload, key) {
  const raw = JSON.stringify(payload);
  return api(path, {
    method: 'POST',
    raw,
    headers: {
      'X-Integration-Signature': sign(raw),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
  });
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function bookingPayload(slot, tableIds, email, channel = 'phone') {
  return {
    channel,
    customer: { name: 'Channel Guest', email, phone: '+34 600 190 190' },
    date: slot.date,
    startTime: slot.time,
    guests: 2,
    ...(tableIds.length === 1 ? { tableId: tableIds[0] } : { tableIds }),
    notes: `channel-check ${stamp}`,
  };
}

async function setDeposit(enabled) {
  return api('/payments/admin/config', {
    method: 'PUT',
    token: adminToken,
    body: { enabled },
  });
}

async function cleanup() {
  if (!env.mongodbUri || mongoose.connection.readyState === 0) return;
  const note = new RegExp(`channel-check.*${stamp}`);
  const bookings = await mongoose.connection.db.collection('bookings').find({ notes: note }).toArray();
  const customerIds = bookings.map((booking) => booking.customerId);
  await mongoose.connection.db.collection('bookings').deleteMany({ notes: note });
  await mongoose.connection.db.collection('notifications').deleteMany({ recipientUserId: { $in: customerIds } });
  await mongoose.connection.db.collection('integrationevents').deleteMany({ idempotencyKey: new RegExp(`^channel-${stamp}`) });
  await mongoose.connection.db.collection('users').deleteMany({ email: new RegExp(`^channel-${stamp}`) });
}

async function main() {
  await connectDB();
  const server = http.createServer(app);
  initializeRealtime(server);
  await new Promise((resolve, reject) => {
    server.listen(PORT, (error) => (error ? reject(error) : resolve()));
  });

  try {
    const admin = await api('/auth/login', { method: 'POST', body: { email: 'admin@iturrieta.eus', password: 'Admin12345!' } });
    adminToken = admin.data?.data?.token;
    const customerEmail = `channel-${stamp}@example.com`;
    const registered = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Channel Guest', email: customerEmail, password, phone: '+34 600 190 190' },
    });
    const customerToken = registered.data?.data?.token;
    const customerId = registered.data?.data?.user?.id;
    if (!adminToken || !customerToken) throw new Error('Login failed');

    const currentDeposit = await api('/payments/config');
    depositSnapshot = Boolean(currentDeposit.data?.data?.config?.enabled);
    const depositMinGuests = Number(currentDeposit.data?.data?.config?.minGuests) || 1;
    if (depositSnapshot) await setDeposit(false);

    const unsigned = await api('/integrations/bookings', { method: 'POST', body: { channel: 'phone' } });
    const wrong = await api('/integrations/bookings', {
      method: 'POST',
      raw: '{"channel":"phone"}',
      headers: { 'X-Integration-Signature': sign('{"channel":"phone"}', 'wrong-secret') },
    });
    const jwtOnly = await api('/integrations/bookings', { method: 'POST', token: customerToken, body: { channel: 'phone' } });
    record('Missing signature is rejected', unsigned.status === 401, String(unsigned.status));
    record('Wrong integration secret is rejected', wrong.status === 401, String(wrong.status));
    record('Customer JWT cannot call the integration', jwtOnly.status === 401, String(jwtOnly.status));

    const status = await api('/admin/integrations/status', { token: adminToken });
    record(
      'Admin status does not reveal the secret',
      status.status === 200 && status.data?.data?.channels?.some((item) => item.channel === 'retell' && item.status === 'not_configured') && !status.text.includes(SECRET),
      String(status.status)
    );

    const slot = await findSlot();
    if (!slot) throw new Error('No open service with eight free tables');
    const [first, second, third, fourth, fifth, sixth, seventh, eighth] = slot.tables;

    const created = await signed('/integrations/bookings', bookingPayload(slot, [first.id], customerEmail), `channel-${stamp}-one`);
    const booking = created.data?.data?.booking;
    record('External request creates one phone booking', created.status === 201 && booking?.source === 'PHONE' && booking?.bookingReference, booking?.source || String(created.status));

    const replay = await signed('/integrations/bookings', bookingPayload(slot, [first.id], customerEmail), `channel-${stamp}-one`);
    record('Retried request returns the same booking', replay.status === 200 && replay.data?.data?.booking?.bookingReference === booking?.bookingReference, replay.data?.data?.booking?.bookingReference || '');

    const retell = await signed('/integrations/bookings', bookingPayload(slot, [second.id], customerEmail, 'retell'), `channel-${stamp}-retell`);
    record('A different idempotency key creates another booking', retell.status === 201 && retell.data?.data?.booking?.bookingReference !== booking?.bookingReference && retell.data?.data?.booking?.source === 'PHONE', retell.data?.data?.booking?.source || String(retell.status));

    const before = await api(`/bookings?customerId=${customerId}`, { token: adminToken });
    const beforeCount = (before.data?.data?.bookings || []).length;
    const [left, right] = await Promise.all([
      signed('/integrations/bookings', bookingPayload(slot, [third.id], customerEmail), `channel-${stamp}-race`),
      signed('/integrations/bookings', bookingPayload(slot, [third.id], customerEmail), `channel-${stamp}-race`),
    ]);
    const after = await api(`/bookings?customerId=${customerId}`, { token: adminToken });
    const raceReferences = [left.data?.data?.booking?.bookingReference, right.data?.data?.booking?.bookingReference];
    record(
      'Concurrent duplicate requests create one booking',
      left.status < 300 && right.status < 300 && raceReferences[0] && raceReferences[0] === raceReferences[1] && (after.data?.data?.bookings || []).length === beforeCount + 1,
      `${left.status}/${right.status} ${raceReferences.join(' ')}`
    );

    const conflict = await signed('/integrations/bookings', bookingPayload(slot, [first.id], customerEmail), `channel-${stamp}-conflict`);
    record('Booking conflict still returns 409', conflict.status === 409 && conflict.data?.code === 'BOOKING_CONFLICT', conflict.data?.code || String(conflict.status));

    await api(`/admin/blacklist/${customerId}`, { method: 'PATCH', token: adminToken, body: { reason: 'Channel check' } });
    const blocked = await signed('/integrations/bookings', bookingPayload(slot, [fourth.id], customerEmail), `channel-${stamp}-blocked`);
    record('Blacklisted customer is still blocked', blocked.status === 403 && blocked.data?.code === 'CUSTOMER_BLACKLISTED', blocked.data?.code || String(blocked.status));
    await api(`/admin/blacklist/${customerId}/unblock`, { method: 'PATCH', token: adminToken });

    const closed = await signed('/integrations/bookings', {
      ...bookingPayload(slot, [fourth.id], customerEmail),
      date: '2026-11-02',
    }, `channel-${stamp}-closed`);
    record('Closed restaurant still returns RESTAURANT_CLOSED', closed.status === 409 && closed.data?.code === 'RESTAURANT_CLOSED', closed.data?.code || String(closed.status));

    const missingTable = await signed('/integrations/bookings', bookingPayload(slot, ['64b6f0f0f0f0f0f0f0f0f0f0'], customerEmail), `channel-${stamp}-table`);
    record('Invalid table is rejected', missingTable.status === 404 || missingTable.status === 400, missingTable.data?.code || String(missingTable.status));

    const group = await signed('/integrations/bookings', bookingPayload(slot, [fifth.id, sixth.id, seventh.id], customerEmail, 'whatsapp'), `channel-${stamp}-group`);
    record('Group booking supports three tables', group.status === 201 && group.data?.data?.booking?.tables?.length === 3 && group.data?.data?.booking?.source === 'WHATSAPP', String(group.data?.data?.booking?.tables?.length || group.status));

    const tooMany = await signed('/integrations/bookings', bookingPayload(slot, [fifth.id, sixth.id, seventh.id, eighth.id], customerEmail), `channel-${stamp}-four`);
    record('Four tables are rejected', tooMany.status === 400, tooMany.data?.code || String(tooMany.status));

    const website = await api('/bookings', {
      method: 'POST',
      token: customerToken,
      body: { date: slot.date, startTime: slot.time, guests: 2, tableId: eighth.id, notes: `channel-check ${stamp}` },
    });
    record('Website booking still uses the booking API', website.status === 201 && website.data?.data?.booking?.source === 'WEBSITE', website.data?.data?.booking?.source || String(website.status));

    const spoofed = await signed('/integrations/bookings', {
      ...bookingPayload(slot, [fourth.id], customerEmail),
      status: 'CONFIRMED',
      bookingReference: 'TX-FAKE',
    }, `channel-${stamp}-spoof`);
    const impersonated = await signed('/integrations/bookings', {
      ...bookingPayload(slot, [fourth.id], customerEmail),
      customer: { customerId: admin.data?.data?.user?.id },
    }, `channel-${stamp}-admin`);
    const staffAttemptEmail = `channel-${stamp}-staff@example.com`;
    const staffAttempt = await signed('/integrations/bookings', {
      ...bookingPayload(slot, [fourth.id], staffAttemptEmail),
      customer: { name: 'Staff Attempt', email: staffAttemptEmail, phone: '+34 611 190 192', role: 'STAFF' },
    }, `channel-${stamp}-staff-role`);
    const staffUser = await mongoose.connection.db.collection('users').findOne({ email: staffAttemptEmail });
    record('Integration cannot create a staff account', staffAttempt.status === 400 && !staffUser, staffAttempt.data?.code || String(staffAttempt.status));
    record('Integration cannot set booking status or reference', spoofed.status === 400, spoofed.data?.code || String(spoofed.status));
    record('Integration cannot use a non-customer id', impersonated.status === 403, impersonated.data?.code || String(impersonated.status));

    const freshEmail = `channel-${stamp}-new@example.com`;
    const fresh = await signed('/integrations/bookings', {
      ...bookingPayload(slot, [fourth.id], freshEmail),
      customer: { name: 'Channel Guest', email: freshEmail, phone: '+34 611 190 191' },
    }, `channel-${stamp}-new`);
    const freshUser = fresh.status === 201
      ? await mongoose.connection.db.collection('users').findOne({ email: freshEmail })
      : null;
    record('New external customers are customers', fresh.status === 201 && freshUser?.role === 'CUSTOMER' && !fresh.text.toLowerCase().includes('password'), freshUser?.role || String(fresh.status));

    const freshRef = fresh.data?.data?.booking?.bookingReference;
    if (freshRef) {
      await signed(`/integrations/bookings/${freshRef}/cancel`, {
        channel: 'phone',
        reason: 'cleanup fresh test booking',
      }, `channel-${stamp}-fresh-cancel`);
    }

    const avail = await signed('/integrations/availability', { channel: 'phone', date: slot.date, startTime: slot.time, guests: 2 });
    record('Integration availability uses existing availability engine', avail.status === 200 && avail.data?.data?.availability?.available === true && Array.isArray(avail.data?.data?.availability?.tables), String(avail.status));

    const paymentAttempt = await signed('/integrations/bookings', {
      ...bookingPayload(slot, [fourth.id], customerEmail),
      paymentStatus: 'PAID',
      paidAmount: 100,
    }, `channel-${stamp}-payment-hack`);
    record('Payment cannot be marked PAID by request body', paymentAttempt.status === 400 && paymentAttempt.data?.code === 'VALIDATION_ERROR', paymentAttempt.data?.code || String(paymentAttempt.status));

    const resched = await signed(`/integrations/bookings/${booking.bookingReference}/reschedule`, {
      channel: 'phone',
      date: slot.date,
      startTime: slot.time,
      tableId: fourth.id,
    }, `channel-${stamp}-resched`);
    record('External reschedule uses existing reschedule logic', resched.status === 200 && resched.data?.data?.booking?.bookingReference === booking.bookingReference, resched.data?.data?.booking?.status || String(resched.status));

    const adminBooking = await api('/bookings', {
      method: 'POST',
      token: adminToken,
      body: {
        date: slot.date,
        startTime: slot.time,
        guests: 2,
        tableId: first.id,
        source: 'ADMIN',
        customerId: customerId,
        notes: `channel-check admin ${stamp}`,
      },
    });
    record('Staff/admin existing booking flows remain unchanged', adminBooking.status === 201 && adminBooking.data?.data?.booking?.source === 'ADMIN', adminBooking.data?.data?.booking?.source || String(adminBooking.status));

    const cancelled = await signed(`/integrations/bookings/${booking.bookingReference}/cancel`, {
      channel: 'phone',
      reason: 'Customer requested cancellation via phone',
    }, `channel-${stamp}-cancel`);
    record('External cancellation uses existing cancellation logic', cancelled.status === 200 && cancelled.data?.data?.booking?.status === 'CANCELLED', cancelled.data?.data?.booking?.status || String(cancelled.status));

    const notifications = await api('/notifications', { token: customerToken });
    const notifs = notifications.data?.data?.notifications || [];
    record('Notification is generated through existing notification service', notifications.status === 200 && notifs.length > 0, String(notifs.length));

    const channelModule = require('../src/services/channel');
    const retellAvail = await channelModule.adapters.retell.checkAvailability({ date: slot.date, startTime: slot.time, guests: 2 });
    const whatsappAvail = await channelModule.adapters.whatsapp.checkAvailability({ date: slot.date, startTime: slot.time, guests: 2 });
    record('Retell and WhatsApp adapters are ready with uniform interfaces', Boolean(retellAvail?.available !== undefined && whatsappAvail?.available !== undefined), 'READY');

    await setDeposit(true);
    const depositBlocked = await signed('/integrations/bookings', {
      ...bookingPayload(slot, [fourth.id], customerEmail),
      guests: depositMinGuests,
    }, `channel-${stamp}-deposit`);
    record('Integration cannot bypass a required deposit', depositBlocked.status === 403 && depositBlocked.data?.code === 'PAYMENT_REQUIRED', depositBlocked.data?.code || String(depositBlocked.status));
    record('Integration responses do not include the webhook secret', !created.text.includes(SECRET) && !retell.text.includes('password'), '');
  } finally {
    if (adminToken) {
      await setDeposit(false);
    }
    await cleanup();
    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }

  const failed = results.filter((item) => !item.pass);
  console.log(`\n${results.length - failed.length}/${results.length} integration booking checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error('Integration booking check aborted:', error);
  try {
    if (adminToken) await setDeposit(false);
    await cleanup();
  } catch (cleanupError) {
    console.error('Cleanup failed:', cleanupError.message);
  }
  process.exit(1);
});
