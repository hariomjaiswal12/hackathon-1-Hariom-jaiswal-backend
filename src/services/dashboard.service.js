const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Waitlist = require('../models/Waitlist');
const Table = require('../models/Table');
const { getLiveFloor } = require('./liveFloor.service');
const { BOOKING_STATUS, BOOKING_STATUSES, BOOKING_SOURCES } = require('../constants/bookings');
const { WAITLIST_STATUS, WAITLIST_STATUSES } = require('../constants/waitlist');
const { TABLE_STATUS } = require('../constants/tables');
const { OPERATIONAL_STATE } = require('../constants/floor');
const { formatServerLocalClock } = require('../utils/calendar');

const ACTIVITY_LIMIT = 50;

const BOOKING_OVERVIEW_KEYS = Object.freeze({
  [BOOKING_STATUS.CONFIRMED]: 'confirmed',
  [BOOKING_STATUS.ARRIVED]: 'arrived',
  [BOOKING_STATUS.SEATED]: 'seated',
  [BOOKING_STATUS.COMPLETED]: 'completed',
  [BOOKING_STATUS.CANCELLED]: 'cancelled',
  [BOOKING_STATUS.NO_SHOW]: 'noShow',
});

const GUEST_OVERVIEW_KEYS = Object.freeze({
  [BOOKING_STATUS.CONFIRMED]: 'confirmed',
  [BOOKING_STATUS.ARRIVED]: 'arrived',
  [BOOKING_STATUS.SEATED]: 'seated',
  [BOOKING_STATUS.COMPLETED]: 'completed',
});

const TABLE_OVERVIEW_KEYS = Object.freeze({
  [TABLE_STATUS.AVAILABLE]: 'available',
  [TABLE_STATUS.RESERVED]: 'reserved',
  [TABLE_STATUS.OCCUPIED]: 'occupied',
  [TABLE_STATUS.CLEANING]: 'cleaning',
  [TABLE_STATUS.OUT_OF_SERVICE]: 'outOfService',
});

const LIVE_SUMMARY_KEYS = Object.freeze({
  [OPERATIONAL_STATE.AVAILABLE]: 'available',
  [OPERATIONAL_STATE.UPCOMING]: 'upcoming',
  [OPERATIONAL_STATE.BOOKED]: 'booked',
  [OPERATIONAL_STATE.ARRIVED]: 'arrived',
  [OPERATIONAL_STATE.SEATED]: 'seated',
  [OPERATIONAL_STATE.CLEANING]: 'cleaning',
  [OPERATIONAL_STATE.OUT_OF_SERVICE]: 'outOfService',
});

function average(total, count) {
  if (!count) {
    return 0;
  }

  return Math.round((total / count) * 100) / 100;
}

function ratio(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Math.round((numerator / denominator) * 10000) / 10000;
}

function fillCounts(keys, rows) {
  const counts = {};

  keys.forEach((key) => {
    counts[key] = 0;
  });

  rows.forEach((row) => {
    if (row._id) {
      counts[row._id] = row.count;
    }
  });

  return counts;
}

function countByKey(rows, keyMap) {
  const counts = {};

  Object.values(keyMap).forEach((key) => {
    counts[key] = 0;
  });

  rows.forEach((row) => {
    const key = keyMap[row._id];

    if (key) {
      counts[key] = row.count;
    }
  });

  return counts;
}

function resolvedTablesExpression() {
  return {
    $setUnion: [
      {
        $cond: [
          { $gt: [{ $size: { $ifNull: ['$tableIds', []] } }, 0] },
          '$tableIds',
          {
            $cond: [
              { $ne: [{ $ifNull: ['$tableId', null] }, null] },
              ['$tableId'],
              [],
            ],
          },
        ],
      },
      [],
    ],
  };
}

function minutesExpression(fieldName) {
  return {
    $add: [
      {
        $multiply: [
          { $toInt: { $substrCP: [`$${fieldName}`, 0, 2] } },
          60,
        ],
      },
      { $toInt: { $substrCP: [`$${fieldName}`, 3, 2] } },
    ],
  };
}

function bookingMatch({ date, status, source, tableId }) {
  const match = { date };

  if (status) {
    match.status = status;
  }

  if (source) {
    match.source = source;
  }

  if (tableId) {
    const id = new mongoose.Types.ObjectId(tableId);
    match.$or = [{ tableId: id }, { tableIds: id }];
  }

  return match;
}

function resolveOverviewDate(date) {
  return date || formatServerLocalClock().date;
}

async function getOverview(date) {
  const businessDate = resolveOverviewDate(date);
  const [bookingRows, tableRows, waitlistRows] = await Promise.all([
    Booking.aggregate([
      { $match: { date: businessDate } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          guests: { $sum: '$guests' },
        },
      },
    ]),
    Table.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
    Waitlist.aggregate([
      { $match: { date: businessDate } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const bookingCounts = countByKey(bookingRows, BOOKING_OVERVIEW_KEYS);
  const guestCounts = countByKey(
    bookingRows.map((row) => ({ _id: row._id, count: row.guests })),
    GUEST_OVERVIEW_KEYS
  );
  const tableCounts = countByKey(tableRows, TABLE_OVERVIEW_KEYS);
  const waitlistCounts = countByKey(
    waitlistRows,
    {
      [WAITLIST_STATUS.WAITING]: 'waiting',
      [WAITLIST_STATUS.NOTIFIED]: 'notified',
      [WAITLIST_STATUS.CONVERTED]: 'converted',
      [WAITLIST_STATUS.CANCELLED]: 'cancelled',
      [WAITLIST_STATUS.EXPIRED]: 'expired',
    }
  );

  return {
    date: businessDate,
    bookings: {
      total: bookingRows.reduce((sum, row) => sum + row.count, 0),
      confirmed: bookingCounts.confirmed,
      arrived: bookingCounts.arrived,
      seated: bookingCounts.seated,
      completed: bookingCounts.completed,
      cancelled: bookingCounts.cancelled,
      noShow: bookingCounts.noShow,
    },
    guests: {
      total: bookingRows.reduce((sum, row) => sum + row.guests, 0),
      confirmed: guestCounts.confirmed,
      arrived: guestCounts.arrived,
      seated: guestCounts.seated,
      completed: guestCounts.completed,
    },
    tables: {
      total: tableRows.reduce((sum, row) => sum + row.count, 0),
      available: tableCounts.available,
      reserved: tableCounts.reserved,
      occupied: tableCounts.occupied,
      cleaning: tableCounts.cleaning,
      outOfService: tableCounts.outOfService,
    },
    waitlist: waitlistCounts,
  };
}

async function getBookingAnalytics({ date, status, source, tableId }) {
  const [result] = await Booking.aggregate([
    { $match: bookingMatch({ date, status, source, tableId }) },
    { $addFields: { resolvedTables: resolvedTablesExpression() } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalGuests: { $sum: '$guests' },
              groupBookingCount: {
                $sum: {
                  $cond: [{ $gt: [{ $size: '$resolvedTables' }, 1] }, 1, 0],
                },
              },
            },
          },
        ],
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
        bySource: [
          { $group: { _id: '$source', count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const facets = result || { totals: [], byStatus: [], bySource: [] };
  const totals = facets.totals[0] || { total: 0, totalGuests: 0, groupBookingCount: 0 };

  return {
    date,
    total: totals.total,
    byStatus: fillCounts(BOOKING_STATUSES, facets.byStatus),
    bySource: fillCounts(BOOKING_SOURCES, facets.bySource),
    totalGuests: totals.totalGuests,
    averageGuestsPerBooking: average(totals.totalGuests, totals.total),
    groupBookingCount: totals.groupBookingCount,
    singleTableBookingCount: totals.total - totals.groupBookingCount,
  };
}

async function getHourlyDistribution(date) {
  const rows = await Booking.aggregate([
    { $match: { date } },
    {
      $group: {
        _id: { $substrCP: ['$startTime', 0, 2] },
        bookings: { $sum: 1 },
        guests: { $sum: '$guests' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    date,
    hours: rows.map((row) => ({
      time: `${row._id}:00`,
      bookings: row.bookings,
      guests: row.guests,
    })),
  };
}

async function getServiceAnalytics(date) {
  const rows = await Booking.aggregate([
    { $match: { date } },
    {
      $group: {
        _id: '$serviceName',
        bookings: { $sum: 1 },
        guests: { $sum: '$guests' },
        cancelled: {
          $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.CANCELLED] }, 1, 0] },
        },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0] },
        },
        noShow: {
          $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.NO_SHOW] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    date,
    services: rows.map((row) => ({
      serviceName: row._id,
      bookings: row.bookings,
      guests: row.guests,
      averageGuests: average(row.guests, row.bookings),
      cancelled: row.cancelled,
      completed: row.completed,
      noShow: row.noShow,
    })),
  };
}

async function getTableUtilization(date) {
  const [contributions, tables] = await Promise.all([
    Booking.aggregate([
      { $match: { date } },
      {
        $addFields: {
          resolvedTables: resolvedTablesExpression(),
          duration: {
            $max: [
              0,
              {
                $subtract: [
                  minutesExpression('endTime'),
                  minutesExpression('startTime'),
                ],
              },
            ],
          },
        },
      },
      { $unwind: '$resolvedTables' },
      {
        $group: {
          _id: '$resolvedTables',
          bookingCount: { $sum: 1 },
          guestCount: { $sum: '$guests' },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0] },
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.CANCELLED] }, 1, 0] },
          },
          utilizationMinutes: { $sum: '$duration' },
        },
      },
    ]),
    Table.find().select('tableNumber capacity').lean(),
  ]);

  const byTable = new Map(contributions.map((row) => [String(row._id), row]));
  const rows = tables.map((table) => {
    const contribution = byTable.get(String(table._id));

    return {
      tableId: String(table._id),
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      bookingCount: contribution ? contribution.bookingCount : 0,
      guestCount: contribution ? contribution.guestCount : 0,
      completedCount: contribution ? contribution.completedCount : 0,
      cancelledCount: contribution ? contribution.cancelledCount : 0,
      utilizationMinutes: contribution ? contribution.utilizationMinutes : 0,
    };
  });

  rows.sort((left, right) => {
    if (left.utilizationMinutes !== right.utilizationMinutes) {
      return right.utilizationMinutes - left.utilizationMinutes;
    }

    if (left.bookingCount !== right.bookingCount) {
      return right.bookingCount - left.bookingCount;
    }

    return left.tableNumber.localeCompare(right.tableNumber);
  });

  return {
    date,
    tables: rows,
  };
}

async function getWaitlistAnalytics(date) {
  const match = date ? { date } : {};
  const rows = await Waitlist.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
  const counts = fillCounts(WAITLIST_STATUSES, rows);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const eligibleEntries = counts[WAITLIST_STATUS.NOTIFIED]
    + counts[WAITLIST_STATUS.CONVERTED]
    + counts[WAITLIST_STATUS.CANCELLED]
    + counts[WAITLIST_STATUS.EXPIRED];

  return {
    date: date || null,
    total,
    waiting: counts[WAITLIST_STATUS.WAITING],
    notified: counts[WAITLIST_STATUS.NOTIFIED],
    converted: counts[WAITLIST_STATUS.CONVERTED],
    cancelled: counts[WAITLIST_STATUS.CANCELLED],
    expired: counts[WAITLIST_STATUS.EXPIRED],
    conversionRate: ratio(counts[WAITLIST_STATUS.CONVERTED], eligibleEntries),
  };
}

async function getLiveSummary() {
  const floor = await getLiveFloor();
  const summary = {
    available: 0,
    upcoming: 0,
    booked: 0,
    arrived: 0,
    seated: 0,
    cleaning: 0,
    outOfService: 0,
  };

  floor.tables.forEach((table) => {
    const key = LIVE_SUMMARY_KEYS[table.operationalState];

    if (key) {
      summary[key] += 1;
    }
  });

  return {
    businessDate: floor.date,
    currentTime: floor.currentTime,
    summary,
    tables: floor.tables,
  };
}

function presentActivity(event) {
  return {
    type: event.type,
    reference: event.reference,
    timestamp: event.timestamp instanceof Date
      ? event.timestamp.toISOString()
      : new Date(event.timestamp).toISOString(),
    status: event.status || null,
  };
}

async function getRecentActivity() {
  const [bookingEvents, waitlistEntries] = await Promise.all([
    Booking.aggregate([
      { $match: { 'history.0': { $exists: true } } },
      { $unwind: '$history' },
      { $sort: { 'history.at': -1 } },
      { $limit: ACTIVITY_LIMIT },
      {
        $project: {
          _id: 0,
          type: { $concat: ['BOOKING_', '$history.action'] },
          reference: '$bookingReference',
          timestamp: '$history.at',
          status: { $ifNull: ['$history.toStatus', '$status'] },
        },
      },
    ]),
    Waitlist.find()
      .sort({ updatedAt: -1 })
      .limit(ACTIVITY_LIMIT)
      .select('waitlistReference status updatedAt')
      .lean(),
  ]);

  const events = [
    ...bookingEvents.map(presentActivity),
    ...waitlistEntries.map((entry) => presentActivity({
      type: 'WAITLIST',
      reference: entry.waitlistReference,
      timestamp: entry.updatedAt,
      status: entry.status,
    })),
  ];

  events.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp.localeCompare(left.timestamp);
    }

    if (left.reference !== right.reference) {
      return left.reference.localeCompare(right.reference);
    }

    return left.type.localeCompare(right.type);
  });

  return {
    events: events.slice(0, ACTIVITY_LIMIT),
  };
}

module.exports = {
  getOverview,
  getBookingAnalytics,
  getHourlyDistribution,
  getServiceAnalytics,
  getTableUtilization,
  getWaitlistAnalytics,
  getLiveSummary,
  getRecentActivity,
};
