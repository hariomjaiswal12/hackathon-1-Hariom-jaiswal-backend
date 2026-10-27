/**
 * Retell and WhatsApp webhook checks.
 * Uses its own API port and removes only the records it creates.
 */
process.env.INTEGRATION_WEBHOOK_SECRET = 'provider-check-integration-secret';
process.env.RETELL_API_KEY = 'provider-check-retell-key';
process.env.WHATSAPP_APP_SECRET = 'provider-check-whatsapp-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'provider-check-verify-token';
delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.WHATSAPP_PHONE_NUMBER_ID;

const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');

const PORT = 5091;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const RETELL_KEY = process.env.RETELL_API_KEY;
const WHATSAPP_SECRET = process.env.WHATSAPP_APP_SECRET;
const stamp = Date.now();
const password = 'Provider20!pass';
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
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }
  return { status: response.status, data, text };
}

function signRetell(raw, secret = RETELL_KEY, timestamp = Date.now()) {
  const stampValue = String(timestamp);
  const digest = crypto.createHmac('sha256', secret).update(`${raw}${stampValue}`).digest('hex');
  return `v=${stampValue},d=${digest}`;
}

function signWhatsApp(raw, secret = WHATSAPP_SECRET) {
  return `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
}

function retell(payload, signature) {
  const raw = JSON.stringify(payload);
  return api('/integrations/retell/webhook', {
    method: 'POST',
    raw,
    headers: signature === undefined ? {} : { 'X-Retell-Signature': signature === null ? signRetell(raw) : signature },
  });
}

function signedRetell(payload) {
  const raw = JSON.stringify(payload);
  return api('/integrations/retell/webhook', {
    method: 'POST',
    raw,
    headers: { 'X-Retell-Signature': signRetell(raw) },
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
      if (availability.data?.data?.availability?.available && tables.length >= 4) {
        return { date, time: service.startTime, tables };
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

function createArgs(slot, email, phone, extra = {}) {
  return {
    name: 'Provider Guest',
    email,
    phone,
    date: slot.date,
    time: slot.time,
    guests: 2,
    notes: `provider-check ${stamp}`,
    bookingReference: 'TX-FAKE',
    status: 'CONFIRMED',
    role: 'STAFF',
    ...extra,
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
  const note = new RegExp(`provider-check ${stamp}`);
  const bookings = await mongoose.connection.db.collection('bookings').find({ notes: note }).toArray();
  const customerIds = bookings.map((booking) => booking.customerId);
  await mongoose.connection.db.collection('bookings').deleteMany({ notes: note });
  await mongoose.connection.db.collection('notifications').deleteMany({ recipientUserId: { $in: customerIds } });
  await mongoose.connection.db.collection('integrationevents').deleteMany({ idempotencyKey: new RegExp(String(stamp)) });
  await mongoose.connection.db.collection('users').deleteMany({ email: new RegExp(`^provider-${stamp}`) });
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
    const customerEmail = `provider-${stamp}@example.com`;
    const registered = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Provider Guest', email: customerEmail, password, phone: '+34 600 200 200' },
    });
    const customerToken = registered.data?.data?.token;
    const customerId = registered.data?.data?.user?.id;
    if (!adminToken || !customerToken) throw new Error('Login failed');

    const currentDeposit = await api('/payments/config');
    depositSnapshot = Boolean(currentDeposit.data?.data?.config?.enabled);
    const depositMinGuests = Number(currentDeposit.data?.data?.config?.minGuests) || 1;
    if (depositSnapshot && depositMinGuests <= 2) await setDeposit(false);

    const missing = await retell({ name: 'check_availability', args: {}, call: {} }, '');
    const wrong = await (async () => {
      const raw = JSON.stringify({ name: 'check_availability', args: {}, call: {} });
      return api('/integrations/retell/webhook', {
        method: 'POST',
        raw,
        headers: { 'X-Retell-Signature': signRetell(raw, 'wrong-key') },
      });
    })();
    const staleRaw = JSON.stringify({ name: 'check_availability', args: {}, call: {} });
    const stale = await api('/integrations/retell/webhook', {
      method: 'POST',
      raw: staleRaw,
      headers: { 'X-Retell-Signature': signRetell(staleRaw, RETELL_KEY, Date.now() - (10 * 60 * 1000)) },
    });
    const jwtOnly = await api('/integrations/retell/webhook', {
      method: 'POST',
      token: customerToken,
      body: { name: 'check_availability', args: {}, call: {} },
    });
    record('Missing Retell signature is rejected', missing.status === 401, String(missing.status));
    record('Wrong Retell key is rejected', wrong.status === 401, String(wrong.status));
    record('Stale Retell signature is rejected', stale.status === 401, String(stale.status));
    record('Customer JWT cannot call Retell', jwtOnly.status === 401, String(jwtOnly.status));

    const slot = await findSlot();
    if (!slot) throw new Error('No open service with four free tables');
    const call = { call_id: `call-${stamp}`, from_number: '+34600200200' };

    const availability = await signedRetell({
      name: 'check_availability',
      args: { date: slot.date, time: slot.time, guests: 2 },
      call,
    });
    const voice = availability.data?.data || {};
    record(
      'Retell availability comes from the booking engine',
      availability.status === 200 && voice.available === true && voice.service && voice.endTime && voice.recommendedTables?.length > 0 && !JSON.stringify(voice.recommendedTables).includes('tableId'),
      voice.service || String(availability.status)
    );

    const created = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 200 200'),
      call,
    });
    const booking = created.data?.data || {};
    const stored = booking.bookingReference
      ? await api(`/bookings/${booking.bookingReference}`, { token: adminToken })
      : { data: {} };
    record(
      'Retell creates one PHONE booking',
      created.status === 200 && booking.success === true && booking.bookingReference && booking.bookingReference !== 'TX-FAKE' && stored.data?.data?.booking?.source === 'PHONE',
      stored.data?.data?.booking?.source || String(created.status)
    );

    const replay = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 200 200'),
      call,
    });
    record(
      'Retell retry returns the same booking',
      replay.status === 200 && replay.data?.data?.bookingReference === booking.bookingReference,
      replay.data?.data?.bookingReference || ''
    );

    const before = await api(`/bookings?customerId=${customerId}`, { token: adminToken });
    const beforeCount = (before.data?.data?.bookings || []).length;
    const raceCall = { call_id: `call-${stamp}-race` };
    const raceArgs = createArgs(slot, customerEmail, '+34 600 200 200');
    const [left, right] = await Promise.all([
      signedRetell({ name: 'create_booking', args: raceArgs, call: raceCall }),
      signedRetell({ name: 'create_booking', args: raceArgs, call: raceCall }),
    ]);
    const after = await api(`/bookings?customerId=${customerId}`, { token: adminToken });
    record(
      'Concurrent Retell requests create one booking',
      left.data?.data?.bookingReference && left.data.data.bookingReference === right.data?.data?.bookingReference && (after.data?.data?.bookings || []).length === beforeCount + 1,
      `${left.status}/${right.status}`
    );

    const tableId = stored.data?.data?.booking?.tableId;
    const conflict = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 200 200', { tableId }),
      call: { call_id: `call-${stamp}-conflict` },
    });
    record('Retell booking conflict stays a conflict', conflict.data?.data?.code === 'BOOKING_CONFLICT', conflict.data?.data?.code || String(conflict.status));

    const lookedUp = await signedRetell({
      name: 'get_booking',
      args: { bookingReference: booking.bookingReference },
      call,
    });
    record('Retell can read the booking it created', lookedUp.data?.data?.bookingReference === booking.bookingReference && !lookedUp.text.includes(RETELL_KEY), lookedUp.data?.data?.bookingReference || '');

    const moved = await signedRetell({
      name: 'reschedule_booking',
      args: {
        bookingReference: booking.bookingReference,
        date: slot.date,
        time: booking.endTime,
        tableNumber: booking.tables?.[0]?.tableNumber,
      },
      call: { call_id: `call-${stamp}-move` },
    });
    record('Retell reschedule uses the booking service', moved.data?.data?.success === true && moved.data?.data?.startTime === booking.endTime, moved.data?.data?.code || moved.data?.data?.startTime || '');

    const cancelled = await signedRetell({
      name: 'cancel_booking',
      args: { bookingReference: booking.bookingReference, reason: 'Provider check' },
      call: { call_id: `call-${stamp}-cancel` },
    });
    record('Retell cancellation uses the booking service', cancelled.data?.data?.status === 'CANCELLED', cancelled.data?.data?.status || cancelled.data?.data?.code || '');

    await api(`/admin/blacklist/${customerId}`, { method: 'PATCH', token: adminToken, body: { reason: 'Provider check' } });
    const blocked = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 200 200'),
      call: { call_id: `call-${stamp}-blocked` },
    });
    record('Blacklisted customer is still blocked', blocked.data?.data?.code === 'CUSTOMER_BLACKLISTED', blocked.data?.data?.code || '');
    await api(`/admin/blacklist/${customerId}/unblock`, { method: 'PATCH', token: adminToken });

    const closed = await signedRetell({
      name: 'create_booking',
      args: createArgs({ date: '2026-11-02', time: '13:00' }, customerEmail, '+34 600 200 200'),
      call: { call_id: `call-${stamp}-closed` },
    });
    record('Closed restaurant still returns RESTAURANT_CLOSED', closed.data?.data?.code === 'RESTAURANT_CLOSED', closed.data?.data?.code || '');

    const missingTable = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 200 200', { tableId: '64b6f0f0f0f0f0f0f0f0f0f0' }),
      call: { call_id: `call-${stamp}-table` },
    });
    record('Invalid table is rejected', missingTable.data?.data?.code === 'NOT_FOUND' || missingTable.data?.data?.code === 'INVALID_TABLE_SELECTION', missingTable.data?.data?.code || '');

    const staffEmail = `provider-${stamp}-staff@example.com`;
    const staffAttempt = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, staffEmail, '+34 611 200 201'),
      call: { call_id: `call-${stamp}-staff` },
    });
    const staffUser = await mongoose.connection.db.collection('users').findOne({ email: staffEmail });
    record('Retell cannot create a staff account', staffAttempt.data?.data?.success === true && staffUser?.role === 'CUSTOMER', staffUser?.role || staffAttempt.data?.data?.code || '');

    const lifecycle = await signedRetell({
      event: 'call_ended',
      call: { call_id: `call-${stamp}-ended` },
    });
    record('Retell call events do not create a booking', lifecycle.status === 204, String(lifecycle.status));

    const whatsappMissing = await api('/integrations/whatsapp/webhook', { method: 'POST', body: { entry: [] } });
    const challenge = await api(`/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${process.env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=challenge-${stamp}`);
    const badChallenge = await api('/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=nope');
    record('Missing WhatsApp signature is rejected', whatsappMissing.status === 401, String(whatsappMissing.status));
    record('WhatsApp verification challenge is returned', challenge.status === 200 && challenge.text.includes(`challenge-${stamp}`), String(challenge.status));
    record('Wrong WhatsApp verify token is rejected', badChallenge.status === 403, String(badChallenge.status));

    const waBody = {
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: 'WhatsApp Guest' }, wa_id: '34611200202' }],
            messages: [{
              from: '34611200202',
              id: `wamid-${stamp}`,
              type: 'text',
              text: { body: `book ${slot.date} ${slot.time} 2 | WhatsApp Guest | provider-${stamp}-wa@example.com | provider-check ${stamp}` },
            }],
          },
        }],
      }],
    };
    const waRaw = JSON.stringify(waBody);
    const waCreated = await api('/integrations/whatsapp/webhook', {
      method: 'POST',
      raw: waRaw,
      headers: { 'X-Hub-Signature-256': signWhatsApp(waRaw) },
    });
    const waBooking = waCreated.data?.results?.[0] || {};
    const waStored = waBooking.bookingReference
      ? await api(`/bookings/${waBooking.bookingReference}`, { token: adminToken })
      : { data: {} };
    record(
      'WhatsApp creates one WHATSAPP booking without sending a message',
      waCreated.status === 200 && waBooking.success === true && waBooking.sent === false && waStored.data?.data?.booking?.source === 'WHATSAPP',
      waStored.data?.data?.booking?.source || waBooking.code || String(waCreated.status)
    );
    const waReplay = await api('/integrations/whatsapp/webhook', {
      method: 'POST',
      raw: waRaw,
      headers: { 'X-Hub-Signature-256': signWhatsApp(waRaw) },
    });
    record('WhatsApp retry returns the same booking', waReplay.data?.results?.[0]?.bookingReference === waBooking.bookingReference, waReplay.data?.results?.[0]?.bookingReference || '');

    const ignoredBody = {
      entry: [{
        changes: [{
          value: {
            messages: [{ from: '34611200202', id: `wamid-${stamp}-hello`, type: 'text', text: { body: 'Hello' } }],
          },
        }],
      }],
    };
    const ignoredRaw = JSON.stringify(ignoredBody);
    const beforeIgnored = await mongoose.connection.db.collection('bookings').countDocuments({ notes: `provider-check ${stamp}` });
    const ignored = await api('/integrations/whatsapp/webhook', {
      method: 'POST',
      raw: ignoredRaw,
      headers: { 'X-Hub-Signature-256': signWhatsApp(ignoredRaw) },
    });
    const afterIgnored = await mongoose.connection.db.collection('bookings').countDocuments({ notes: `provider-check ${stamp}` });
    record('A normal WhatsApp message does not create a booking', ignored.data?.results?.[0]?.code === 'IGNORED' && beforeIgnored === afterIgnored, ignored.data?.results?.[0]?.code || '');

    const status = await api('/admin/integrations/status', { token: adminToken });
    const retellStatus = (status.data?.data?.channels || []).find((item) => item.channel === 'retell');
    const whatsappStatus = (status.data?.data?.channels || []).find((item) => item.channel === 'whatsapp');
    record(
      'Admin status shows Ready without secrets or a fake connection',
      status.status === 200 && retellStatus?.status === 'ready' && whatsappStatus?.status === 'ready' && retellStatus.status !== 'connected' && !status.text.includes(RETELL_KEY) && !status.text.includes(WHATSAPP_SECRET),
      `${retellStatus?.status || ''}/${whatsappStatus?.status || ''}`
    );

    const openNow = await api(`/availability?date=${slot.date}&time=${slot.time}&guests=2`);
    const freeTable = (openNow.data?.data?.availability?.tables || [])[0];
    const website = await api('/bookings', {
      method: 'POST',
      token: customerToken,
      body: { date: slot.date, startTime: slot.time, guests: 2, tableId: freeTable?.id, notes: `provider-check ${stamp}` },
    });
    record('Website booking still uses the booking API', website.status === 201 && website.data?.data?.booking?.source === 'WEBSITE', website.data?.data?.booking?.source || String(website.status));

    await setDeposit(true);
    const depositBlocked = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 200 200', { guests: Math.max(depositMinGuests, 2) }),
      call: { call_id: `call-${stamp}-deposit` },
    });
    record('Retell cannot bypass a required deposit', depositBlocked.data?.data?.code === 'PAYMENT_REQUIRED', depositBlocked.data?.data?.code || '');
  } finally {
    if (depositSnapshot !== null) await setDeposit(depositSnapshot);
    await cleanup();
    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }

  const failed = results.filter((item) => !item.pass);
  console.log(`\n${results.length - failed.length}/${results.length} provider booking checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error('Provider booking check aborted:', error);
  try {
    if (depositSnapshot !== null && adminToken) await setDeposit(depositSnapshot);
    await cleanup();
  } catch (cleanupError) {
    console.error('Cleanup failed:', cleanupError.message);
  }
  process.exit(1);
});
