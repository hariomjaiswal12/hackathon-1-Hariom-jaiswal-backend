const Booking = require('../models/Booking');
const { ACTIVE_BOOKING_STATUSES } = require('../constants/bookings');

function resolvedTableIds(booking) {
  if (Array.isArray(booking.tableIds) && booking.tableIds.length > 0) {
    return booking.tableIds;
  }

  if (booking.tableId) {
    return [booking.tableId];
  }

  return [];
}

function overlapFilter({ date, startTime, endTime, tableId, tableIds, excludeBookingId }) {
  const filter = {
    date,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };
  const ids = tableIds || (tableId ? [tableId] : null);

  if (ids) {
    filter.$or = [
      { tableId: { $in: ids } },
      { tableIds: { $in: ids } },
    ];
  }

  if (excludeBookingId) {
    filter._id = { $ne: excludeBookingId };
  }

  return filter;
}

async function findConflictingBooking({ tableId, tableIds, date, startTime, endTime, excludeBookingId }) {
  return Booking.findOne(overlapFilter({
    tableId,
    tableIds,
    date,
    startTime,
    endTime,
    excludeBookingId,
  }));
}

async function findBlockedTableIds({ date, startTime, endTime }) {
  const rows = await Booking.find(overlapFilter({ date, startTime, endTime })).select('tableId tableIds');
  const blocked = new Set();

  rows.forEach((row) => {
    resolvedTableIds(row).forEach((id) => blocked.add(String(id)));
  });

  return blocked;
}

module.exports = {
  resolvedTableIds,
  findConflictingBooking,
  findBlockedTableIds,
};
