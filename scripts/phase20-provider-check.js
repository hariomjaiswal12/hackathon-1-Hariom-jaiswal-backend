/**
 * Phase 20 provider hardening checks.
 * Uses its own API port and removes only the records it creates.
 */
process.env.INTEGRATION_WEBHOOK_SECRET = 'phase20-integration-secret';
process.env.RETELL_API_KEY = 'phase20-retell-api-key-value';
process.env.WHATSAPP_APP_SECRET = 'phase20-whatsapp-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'phase20-whatsapp-verify-token';
process.env.RETELL_AGENT_ID = '';
process.env.RETELL_WEBHOOK_SECRET = '';
process.env.WHATSAPP_ACCESS_TOKEN = '';
process.env.WHATSAPP_PHONE_NUMBER_ID = '';

const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');
const { integrationView } = require('../src/services/integrations/providerConfig');

const PORT = 5090;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const RETELL_KEY = process.env.RETELL_API_KEY;
const WHATSAPP_SECRET = process.env.WHATSAPP_APP_SECRET;
const stamp = Date.now();
const password = 'Phase20!pass';
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

function signedRetell(payload, secret) {
  const raw = JSON.stringify(payload);
  return api('/integrations/retell/webhook', {
    method: 'POST',
    raw,
    headers: { 'X-Retell-Signature': signRetell(raw, secret) },
  });
}

function signedWhatsApp(payload) {
  const raw = JSON.stringify(payload);
  return api('/integrations/whatsapp/webhook', {
    method: 'POST',
    raw,
    headers: { 'X-Hub-Signature-256': signWhatsApp(raw) },
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

function createArgs(slot, email, phone, extra = {}) {
  return {
    name: 'Phase Twenty',
    email,
    phone,
    date: slot.date,
    time: slot.time,
    guests: 2,
    notes: `phase20 ${stamp}`,
    ...extra,
  };
}

function waBody(id, text, from = '34600201010') {
  return {
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: 'Phase Twenty' }, wa_id: from }],
          messages: [{ from, id, type: 'text', text: { body: text } }],
        },
      }],
    }],
  };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(ORIGIN, { auth: { token }, transports: ['websocket'] });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket timeout'));
    }, 4000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
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
  const note = new RegExp(`phase20 ${stamp}`);
  const bookings = await mongoose.connection.db.collection('bookings').find({ notes: note }).toArray();
  const customerIds = bookings.map((booking) => booking.customerId);
  const users = await mongoose.connection.db.collection('users').find({ email: new RegExp(`^p20-${stamp}`) }).toArray();
  const userIds = [...new Set([...customerIds, ...users.map((user) => user._id)].map(String))];
  await mongoose.connection.db.collection('bookings').deleteMany({ notes: note });
  await mongoose.connection.db.collection('waitlists').deleteMany({ customerId: { $in: users.map((user) => user._id) } });
  await mongoose.connection.db.collection('notifications').deleteMany({ recipientUserId: { $in: users.map((user) => user._id) } });
  await mongoose.connection.db.collection('integrationevents').deleteMany({ idempotencyKey: new RegExp(String(stamp)) });
  await mongoose.connection.db.collection('users').deleteMany({ email: new RegExp(`^p20-${stamp}`) });
  return userIds.length;
}

async function main() {
  const emptyView = integrationView({});
  const invalidView = integrationView({ retellApiKey: 'secret', whatsappAppSecret: 'secret', whatsappVerifyToken: 'secret' });
  const validView = integrationView({
    retellApiKey: RETELL_KEY,
    whatsappAppSecret: WHATSAPP_SECRET,
    whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  });
  record(
    'Empty provider configuration is not configured',
    emptyView.channels.find((item) => item.channel === 'retell').status === 'not_configured'
      && emptyView.channels.find((item) => item.channel === 'whatsapp').status === 'not_configured'
      && emptyView.channels.find((item) => item.channel === 'website').status === 'connected',
    ''
  );
  record(
    'Placeholder credentials are an error and are not connected',
    invalidView.channels.find((item) => item.channel === 'retell').status === 'error'
      && invalidView.channels.find((item) => item.channel === 'whatsapp').status === 'error'
      && !JSON.stringify(invalidView).includes('secret'),
    ''
  );
  record(
    'Well-formed credentials are ready rather than connected',
    validView.channels.find((item) => item.channel === 'retell').status === 'ready'
      && validView.channels.find((item) => item.channel === 'whatsapp').status === 'ready'
      && validView.channels.every((item) => item.channel === 'website' || item.status !== 'connected'),
    ''
  );

  await connectDB();
  const server = http.createServer(app);
  initializeRealtime(server);
  await new Promise((resolve, reject) => {
    server.listen(PORT, (error) => (error ? reject(error) : resolve()));
  });

  try {
    const admin = await api('/auth/login', { method: 'POST', body: { email: 'admin@iturrieta.eus', password: 'Admin12345!' } });
    const staff = await api('/auth/login', { method: 'POST', body: { email: 'staff@iturrieta.eus', password: 'Staff12345!' } });
    adminToken = admin.data?.data?.token;
    const staffToken = staff.data?.data?.token;
    const customerEmail = `p20-${stamp}@example.com`;
    const registered = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Phase Twenty', email: customerEmail, password, phone: '+34 600 201 010' },
    });
    const customerToken = registered.data?.data?.token;
    const customerId = registered.data?.data?.user?.id;
    if (!adminToken || !staffToken || !customerToken) throw new Error('Login failed');

    const currentDeposit = await api('/payments/config');
    depositSnapshot = Boolean(currentDeposit.data?.data?.config?.enabled);
    const depositMinGuests = Number(currentDeposit.data?.data?.config?.minGuests) || 1;
    if (depositSnapshot && depositMinGuests <= 2) await setDeposit(false);

    const unsigned = await api('/integrations/retell/webhook', { method: 'POST', body: { name: 'check_availability', args: {}, call: {} } });
    const wrong = await signedRetell({ name: 'check_availability', args: {}, call: {} }, 'wrong-phase20-secret-value');
    const staleRaw = JSON.stringify({ name: 'check_availability', args: {}, call: {} });
    const stale = await api('/integrations/retell/webhook', {
      method: 'POST',
      raw: staleRaw,
      headers: { 'X-Retell-Signature': signRetell(staleRaw, RETELL_KEY, Date.now() - (10 * 60 * 1000)) },
    });
    const customerJwt = await api('/integrations/retell/webhook', { method: 'POST', token: customerToken, body: { name: 'check_availability', args: {}, call: {} } });
    const staffJwt = await api('/integrations/retell/webhook', { method: 'POST', token: staffToken, body: { name: 'check_availability', args: {}, call: {} } });
    const adminJwt = await api('/integrations/retell/webhook', { method: 'POST', token: adminToken, body: { name: 'check_availability', args: {}, call: {} } });
    record('Invalid Retell signature is rejected', unsigned.status === 401 && wrong.status === 401, `${unsigned.status}/${wrong.status}`);
    record('Stale Retell signature is rejected', stale.status === 401, String(stale.status));
    record('Customer, staff, and admin JWTs cannot call Retell', customerJwt.status === 401 && staffJwt.status === 401 && adminJwt.status === 401, `${customerJwt.status}/${staffJwt.status}/${adminJwt.status}`);

    const slot = await findSlot();
    if (!slot) throw new Error('No open service with eight free tables');
    const call = { call_id: `call-${stamp}` };

    const availability = await signedRetell({
      name: 'check_availability',
      args: { date: slot.date, time: slot.time, guests: 2 },
      call,
    });
    const voice = availability.data?.data || {};
    record(
      'Retell availability is voice-safe',
      availability.status === 200 && voice.available === true && voice.service && voice.endTime && voice.recommendedTables?.[0]?.tableNumber && !JSON.stringify(voice).includes('tableId'),
      voice.service || ''
    );

    const created = await signedRetell({
      name: 'create_booking',
      args: { ...createArgs(slot, customerEmail, '+34 600 201 010'), bookingReference: 'TX-FAKE', status: 'SEATED', paymentStatus: 'PAID', role: 'ADMIN' },
      call,
    });
    const booking = created.data?.data || {};
    const stored = booking.bookingReference
      ? await api(`/bookings/${booking.bookingReference}`, { token: adminToken })
      : { data: {} };
    const storedBooking = stored.data?.data?.booking;
    record(
      'Retell create stores PHONE and ignores spoofed fields',
      booking.success === true && booking.bookingReference !== 'TX-FAKE' && storedBooking?.source === 'PHONE' && storedBooking?.depositStatus !== 'PAID' && !created.text.includes(RETELL_KEY),
      storedBooking?.source || booking.code || ''
    );
    const notices = await api('/notifications', { token: customerToken });
    record(
      'Retell booking reuses in-app notifications',
      (notices.data?.data?.notifications || []).some((item) => item.type === 'BOOKING_CREATED'),
      ''
    );

    const replay = await signedRetell({
      name: 'create_booking',
      args: { ...createArgs(slot, customerEmail, '+34 600 201 010'), bookingReference: 'TX-FAKE', status: 'SEATED', paymentStatus: 'PAID', role: 'ADMIN' },
      call,
    });
    record('Retell duplicate returns the original booking', replay.data?.data?.bookingReference === booking.bookingReference, replay.data?.data?.bookingReference || '');

    const before = await api(`/bookings?customerId=${customerId}`, { token: adminToken });
    const raceArgs = createArgs(slot, customerEmail, '+34 600 201 010');
    const [left, right] = await Promise.all([
      signedRetell({ name: 'create_booking', args: raceArgs, call: { call_id: `call-${stamp}-race` } }),
      signedRetell({ name: 'create_booking', args: raceArgs, call: { call_id: `call-${stamp}-race` } }),
    ]);
    const after = await api(`/bookings?customerId=${customerId}`, { token: adminToken });
    record(
      'Concurrent Retell requests create one booking',
      left.data?.data?.bookingReference && left.data.data.bookingReference === right.data?.data?.bookingReference && (after.data?.data?.bookings || []).length === (before.data?.data?.bookings || []).length + 1,
      `${left.status}/${right.status}`
    );

    const conflict = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 201 010', { tableId: storedBooking?.tableId }),
      call: { call_id: `call-${stamp}-conflict` },
    });
    record('Retell table conflict is rejected', conflict.data?.data?.code === 'BOOKING_CONFLICT', conflict.data?.data?.code || '');

    const lookedUp = await signedRetell({ name: 'get_booking', args: { bookingReference: booking.bookingReference }, call });
    record('Retell get booking hides internal ids', lookedUp.data?.data?.bookingReference === booking.bookingReference && !JSON.stringify(lookedUp.data?.data?.tables || []).includes('"id"'), '');

    const moved = await signedRetell({
      name: 'reschedule_booking',
      args: { bookingReference: booking.bookingReference, date: slot.date, time: booking.endTime, tableNumber: booking.tables?.[0]?.tableNumber },
      call: { call_id: `call-${stamp}-move` },
    });
    record('Retell reschedule uses the booking service', moved.data?.data?.success === true && moved.data?.data?.startTime === booking.endTime, moved.data?.data?.code || moved.data?.data?.startTime || '');

    const cancelled = await signedRetell({
      name: 'cancel_booking',
      args: { bookingReference: booking.bookingReference },
      call: { call_id: `call-${stamp}-cancel` },
    });
    record('Retell cancellation uses the booking service', cancelled.data?.data?.status === 'CANCELLED', cancelled.data?.data?.status || cancelled.data?.data?.code || '');

    const group = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 201 010', { tableNumbers: [String(slot.tables[4].tableNumber), String(slot.tables[5].tableNumber)] }),
      call: { call_id: `call-${stamp}-group` },
    });
    record('Retell group booking supports two tables', group.data?.data?.success === true && group.data?.data?.tables?.length === 2, String(group.data?.data?.tables?.length || group.data?.data?.code || ''));

    await api(`/admin/blacklist/${customerId}`, { method: 'PATCH', token: adminToken, body: { reason: 'Phase 20' } });
    const blocked = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 201 010'),
      call: { call_id: `call-${stamp}-blocked` },
    });
    record('Blacklisted customer is still blocked on Retell', blocked.data?.data?.code === 'CUSTOMER_BLACKLISTED', blocked.data?.data?.code || '');
    await api(`/admin/blacklist/${customerId}/unblock`, { method: 'PATCH', token: adminToken });

    const closed = await signedRetell({
      name: 'create_booking',
      args: createArgs({ date: '2026-11-02', time: '13:00' }, customerEmail, '+34 600 201 010'),
      call: { call_id: `call-${stamp}-closed` },
    });
    record('Closed restaurant still returns RESTAURANT_CLOSED', closed.data?.data?.code === 'RESTAURANT_CLOSED', closed.data?.data?.code || '');

    const staffEmail = `p20-${stamp}-staff@example.com`;
    const staffAttempt = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, staffEmail, '+34 611 201 201', { role: 'STAFF' }),
      call: { call_id: `call-${stamp}-staff` },
    });
    const adminEmail = `p20-${stamp}-admin@example.com`;
    const adminAttempt = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, adminEmail, '+34 611 201 202', { role: 'ADMIN' }),
      call: { call_id: `call-${stamp}-admin-role` },
    });
    const staffUser = await mongoose.connection.db.collection('users').findOne({ email: staffEmail });
    const adminUser = await mongoose.connection.db.collection('users').findOne({ email: adminEmail });
    record('Retell cannot create staff or admin accounts', staffAttempt.data?.data?.success === true && staffUser?.role === 'CUSTOMER' && adminAttempt.data?.data?.success === true && adminUser?.role === 'CUSTOMER', `${staffUser?.role || ''}/${adminUser?.role || ''}`);

    const impersonated = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 201 010', { customerId: admin.data?.data?.user?.id }),
      call: { call_id: `call-${stamp}-impersonate` },
    });
    record('Retell cannot book as an admin id', impersonated.data?.data?.success !== true, impersonated.data?.data?.code || '');

    const other = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Other Guest', email: `p20-${stamp}-other@example.com`, password, phone: '+34 600 201 333' },
    });
    const collision = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 201 333'),
      call: { call_id: `call-${stamp}-collision` },
    });
    record('Email and phone from different customers are rejected', collision.data?.data?.success !== true && other.status === 201, collision.data?.data?.code || '');

    const spaced = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Spaced Phone', email: `p20-${stamp}-phone@example.com`, password, phone: '+34 600 201 444' },
    });
    const normalized = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, `p20-${stamp}-phone@example.com`, '34600201444'),
      call: { call_id: `call-${stamp}-phone` },
    });
    const phoneUsers = await mongoose.connection.db.collection('users').countDocuments({ email: `p20-${stamp}-phone@example.com` });
    record('The same phone digits resolve one customer', spaced.status === 201 && normalized.data?.data?.success === true && phoneUsers === 1, String(phoneUsers));

    const malformedRaw = '{';
    const malformed = await api('/integrations/whatsapp/webhook', {
      method: 'POST',
      raw: malformedRaw,
      headers: { 'X-Hub-Signature-256': signWhatsApp(malformedRaw) },
    });
    const missingSignature = await api('/integrations/whatsapp/webhook', { method: 'POST', body: { entry: [] } });
    const challenge = await api(`/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${process.env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=p20-${stamp}`);
    const badChallenge = await api('/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=nope');
    record('Malformed WhatsApp JSON is rejected', malformed.status === 400, String(malformed.status));
    record('Invalid WhatsApp signature is rejected', missingSignature.status === 401, String(missingSignature.status));
    record('WhatsApp verification accepts only the configured token', challenge.status === 200 && challenge.text.includes(`p20-${stamp}`) && badChallenge.status === 403, `${challenge.status}/${badChallenge.status}`);

    const ignored = await signedWhatsApp(waBody(`wamid-${stamp}-hello`, 'Hello there'));
    record('Unsupported WhatsApp text does not create a booking', ignored.data?.results?.[0]?.code === 'IGNORED' && ignored.data?.results?.[0]?.sent === false, ignored.data?.results?.[0]?.code || '');

    const missingIdentity = await signedWhatsApp(waBody(`wamid-${stamp}-noname`, `book ${slot.date} ${slot.time} 2 | A | p20-${stamp}-missing@example.com | phase20 ${stamp}`, '34600201777'));
    record('WhatsApp rejects a customer without a usable name', missingIdentity.data?.results?.[0]?.success !== true && missingIdentity.data?.results?.[0]?.sent === false, missingIdentity.data?.results?.[0]?.code || '');

    const tableNumber = String(slot.tables[6].tableNumber);
    const waText = `book ${slot.date} ${slot.time} 2 | Phase Twenty | p20-${stamp}-wa@example.com | phase20 ${stamp} | ${tableNumber}`;
    const waCreated = await signedWhatsApp(waBody(`wamid-${stamp}-book`, waText, '34600201888'));
    const waReplay = await signedWhatsApp(waBody(`wamid-${stamp}-book`, waText, '34600201888'));
    const waBooking = waCreated.data?.results?.[0] || {};
    record(
      'WhatsApp books once and does not send without outbound credentials',
      waBooking.success === true && waBooking.sent === false && waReplay.data?.results?.[0]?.bookingReference === waBooking.bookingReference,
      waBooking.code || waBooking.bookingReference || ''
    );

    const liveTables = await api(`/availability?date=${slot.date}&time=${slot.time}&guests=2`);
    const raceTable = (liveTables.data?.data?.availability?.tables || [])[0];
    const conflictText = `book ${slot.date} ${slot.time} 2 | Phase Twenty | p20-${stamp}-race@example.com | phase20 ${stamp} | ${raceTable.tableNumber}`;
    const [waLeft, waRight] = await Promise.all([
      signedWhatsApp(waBody(`wamid-${stamp}-a`, conflictText, '34600201011')),
      signedWhatsApp(waBody(`wamid-${stamp}-b`, conflictText, '34600201011')),
    ]);
    const waCodes = [waLeft.data?.results?.[0]?.code, waRight.data?.results?.[0]?.code];
    const waSuccesses = [waLeft, waRight].filter((item) => item.data?.results?.[0]?.success === true).length;
    record(
      'Concurrent WhatsApp requests do not double-book one table',
      waSuccesses === 1 && waCodes.some((code) => code === 'BOOKING_CONFLICT' || code === 'NO_SUITABLE_TABLE'),
      waCodes.filter(Boolean).join('/') || String(waSuccesses)
    );

    const waCancel = await signedWhatsApp(waBody(`wamid-${stamp}-cancel`, `cancel ${waBooking.bookingReference} Phase 20`));
    record('WhatsApp cancellation uses the booking service', waCancel.data?.results?.[0]?.status === 'CANCELLED' && waCancel.data?.results?.[0]?.sent === false, waCancel.data?.results?.[0]?.status || waCancel.data?.results?.[0]?.code || '');

    const freshTables = await api(`/availability?date=${slot.date}&time=${slot.time}&guests=2`);
    const freshTable = (freshTables.data?.data?.availability?.tables || [])[0];
    const waFresh = await signedWhatsApp(waBody(`wamid-${stamp}-fresh`, `book ${slot.date} ${slot.time} 2 | Phase Twenty | p20-${stamp}-wa2@example.com | phase20 ${stamp} | ${freshTable.tableNumber}`, '34600201889'));
    const freshRef = waFresh.data?.results?.[0]?.bookingReference;
    const waMove = freshRef
      ? await signedWhatsApp(waBody(`wamid-${stamp}-move`, `reschedule ${freshRef} ${slot.date} ${waFresh.data.results[0].endTime}`))
      : waFresh;
    record('WhatsApp reschedule uses the booking service', waMove.data?.results?.[0]?.success === true && waMove.data?.results?.[0]?.startTime === waFresh.data?.results?.[0]?.endTime, waMove.data?.results?.[0]?.code || waMove.data?.results?.[0]?.startTime || '');

    const waClosed = await signedWhatsApp(waBody(`wamid-${stamp}-closed`, `book 2026-11-02 13:00 2 | Phase Twenty | ${customerEmail} | phase20 ${stamp}`));
    record('WhatsApp closed day does not send a message', waClosed.data?.results?.[0]?.code === 'RESTAURANT_CLOSED' && waClosed.data?.results?.[0]?.sent === false, waClosed.data?.results?.[0]?.code || '');

    await api(`/admin/blacklist/${customerId}`, { method: 'PATCH', token: adminToken, body: { reason: 'Phase 20 WhatsApp' } });
    const waBlocked = await signedWhatsApp(waBody(`wamid-${stamp}-blocked`, `book ${slot.date} ${slot.time} 2 | Phase Twenty | ${customerEmail} | phase20 ${stamp}`, '34600201010'));
    record('WhatsApp blacklist does not send a message', waBlocked.data?.results?.[0]?.code === 'CUSTOMER_BLACKLISTED' && waBlocked.data?.results?.[0]?.sent === false, waBlocked.data?.results?.[0]?.code || '');
    await api(`/admin/blacklist/${customerId}/unblock`, { method: 'PATCH', token: adminToken });

    const waList = await signedWhatsApp(waBody(`wamid-${stamp}-wait`, `waitlist ${slot.date} ${slot.time} 2 | Phase Twenty | p20-${stamp}-wait@example.com`, '34600201999'));
    record('WhatsApp waitlist uses the waitlist service', Boolean(waList.data?.results?.[0]?.waitlistReference) && !JSON.stringify(waList.data?.results?.[0] || {}).includes('customerId'), waList.data?.results?.[0]?.code || waList.data?.results?.[0]?.waitlistReference || '');

    const status = await api('/admin/integrations/status', { token: adminToken });
    const channels = status.data?.data?.channels || [];
    record(
      'Admin status reports capabilities without secrets',
      status.status === 200
        && channels.find((item) => item.channel === 'retell')?.status === 'ready'
        && channels.find((item) => item.channel === 'whatsapp')?.outbound === false
        && Array.isArray(channels.find((item) => item.channel === 'retell')?.operations)
        && status.data?.data?.checkedAt
        && !status.text.includes(RETELL_KEY)
        && !status.text.includes(WHATSAPP_SECRET),
      channels.find((item) => item.channel === 'retell')?.status || ''
    );

    const openNow = await api(`/availability?date=${slot.date}&time=${slot.time}&guests=2`);
    const freeTable = (openNow.data?.data?.availability?.tables || [])[0];
    const website = await api('/bookings', {
      method: 'POST',
      token: customerToken,
      body: { date: slot.date, startTime: slot.time, guests: 2, tableId: freeTable?.id, notes: `phase20 ${stamp}` },
    });
    const recommendation = await api(`/tables/recommendation?date=${slot.date}&time=${slot.time}&guests=2`);
    const events = await api('/events');
    const news = await api('/news');
    const floor = await api('/tables/floor/live', { token: staffToken });
    const customerFloor = await api('/tables/floor/live', { token: customerToken });
    const jobs = await api('/admin/jobs/status', { token: adminToken });
    const dashboard = await api(`/admin/dashboard?date=${slot.date}`, { token: adminToken });
    let socketConnected = false;
    try {
      const socket = await connectSocket(staffToken);
      socketConnected = socket.connected;
      socket.close();
    } catch (error) {
      socketConnected = false;
    }
    record('Website booking still uses the booking API', website.status === 201 && website.data?.data?.booking?.source === 'WEBSITE', website.data?.data?.booking?.source || String(website.status));
    record('Availability and recommendations stay on the existing engine', openNow.status === 200 && recommendation.status === 200, `${openNow.status}/${recommendation.status}`);
    record('Events and news stay available', events.status === 200 && news.status === 200, `${events.status}/${news.status}`);
    record('Live floor, scheduler, and admin dashboard stay protected', floor.status === 200 && customerFloor.status === 403 && jobs.status === 200 && dashboard.status === 200, `${floor.status}/${customerFloor.status}/${jobs.status}/${dashboard.status}`);
    record('Socket.io staff authentication still connects', socketConnected, '');

    await setDeposit(true);
    const depositBlocked = await signedRetell({
      name: 'create_booking',
      args: createArgs(slot, customerEmail, '+34 600 201 010', { guests: Math.max(depositMinGuests, 2) }),
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
  console.log(`\n${results.length - failed.length}/${results.length} phase 20 checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error('Phase 20 check aborted:', error);
  try {
    if (depositSnapshot !== null && adminToken) await setDeposit(depositSnapshot);
    await cleanup();
  } catch (cleanupError) {
    console.error('Cleanup failed:', cleanupError.message);
  }
  process.exit(1);
});
