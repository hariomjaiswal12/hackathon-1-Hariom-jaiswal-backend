/**
 * Phase 15 end-to-end run against the already running API.
 * Creates only QA15-tagged records and removes them before exit.
 */
const { io } = require('socket.io-client');
const mongoose = require('mongoose');
const env = require('../src/config/env');

const BASE = process.env.QA_API_BASE || 'http://127.0.0.1:5000/api/v1';
const ORIGIN = new URL(BASE).origin;
const stamp = Date.now();
const password = 'QaPhase15!pass';
const results = [];
const createdUserIds = [];
const createdBookingRefs = [];
const createdWaitlistRefs = [];
const createdClosedDates = [];
let scheduleSnapshots = [];
let tableSnapshots = [];

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

function minutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function fromMinutes(value) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function register(email, name) {
  const response = await api('/auth/register', {
    method: 'POST',
    body: { name, email, password, phone: '+34 600 000 000' },
  });
  if (response.data?.data?.user?.id) createdUserIds.push(response.data.data.user.id);
  return response;
}

async function login(email, pass) {
  return api('/auth/login', { method: 'POST', body: { email, password: pass } });
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(ORIGIN, { auth: { token }, transports: ['websocket'] });
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

function once(socket, event, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload || {});
    });
  });
}

async function findOpenDate(startOffset) {
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + startOffset);
  for (let index = 0; index < 28; index += 1) {
    const date = isoDate(cursor);
    const response = await api(`/schedules/effective/${date}`);
    const schedule = response.data?.data?.schedule;
    if (schedule?.isConfigured && !schedule.isClosed && schedule.services?.length) {
      return { date, schedule };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

async function restoreSchedules() {
  for (const day of scheduleSnapshots) {
    await api(`/schedules/${day.dayOfWeek}`, {
      method: 'PUT',
      token: restoreToken,
      body: {
        isOpen: Boolean(day.isOpen),
        services: day.services || [],
      },
    });
  }
}

async function restoreTables() {
  for (const table of tableSnapshots) {
    await api(`/tables/${table.id}/status`, {
      method: 'PATCH',
      token: restoreToken,
      body: { status: table.status },
    });
    await api(`/tables/${table.id}`, {
      method: 'PATCH',
      token: restoreToken,
      body: { notes: table.notes || '' },
    });
    await api(`/tables/${table.id}/position`, {
      method: 'PATCH',
      token: restoreToken,
      body: table.position,
    });
  }
}

let restoreToken = '';

async function cleanup() {
  if (restoreToken) {
    try {
      await restoreSchedules();
      await restoreTables();
    } catch (error) {
      console.error('Restore failed:', error.message);
    }
    for (const date of createdClosedDates) {
      try {
        const existing = await api(`/closed-days/${date}`);
        const id = existing.data?.data?.closedDay?.id;
        if (id) {
          await api(`/closed-days/${id}`, {
            method: 'PATCH',
            token: restoreToken,
            body: { isActive: false },
          });
        }
      } catch (error) {
        console.error('Closed-day cleanup failed:', error.message);
      }
    }
  }

  if (!env.mongodbUri || createdUserIds.length === 0 && createdBookingRefs.length === 0) {
    if (!env.mongodbUri) return;
  }

  await mongoose.connect(env.mongodbUri);
  const User = mongoose.connection.collection('users');
  const Booking = mongoose.connection.collection('bookings');
  const Waitlist = mongoose.connection.collection('waitlists');
  const Notification = mongoose.connection.collection('notifications');
  const ClosedDay = mongoose.connection.collection('closeddays');

  if (createdBookingRefs.length) {
    await Booking.deleteMany({ bookingReference: { $in: createdBookingRefs } });
  }
  if (createdWaitlistRefs.length) {
    await Waitlist.deleteMany({ waitlistReference: { $in: createdWaitlistRefs } });
  }
  if (createdUserIds.length) {
    const ids = createdUserIds.map((id) => new mongoose.Types.ObjectId(id));
    await Notification.deleteMany({ recipientUserId: { $in: ids } });
    await Booking.deleteMany({ customerId: { $in: ids } });
    await Waitlist.deleteMany({ customerId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
  }
  if (createdClosedDates.length) {
    await ClosedDay.deleteMany({ date: { $in: createdClosedDates }, reason: /^QA15 / });
  }
  await mongoose.disconnect();
}

async function main() {
  const health = await api('/health');
  record(
    'Health reports MongoDB connected',
    health.status === 200 && health.data?.data?.database?.status === 'connected',
    health.data?.data?.database?.status
  );

  const adminLogin = await login('admin@iturrieta.eus', 'Admin12345!');
  const staffLogin = await login('staff@iturrieta.eus', 'Staff12345!');
  record('Admin login', adminLogin.status === 200 && adminLogin.data?.data?.token, String(adminLogin.status));
  record('Staff login', staffLogin.status === 200 && staffLogin.data?.data?.token, String(staffLogin.status));
  record(
    'Login payload has no password',
    adminLogin.data?.data?.user && !('password' in adminLogin.data.data.user),
    ''
  );
  if (!adminLogin.data?.data?.token || !staffLogin.data?.data?.token) {
    throw new Error('Seeded admin or staff login failed. Run npm run seed:data first.');
  }

  const adminToken = adminLogin.data.data.token;
  const staffToken = staffLogin.data.data.token;
  restoreToken = adminToken;

  const schedules = await api('/schedules');
  scheduleSnapshots = schedules.data?.data?.schedules || [];
  const tablesResponse = await api('/tables');
  tableSnapshots = (tablesResponse.data?.data?.tables || []).map((table) => ({
    id: table.id,
    status: table.status,
    notes: table.notes || '',
    position: table.position,
  }));

  const customer = await register(`qa15-${stamp}@example.com`, 'QA15 Customer');
  const other = await register(`qa15b-${stamp}@example.com`, 'QA15 Other');
  record('Customer register', customer.status === 201, String(customer.status));
  const customerToken = customer.data?.data?.token;
  const otherToken = other.data?.data?.token;
  const customerId = customer.data?.data?.user?.id;

  const me = await api('/auth/me', { token: customerToken });
  record('GET /auth/me', me.status === 200 && me.data?.data?.user?.email === `qa15-${stamp}@example.com`, String(me.status));

  const relogin = await login(`qa15-${stamp}@example.com`, password);
  record('Customer login', relogin.status === 200, String(relogin.status));

  const tables = tablesResponse.data?.data?.tables || [];
  record('Browse tables', tables.length >= 4, `${tables.length} tables`);
  const open = await findOpenDate(1);
  record('Open service date found', Boolean(open), open?.date || 'none');
  if (!open || !customerToken) throw new Error('Cannot continue booking flow');

  const service = open.schedule.services[0];
  const time = service.startTime;
  const guests = 2;
  const availability = await api(`/availability?date=${open.date}&time=${time}&guests=${guests}`);
  const available = availability.data?.data?.availability;
  record(
    'Availability',
    availability.status === 200 && available?.available === true && available.service?.name,
    available?.reason || available?.service?.name
  );
  const recommendation = await api(
    `/tables/recommendation?date=${open.date}&time=${time}&guests=${guests}&location=WINDOW`
  );
  const ranked = recommendation.data?.data?.recommendation;
  record(
    'Recommendations include rank and score',
    recommendation.status === 200 && ranked?.recommendations?.[0]?.rank === 1 && typeof ranked.recommendations[0].score === 'number',
    ''
  );

  const suitable = available?.tables || [];
  record('Enough free tables', suitable.length >= 8, String(suitable.length));
  if (suitable.length < 8) throw new Error('Not enough free tables for the QA matrix');

  const staffSocket = await connectSocket(staffToken);
  const customerSocket = await connectSocket(customerToken);
  record('Socket.io staff and customer connect', staffSocket.connected && customerSocket.connected, '');

  const createdEvent = once(staffSocket, 'booking:created');
  const notifyEvent = once(customerSocket, 'notification:new');
  const single = await api('/bookings', {
    method: 'POST',
    token: customerToken,
    body: { date: open.date, startTime: time, guests, tableId: suitable[0].id, notes: `QA15 ${stamp}` },
  });
  const booking = single.data?.data?.booking;
  if (booking?.bookingReference) createdBookingRefs.push(booking.bookingReference);
  record('Create one-table booking', single.status === 201 && booking?.bookingReference?.startsWith('TX-'), booking?.bookingReference);
  record(
    'Backend supplies endTime and serviceName',
    Boolean(booking?.endTime && booking?.serviceName) && booking.endTime !== time,
    `${booking?.serviceName || ''} ${booking?.endTime || ''}`
  );
  record('tableIds has the selected table', Array.isArray(booking?.tableIds) && booking.tableIds.length === 1, '');
  const createdPayload = await createdEvent;
  const notifyPayload = await notifyEvent;
  record('Socket booking:created', Boolean(createdPayload?.bookingReference), createdPayload?.bookingReference || 'missing');
  record('Socket notification:new', Boolean(notifyPayload?.type), notifyPayload?.type || 'missing');

  const listed = await api(`/bookings?date=${open.date}&status=CONFIRMED`, { token: customerToken });
  record(
    'Customer booking list',
    (listed.data?.data?.bookings || []).some((item) => item.bookingReference === booking.bookingReference),
    String(listed.status)
  );
  const detail = await api(`/bookings/${booking.bookingReference}`, { token: customerToken });
  record('Booking detail', detail.status === 200 && detail.data?.data?.booking?.serviceName === booking.serviceName, String(detail.status));

  const later = available.endTime;
  const rescheduled = await api(`/bookings/${booking.bookingReference}/reschedule`, {
    method: 'PATCH',
    token: customerToken,
    body: { date: open.date, startTime: later, tableId: suitable[0].id },
  });
  if (rescheduled.data?.data?.booking?.bookingReference) {
    record(
      'Reschedule keeps reference and new endTime',
      rescheduled.status === 200 && rescheduled.data.data.booking.bookingReference === booking.bookingReference && rescheduled.data.data.booking.endTime,
      rescheduled.data.data.booking.endTime
    );
  } else {
    record('Reschedule keeps reference and new endTime', false, `${rescheduled.status} ${rescheduled.data?.code || ''}`);
  }
  const cancelled = await api(`/bookings/${booking.bookingReference}/cancel`, {
    method: 'PATCH',
    token: customerToken,
    body: { reason: 'QA15 cancel' },
  });
  record('Customer cancel', cancelled.status === 200 && cancelled.data?.data?.booking?.status === 'CANCELLED', String(cancelled.status));

  const pair = await api('/bookings', {
    method: 'POST',
    token: customerToken,
    body: { date: open.date, startTime: time, guests, tableIds: [suitable[1].id, suitable[2].id], notes: `QA15 ${stamp}` },
  });
  const pairBooking = pair.data?.data?.booking;
  if (pairBooking?.bookingReference) createdBookingRefs.push(pairBooking.bookingReference);
  record(
    'Two-table booking',
    pair.status === 201 && pairBooking?.tableIds?.length === 2 && pairBooking?.tables?.length === 2 && pairBooking.table?.id === pairBooking.tableIds[0],
    pair.data?.code || ''
  );

  const trio = await api('/bookings', {
    method: 'POST',
    token: customerToken,
    body: {
      date: open.date,
      startTime: time,
      guests,
      tableIds: [suitable[3].id, suitable[4].id, suitable[5].id],
      notes: `QA15 ${stamp}`,
    },
  });
  const trioBooking = trio.data?.data?.booking;
  if (trioBooking?.bookingReference) createdBookingRefs.push(trioBooking.bookingReference);
  record(
    'Three-table booking',
    trio.status === 201 && trioBooking?.tableIds?.length === 3 && trioBooking?.tables?.length === 3,
    trio.data?.code || ''
  );

  const four = await api('/bookings', {
    method: 'POST',
    token: customerToken,
    body: {
      date: open.date,
      startTime: time,
      guests,
      tableIds: suitable.slice(0, 4).map((table) => table.id),
      notes: `QA15 ${stamp}`,
    },
  });
  record('Four tables rejected', four.status === 400 && four.data?.code === 'TOO_MANY_TABLES', four.data?.code || String(four.status));

  const conflictA = await api('/bookings', {
    method: 'POST',
    token: customerToken,
    body: { date: open.date, startTime: time, guests, tableId: suitable[6].id, notes: `QA15 ${stamp}` },
  });
  if (conflictA.data?.data?.booking?.bookingReference) createdBookingRefs.push(conflictA.data.data.booking.bookingReference);
  const before = await api('/bookings', { token: otherToken });
  const beforeCount = (before.data?.data?.bookings || []).length;
  const conflictB = await api('/bookings', {
    method: 'POST',
    token: otherToken,
    body: { date: open.date, startTime: time, guests, tableId: suitable[6].id, notes: `QA15 ${stamp}` },
  });
  const after = await api('/bookings', { token: otherToken });
  record('Booking conflict 409', conflictB.status === 409 && conflictB.data?.code === 'BOOKING_CONFLICT', conflictB.data?.code || String(conflictB.status));
  record('Conflict does not create booking B', (after.data?.data?.bookings || []).length === beforeCount, '');
  const refreshed = await api(`/availability?date=${open.date}&time=${time}&guests=${guests}`);
  const stillListed = (refreshed.data?.data?.availability?.tables || []).some((table) => table.id === suitable[6].id);
  record('Availability drops the conflicting table', refreshed.status === 200 && !stillListed, '');

  const lifecycle = await api('/bookings', {
    method: 'POST',
    token: customerToken,
    body: { date: open.date, startTime: time, guests, tableId: suitable[7].id, notes: `QA15 ${stamp}` },
  });
  const life = lifecycle.data?.data?.booking;
  if (life?.bookingReference) createdBookingRefs.push(life.bookingReference);
  const arrivedEvent = once(staffSocket, 'booking:arrived');
  const arrived = await api(`/bookings/${life.bookingReference}/arrive`, { method: 'PATCH', token: staffToken });
  const seatedEvent = once(staffSocket, 'booking:seated');
  const seated = await api(`/bookings/${life.bookingReference}/seat`, { method: 'PATCH', token: staffToken });
  const completedEvent = once(staffSocket, 'booking:completed');
  const completed = await api(`/bookings/${life.bookingReference}/complete`, { method: 'PATCH', token: staffToken });
  record('Staff arrive, seat, complete', arrived.status === 200 && seated.status === 200 && completed.data?.data?.booking?.status === 'COMPLETED', completed.data?.data?.booking?.status);
  record('Socket booking:arrived', Boolean((await arrivedEvent)?.bookingReference), '');
  record('Socket booking:seated', Boolean((await seatedEvent)?.bookingReference), '');
  record('Socket booking:completed', Boolean((await completedEvent)?.bookingReference), '');

  const noShowBooking = await api('/bookings', {
    method: 'POST',
    token: staffToken,
    body: { date: open.date, startTime: later, guests, tableId: suitable[7].id, customerId, source: 'STAFF', notes: `QA15 ${stamp}` },
  });
  const noShow = noShowBooking.data?.data?.booking;
  if (noShow?.bookingReference) createdBookingRefs.push(noShow.bookingReference);
  const noShowEvent = once(staffSocket, 'booking:no_show');
  const noShowResult = await api(`/bookings/${noShow?.bookingReference}/no-show`, { method: 'PATCH', token: staffToken });
  record('Staff no-show', noShowResult.status === 200 && noShowResult.data?.data?.booking?.status === 'NO_SHOW', noShowResult.data?.code || '');
  record('Socket booking:no_show', Boolean((await noShowEvent)?.bookingReference), '');

  const cancelTarget = await api('/bookings', {
    method: 'POST',
    token: staffToken,
    body: { date: open.date, startTime: later, guests, tableId: suitable[1].id, customerId, source: 'PHONE', notes: `QA15 ${stamp}` },
  });
  const cancelRef = cancelTarget.data?.data?.booking?.bookingReference;
  if (cancelRef) createdBookingRefs.push(cancelRef);
  const cancelEvent = cancelRef ? once(staffSocket, 'booking:cancelled') : null;
  const staffCancel = cancelRef
    ? await api(`/bookings/${cancelRef}/cancel`, {
      method: 'PATCH',
      token: staffToken,
      body: { reason: 'QA15 staff cancel' },
    })
    : cancelTarget;
  record('Staff cancel', staffCancel.status === 200, staffCancel.data?.code || String(staffCancel.status));
  record('Socket booking:cancelled', Boolean(cancelEvent && (await cancelEvent)?.bookingReference), '');

  const moveTarget = await api('/bookings', {
    method: 'POST',
    token: staffToken,
    body: { date: open.date, startTime: time, guests, tableId: suitable[8].id, customerId, source: 'WHATSAPP', notes: `QA15 ${stamp}` },
  });
  const moveRef = moveTarget.data?.data?.booking?.bookingReference;
  if (moveRef) createdBookingRefs.push(moveRef);
  const updateEvent = moveRef ? once(staffSocket, 'booking:updated') : null;
  const staffMove = moveRef
    ? await api(`/bookings/${moveRef}/reschedule`, {
      method: 'PATCH',
      token: staffToken,
      body: { date: open.date, startTime: later, tableId: suitable[1].id },
    })
    : moveTarget;
  record(
    'Staff reschedule',
    staffMove.status === 200,
    staffMove.data?.code || staffMove.data?.message || String(staffMove.status)
  );
  record('Socket booking:updated', Boolean((await updateEvent)?.bookingReference), '');

  const filtered = await api(`/bookings?date=${open.date}&status=COMPLETED&source=WEBSITE&tableId=${suitable[7].id}`, {
    token: staffToken,
  });
  record(
    'Staff booking filters',
    filtered.status === 200 && (filtered.data?.data?.bookings || []).every((item) => item.status === 'COMPLETED'),
    String((filtered.data?.data?.bookings || []).length)
  );
  const staffDetail = await api(`/bookings/${life.bookingReference}`, { token: staffToken });
  record('Staff booking detail', staffDetail.status === 200, String(staffDetail.status));

  const floor = await api('/tables/floor/live', { token: staffToken });
  record(
    'Live floor uses operationalState',
    floor.status === 200 && Array.isArray(floor.data?.data?.tables) && floor.data.data.tables.every((table) => table.operationalState),
    floor.data?.data?.currentTime
  );
  const customerFloor = await api('/tables/floor/live', { token: customerToken });
  record('Customer cannot read live floor', customerFloor.status === 403, String(customerFloor.status));

  const waitEvent = once(staffSocket, 'waitlist:created');
  const waitlist = await api('/waitlist', {
    method: 'POST',
    token: customerToken,
    body: { date: open.date, requestedStartTime: time, guests: 10, notes: `QA15 ${stamp}` },
  });
  const waiting = waitlist.data?.data?.waitlist;
  if (waiting?.waitlistReference) createdWaitlistRefs.push(waiting.waitlistReference);
  record('Waitlist WAITING', waitlist.status === 201 && waiting?.status === 'WAITING', waiting?.status || waitlist.data?.code);
  record('Socket waitlist:created', Boolean((await waitEvent)?.waitlistReference), '');
  const notified = await api(`/waitlist/${waiting.waitlistReference}/notify`, { method: 'PATCH', token: staffToken });
  record('Waitlist NOTIFIED', notified.data?.data?.waitlist?.status === 'NOTIFIED', notified.data?.code || '');
  const converted = await api(`/waitlist/${waiting.waitlistReference}/convert`, { method: 'PATCH', token: staffToken });
  record('Waitlist CONVERTED', converted.data?.data?.waitlist?.status === 'CONVERTED', converted.data?.code || '');
  const badConvert = await api(`/waitlist/${waiting.waitlistReference}/expire`, { method: 'PATCH', token: staffToken });
  record('Invalid waitlist transition', badConvert.status === 409 && badConvert.data?.code === 'INVALID_WAITLIST_STATE', badConvert.data?.code || '');

  const toCancel = await api('/waitlist', {
    method: 'POST',
    token: customerToken,
    body: { date: open.date, requestedStartTime: later, guests: 10, notes: `QA15 ${stamp}` },
  });
  const cancelWait = toCancel.data?.data?.waitlist;
  if (cancelWait?.waitlistReference) createdWaitlistRefs.push(cancelWait.waitlistReference);
  const waitCancelEvent = once(staffSocket, 'waitlist:cancelled');
  const waitCancelled = await api(`/waitlist/${cancelWait.waitlistReference}/cancel`, { method: 'PATCH', token: customerToken });
  record('Waitlist CANCELLED', waitCancelled.data?.data?.waitlist?.status === 'CANCELLED', waitCancelled.data?.code || '');
  record('Socket waitlist:cancelled', Boolean((await waitCancelEvent)?.waitlistReference), '');

  const toExpire = await api('/waitlist', {
    method: 'POST',
    token: staffToken,
    body: { date: open.date, requestedStartTime: time, guests: 11, customerId, source: 'STAFF', notes: `QA15 ${stamp}` },
  });
  const expireEntry = toExpire.data?.data?.waitlist;
  if (expireEntry?.waitlistReference) createdWaitlistRefs.push(expireEntry.waitlistReference);
  const waitUpdateEvent = once(staffSocket, 'waitlist:updated');
  const expired = await api(`/waitlist/${expireEntry?.waitlistReference}/expire`, { method: 'PATCH', token: staffToken });
  record('Waitlist EXPIRED', expired.data?.data?.waitlist?.status === 'EXPIRED', expired.data?.code || toExpire.data?.code || '');
  record('Socket waitlist:updated', Boolean((await waitUpdateEvent)?.waitlistReference), '');

  const notesTable = suitable[0];
  const tableEvent = once(staffSocket, 'table:updated');
  const notes = await api(`/tables/${notesTable.id}`, {
    method: 'PATCH',
    token: staffToken,
    body: { notes: `QA15 ${stamp}` },
  });
  const position = await api(`/tables/${notesTable.id}/position`, {
    method: 'PATCH',
    token: staffToken,
    body: {
      x: notesTable.position.x + 1,
      y: notesTable.position.y,
      rotation: notesTable.position.rotation,
    },
  });
  const status = await api(`/tables/${notesTable.id}/status`, {
    method: 'PATCH',
    token: staffToken,
    body: { status: 'CLEANING' },
  });
  record('Staff notes, position, status', notes.status === 200 && position.status === 200 && status.data?.data?.table?.status === 'CLEANING', '');
  const tablePayload = await tableEvent;
  record('Socket table:updated', Boolean(tablePayload?.id || tablePayload?.tableId), tablePayload?.id || '');
  const cleaningFloor = await api('/tables/floor/live', { token: staffToken });
  const cleaningRow = (cleaningFloor.data?.data?.tables || []).find((table) => table.id === notesTable.id);
  record('CLEANING operationalState comes from backend', cleaningRow?.operationalState === 'CLEANING', cleaningRow?.operationalState || '');
  await api(`/tables/${notesTable.id}/status`, {
    method: 'PATCH',
    token: staffToken,
    body: { status: 'OUT_OF_SERVICE' },
  });
  const outFloor = await api('/tables/floor/live', { token: staffToken });
  const outRow = (outFloor.data?.data?.tables || []).find((table) => table.id === notesTable.id);
  record('OUT_OF_SERVICE operationalState comes from backend', outRow?.operationalState === 'OUT_OF_SERVICE', outRow?.operationalState || '');

  const notifications = await api('/notifications', { token: customerToken });
  const items = notifications.data?.data?.notifications || [];
  record('Notification list', notifications.status === 200 && items.length > 0, String(items.length));
  const types = new Set(items.map((item) => item.type));
  record(
    'Booking lifecycle notifications',
    ['BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'BOOKING_ARRIVED', 'BOOKING_SEATED', 'BOOKING_COMPLETED', 'BOOKING_NO_SHOW'].every((type) => types.has(type)),
    [...types].join(', ')
  );
  const unread = items.find((item) => item.status === 'UNREAD') || items[0];
  const marked = await api(`/notifications/${unread.id}/read`, { method: 'PATCH', token: customerToken });
  record('Mark one notification read', marked.data?.data?.notification?.status === 'READ', marked.data?.code || '');
  const markedAll = await api('/notifications/read-all', { method: 'PATCH', token: customerToken });
  const unreadLeft = await api('/notifications?status=UNREAD', { token: customerToken });
  record(
    'Mark all notifications read',
    markedAll.status === 200 && (unreadLeft.data?.data?.notifications || []).length === 0,
    String(markedAll.data?.data?.updatedCount)
  );
  const stolen = await api(`/notifications/${unread.id}`, { token: otherToken });
  record('Other customer cannot read the notification', stolen.status === 404, String(stolen.status));

  const hidden = await api(`/bookings/${conflictA.data.data.booking.bookingReference}`, { token: otherToken });
  record('Other customer cannot read the booking', hidden.status === 404, String(hidden.status));

  const missing = await api('/bookings');
  record('Missing token is 401', missing.status === 401, missing.data?.code || '');
  const garbage = await api('/auth/me', { token: 'not-a-token' });
  record('Invalid token is 401', garbage.status === 401, garbage.data?.code || '');
  const customerAdmin = await api('/admin/dashboard', { token: customerToken });
  const staffAdmin = await api('/admin/dashboard', { token: staffToken });
  const staffJobs = await api('/admin/jobs/status', { token: staffToken });
  record('Customer admin route is 403', customerAdmin.status === 403, String(customerAdmin.status));
  record('Staff admin overview is 403', staffAdmin.status === 403, String(staffAdmin.status));
  record('Staff job status is 403', staffJobs.status === 403, String(staffJobs.status));

  const overview = await api('/admin/dashboard', { token: adminToken });
  const analytics = await api(`/admin/dashboard/bookings?date=${open.date}`, { token: adminToken });
  const hourly = await api(`/admin/dashboard/hourly?date=${open.date}`, { token: adminToken });
  const services = await api(`/admin/dashboard/services?date=${open.date}`, { token: adminToken });
  const tableAnalytics = await api(`/admin/dashboard/tables?date=${open.date}`, { token: adminToken });
  const waitAnalytics = await api(`/admin/dashboard/waitlist?date=${open.date}`, { token: adminToken });
  const live = await api('/admin/dashboard/live', { token: adminToken });
  const activity = await api('/admin/dashboard/activity', { token: adminToken });
  const jobs = await api('/admin/jobs/status', { token: adminToken });
  record('Admin dashboard overview', overview.status === 200 && overview.data?.data?.bookings, String(overview.status));
  record('Admin booking analytics', analytics.status === 200, String(analytics.status));
  record('Admin hourly, services, tables, waitlist', [hourly, services, tableAnalytics, waitAnalytics].every((item) => item.status === 200), '');
  record(
    'Admin live summary uses operationalState',
    live.status === 200 && (live.data?.data?.tables || []).every((table) => table.operationalState),
    live.data?.data?.summary ? 'summary' : ''
  );
  record('Admin activity', activity.status === 200 && Array.isArray(activity.data?.data?.events), String(activity.status));
  record(
    'Scheduler status loaded',
    jobs.status === 200 && typeof jobs.data?.data?.jobsEnabled === 'boolean' && jobs.data.data.jobs?.length === 3,
    `enabled=${jobs.data?.data?.jobsEnabled}`
  );
  const staffLiveSummary = await api('/admin/dashboard/live', { token: staffToken });
  record('Staff can read live summary', staffLiveSummary.status === 200, String(staffLiveSummary.status));

  const friday = scheduleSnapshots.find((day) => day.dayOfWeek === 'FRIDAY');
  const overlap = await api('/schedules/FRIDAY', {
    method: 'PUT',
    token: adminToken,
    body: {
      isOpen: true,
      services: [
        { name: 'LUNCH', startTime: '13:00', endTime: '16:00', lastBookingTime: '14:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
        { name: 'TEA', startTime: '15:00', endTime: '17:00', lastBookingTime: '16:00', bookingDurationMinutes: 60, maxGuestsPerBooking: 8 },
      ],
    },
  });
  const fridayAfterReject = await api('/schedules/FRIDAY');
  record('Overlapping services rejected', overlap.status === 400, overlap.data?.code || '');
  record(
    'Rejected schedule is not stored',
    JSON.stringify(fridayAfterReject.data?.data?.schedule?.services || []) === JSON.stringify(friday?.services || []),
    ''
  );

  const multi = await api('/schedules/FRIDAY', {
    method: 'PUT',
    token: adminToken,
    body: {
      isOpen: true,
      services: [
        { name: 'BRUNCH', startTime: '10:00', endTime: '12:00', lastBookingTime: '11:00', bookingDurationMinutes: 60, maxGuestsPerBooking: 8 },
        ...(friday?.services || []),
      ],
    },
  });
  const fridayUpdated = await api('/schedules/FRIDAY');
  record(
    'Multiple services saved',
    multi.status === 200 && (fridayUpdated.data?.data?.schedule?.services || []).some((service) => service.name === 'BRUNCH'),
    String(multi.status)
  );
  await api('/schedules/FRIDAY', {
    method: 'PUT',
    token: adminToken,
    body: { isOpen: Boolean(friday?.isOpen), services: friday?.services || [] },
  });
  const fridayRestored = await api('/schedules/FRIDAY');
  record(
    'Weekly schedule restored',
    JSON.stringify(fridayRestored.data?.data?.schedule?.services || []) === JSON.stringify(friday?.services || []),
    ''
  );

  const closedDate = await findOpenDate(8);
  if (closedDate && closedDate.date !== open.date) {
    createdClosedDates.push(closedDate.date);
    const createdClosed = await api('/closed-days', {
      method: 'POST',
      token: adminToken,
      body: { date: closedDate.date, reason: `QA15 ${stamp}` },
    });
    const closedAvailability = await api(`/availability?date=${closedDate.date}&time=${closedDate.schedule.services[0].startTime}&guests=2`);
    const closedWait = await api('/waitlist', {
      method: 'POST',
      token: customerToken,
      body: {
        date: closedDate.date,
        requestedStartTime: closedDate.schedule.services[0].startTime,
        guests: 2,
        notes: `QA15 ${stamp}`,
      },
    });
    const closedBook = await api('/bookings', {
      method: 'POST',
      token: customerToken,
      body: {
        date: closedDate.date,
        startTime: closedDate.schedule.services[0].startTime,
        guests: 2,
        tableId: suitable[0].id,
        notes: `QA15 ${stamp}`,
      },
    });
    record('Closed day blocks availability', closedAvailability.data?.data?.availability?.reason === 'RESTAURANT_CLOSED', closedAvailability.data?.data?.availability?.reason);
    record('Closed day blocks booking and waitlist', closedBook.status >= 400 && closedWait.status >= 400, `${closedBook.status}/${closedWait.status}`);
    const closedId = createdClosed.data?.data?.closedDay?.id;
    const deactivated = await api(`/closed-days/${closedId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { isActive: false },
    });
    const reopened = await api(`/availability?date=${closedDate.date}&time=${closedDate.schedule.services[0].startTime}&guests=2`);
    record('Deactivated closed day follows the weekly schedule', deactivated.status === 200 && reopened.data?.data?.availability?.available === true, reopened.data?.data?.availability?.reason || '');
  } else {
    record('Closed day blocks availability', false, 'no separate open date');
  }

  const freshFloor = await api('/tables/floor/live', { token: staffToken });
  const clock = freshFloor.data?.data?.currentTime;
  const businessDate = freshFloor.data?.data?.date;
  if (clock && businessDate) {
    const now = minutes(clock);
    const start = fromMinutes(Math.max(0, now - (now % 15)));
    const upcoming = fromMinutes(Math.min(23 * 60, now + 120));
    const dayName = new Date(`${businessDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const originalDay = scheduleSnapshots.find((day) => day.dayOfWeek === dayName);
    const opened = await api(`/schedules/${dayName}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        isOpen: true,
        services: [{
          name: 'SERVICE',
          startTime: '00:00',
          endTime: '23:59',
          lastBookingTime: '22:00',
          bookingDurationMinutes: 60,
          maxGuestsPerBooking: 12,
        }],
      },
    });
    record('Temporary service window for live states', opened.status === 200, dayName);
    const upcomingBooking = await api('/bookings', {
      method: 'POST',
      token: customerToken,
      body: { date: businessDate, startTime: upcoming, guests: 2, tableId: suitable[3].id, notes: `QA15 ${stamp}` },
    });
    const currentBooking = await api('/bookings', {
      method: 'POST',
      token: customerToken,
      body: { date: businessDate, startTime: start, guests: 2, tableId: suitable[4].id, notes: `QA15 ${stamp}` },
    });
    if (upcomingBooking.data?.data?.booking?.bookingReference) createdBookingRefs.push(upcomingBooking.data.data.booking.bookingReference);
    if (currentBooking.data?.data?.booking?.bookingReference) createdBookingRefs.push(currentBooking.data.data.booking.bookingReference);
    let liveNow = await api('/tables/floor/live', { token: staffToken });
    const byId = new Map((liveNow.data?.data?.tables || []).map((table) => [table.id, table.operationalState]));
    record('Live UPCOMING', byId.get(suitable[3].id) === 'UPCOMING', byId.get(suitable[3].id) || upcomingBooking.data?.code || '');
    record('Live BOOKED', byId.get(suitable[4].id) === 'BOOKED', byId.get(suitable[4].id) || currentBooking.data?.code || '');
    if (currentBooking.data?.data?.booking?.bookingReference) {
      await api(`/bookings/${currentBooking.data.data.booking.bookingReference}/arrive`, { method: 'PATCH', token: staffToken });
      liveNow = await api('/tables/floor/live', { token: staffToken });
      record(
        'Live ARRIVED',
        (liveNow.data?.data?.tables || []).find((table) => table.id === suitable[4].id)?.operationalState === 'ARRIVED',
        ''
      );
      await api(`/bookings/${currentBooking.data.data.booking.bookingReference}/seat`, { method: 'PATCH', token: staffToken });
      liveNow = await api('/tables/floor/live', { token: staffToken });
      record(
        'Live SEATED',
        (liveNow.data?.data?.tables || []).find((table) => table.id === suitable[4].id)?.operationalState === 'SEATED',
        ''
      );
    }
    const untouched = (liveNow.data?.data?.tables || []).find((table) => table.operationalState === 'AVAILABLE');
    record('Live AVAILABLE still present', Boolean(untouched), untouched?.tableNumber || '');
    await api(`/schedules/${dayName}`, {
      method: 'PUT',
      token: adminToken,
      body: { isOpen: Boolean(originalDay?.isOpen), services: originalDay?.services || [] },
    });
  }

  staffSocket.close();
  customerSocket.close();

  const failed = results.filter((item) => !item.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(failed.map((item) => item.name).join('\n'));
  }
}

main()
  .catch((error) => {
    console.error('E2E aborted:', error);
    record('E2E completed', false, error.message);
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log('QA records cleaned');
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
    const failed = results.filter((item) => !item.pass).length;
    process.exit(failed ? 1 : 0);
  });
