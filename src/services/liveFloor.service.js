const Table = require('../models/Table');
const Booking = require('../models/Booking');
const { resolvedTableIds } = require('./bookingConflict.service');
const { TABLE_STATUS } = require('../constants/tables');
const { BOOKING_STATUS } = require('../constants/bookings');
const { OPERATIONAL_STATE, FLOOR_BOOKING_STATUSES } = require('../constants/floor');
const { formatServerLocalClock } = require('../utils/calendar');

const CURRENT_STATUS_ORDER = Object.freeze({
  [BOOKING_STATUS.SEATED]: 0,
  [BOOKING_STATUS.ARRIVED]: 1,
  [BOOKING_STATUS.CONFIRMED]: 2,
});

function presentBooking(booking) {
  return {
    bookingReference: booking.bookingReference,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guests: booking.guests,
    status: booking.status,
    tableCount: resolvedTableIds(booking).length,
  };
}

function compareCurrent(left, right) {
  const statusOrder = CURRENT_STATUS_ORDER[left.status] - CURRENT_STATUS_ORDER[right.status];

  if (statusOrder !== 0) {
    return statusOrder;
  }

  if (left.startTime !== right.startTime) {
    return left.startTime < right.startTime ? -1 : 1;
  }

  return left.bookingReference.localeCompare(right.bookingReference);
}

function compareUpcoming(left, right) {
  if (left.startTime !== right.startTime) {
    return left.startTime < right.startTime ? -1 : 1;
  }

  return left.bookingReference.localeCompare(right.bookingReference);
}

function resolveOperationalState(tableStatus, currentBooking, nextBooking) {
  if (tableStatus === TABLE_STATUS.OUT_OF_SERVICE) {
    return OPERATIONAL_STATE.OUT_OF_SERVICE;
  }

  if (tableStatus === TABLE_STATUS.CLEANING) {
    return OPERATIONAL_STATE.CLEANING;
  }

  if (currentBooking && currentBooking.status === BOOKING_STATUS.SEATED) {
    return OPERATIONAL_STATE.SEATED;
  }

  if (currentBooking && currentBooking.status === BOOKING_STATUS.ARRIVED) {
    return OPERATIONAL_STATE.ARRIVED;
  }

  if (currentBooking && currentBooking.status === BOOKING_STATUS.CONFIRMED) {
    return OPERATIONAL_STATE.BOOKED;
  }

  if (nextBooking) {
    return OPERATIONAL_STATE.UPCOMING;
  }

  return OPERATIONAL_STATE.AVAILABLE;
}

function presentTable(table, rows, currentTime) {
  const plain = table.toObject();
  const current = rows
    .filter((booking) => booking.startTime <= currentTime && booking.endTime > currentTime)
    .sort(compareCurrent)[0] || null;
  const next = rows
    .filter((booking) => booking.startTime > currentTime)
    .sort(compareUpcoming)[0] || null;

  return {
    id: plain.id,
    tableNumber: plain.tableNumber,
    name: plain.name,
    capacity: plain.capacity,
    tableStatus: plain.status,
    operationalState: resolveOperationalState(plain.status, current, next),
    shape: plain.shape,
    location: plain.location,
    tags: plain.tags,
    position: {
      x: plain.position.x,
      y: plain.position.y,
      rotation: plain.position.rotation,
    },
    currentBooking: current ? presentBooking(current) : null,
    nextBooking: next ? presentBooking(next) : null,
  };
}

async function getLiveFloor({ at } = {}) {
  const clock = formatServerLocalClock(at);
  const tables = await Table.find({ isActive: true }).sort({ tableNumber: 1 });
  const floorTableIds = tables.map((table) => table._id);
  const bookings = await Booking.find({
    date: clock.date,
    status: { $in: FLOOR_BOOKING_STATUSES },
    $or: [
      { tableId: { $in: floorTableIds } },
      { tableIds: { $in: floorTableIds } },
    ],
  }).select('bookingReference tableId tableIds startTime endTime guests status');

  const bookingsByTable = new Map();
  bookings.forEach((booking) => {
    resolvedTableIds(booking).forEach((tableId) => {
      const key = String(tableId);
      const group = bookingsByTable.get(key) || [];
      group.push(booking);
      bookingsByTable.set(key, group);
    });
  });

  return {
    date: clock.date,
    currentTime: clock.currentTime,
    tables: tables.map((table) => presentTable(
      table,
      bookingsByTable.get(String(table._id)) || [],
      clock.currentTime
    )),
  };
}

module.exports = {
  getLiveFloor,
};
