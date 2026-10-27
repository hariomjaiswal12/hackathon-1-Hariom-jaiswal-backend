const crypto = require('crypto');
const Booking = require('../models/Booking');
const BookingLock = require('../models/BookingLock');
const Table = require('../models/Table');
const User = require('../models/User');
const availabilityService = require('./availability.service');
const { assertCustomerCanOriginateBooking, recordNoShow } = require('./blacklist.service');
const { findConflictingBooking, resolvedTableIds } = require('./bookingConflict.service');
const ApiError = require('../utils/ApiError');
const HTTP_STATUS = require('../constants/httpStatus');
const ERROR_CODES = require('../constants/errorCodes');
const { ROLES } = require('../constants/roles');
const { TABLE_STATUS } = require('../constants/tables');
const { AVAILABILITY_REASON } = require('../constants/availability');
const {
  BOOKING_STATUS,
  BOOKING_SOURCE,
  BOOKING_HISTORY_ACTION,
  RESCHEDULABLE_BOOKING_STATUSES,
  STAFF_BOOKING_SOURCES,
  ADMIN_BOOKING_SOURCES,
  MAX_TABLES_PER_BOOKING,
  canTransitionBooking,
} = require('../constants/bookings');
const { DEPOSIT_STATUS } = require('../constants/payments');
const { parseCalendarDate, combineServerLocalDateTime } = require('../utils/calendar');
const depositConfigService = require('./depositConfig.service');
const paymentService = require('./payment.service');
const logger = require('../utils/logger');

const LOCK_MS = 15000;
const REFERENCE_ATTEMPTS = 5;

const SCHEDULE_REASONS = new Set([
  AVAILABILITY_REASON.RESTAURANT_CLOSED,
  AVAILABILITY_REASON.SCHEDULE_NOT_CONFIGURED,
  AVAILABILITY_REASON.OUTSIDE_SERVICE_HOURS,
  AVAILABILITY_REASON.AFTER_LAST_BOOKING_TIME,
  AVAILABILITY_REASON.BOOKING_ENDS_AFTER_SERVICE,
  AVAILABILITY_REASON.PARTY_TOO_LARGE,
]);

const SCHEDULE_MESSAGES = {
  [AVAILABILITY_REASON.RESTAURANT_CLOSED]: 'The restaurant is closed on this date',
  [AVAILABILITY_REASON.SCHEDULE_NOT_CONFIGURED]: 'The restaurant has no schedule for this date',
  [AVAILABILITY_REASON.OUTSIDE_SERVICE_HOURS]: 'The requested time is outside service hours',
  [AVAILABILITY_REASON.AFTER_LAST_BOOKING_TIME]: 'The requested time is after the last booking time',
  [AVAILABILITY_REASON.BOOKING_ENDS_AFTER_SERVICE]: 'The booking would end after the service closes',
  [AVAILABILITY_REASON.PARTY_TOO_LARGE]: 'The party is larger than this service allows',
};

function presentTable(table) {
  if (!table) {
    return null;
  }

  const plain = table.toObject();

  return {
    id: plain.id,
    tableNumber: plain.tableNumber,
    capacity: plain.capacity,
  };
}

function presentSlot(slot) {
  if (!slot) {
    return undefined;
  }

  return {
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    tableId: slot.tableId,
    serviceName: slot.serviceName,
  };
}

function presentHistoryEntry(entry) {
  return {
    action: entry.action,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actorId: entry.actorId,
    at: entry.at,
    reason: entry.reason,
    fromSlot: presentSlot(entry.fromSlot),
    toSlot: presentSlot(entry.toSlot),
  };
}

function asTableList(tables) {
  if (!tables) {
    return [];
  }

  return Array.isArray(tables) ? tables.filter(Boolean) : [tables];
}

function presentBooking(booking, tables) {
  const plain = booking.toObject();
  const ids = resolvedTableIds(plain).map(String);
  const byId = new Map(asTableList(tables).map((table) => [String(table._id || table.id), table]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  return {
    id: plain.id,
    bookingReference: plain.bookingReference,
    customerId: plain.customerId,
    tableId: ids[0] || plain.tableId,
    tableIds: ids,
    date: plain.date,
    startTime: plain.startTime,
    endTime: plain.endTime,
    guests: plain.guests,
    serviceName: plain.serviceName,
    source: plain.source,
    status: plain.status,
    depositRequired: Boolean(plain.depositRequired),
    depositAmount: Number(plain.depositAmount) || 0,
    depositStatus: plain.depositStatus || DEPOSIT_STATUS.NOT_REQUIRED,
    paymentReference: plain.paymentReference || null,
    notes: plain.notes,
    cancellationReason: plain.cancellationReason,
    cancelledAt: plain.cancelledAt,
    createdBy: plain.createdBy,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    table: presentTable(ordered[0]),
    tables: ordered.map(presentTable),
    history: (plain.history || []).map(presentHistoryEntry),
  };
}

async function loadTables(ids) {
  if (ids.length === 0) {
    return [];
  }

  return Table.find({ _id: { $in: ids } });
}

async function presentBookings(bookings) {
  const tableIds = [...new Set(bookings.flatMap((booking) => resolvedTableIds(booking).map(String)))];
  const tables = await loadTables(tableIds);
  const tablesById = new Map(tables.map((table) => [String(table._id), table]));

  return bookings.map((booking) => presentBooking(
    booking,
    resolvedTableIds(booking).map((id) => tablesById.get(String(id)))
  ));
}

function lockSlots(booking) {
  return resolvedTableIds(booking).map((tableId) => ({
    tableId,
    date: booking.date,
  }));
}

function generateBookingReference(date) {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TX-${date.replace(/-/g, '')}-${suffix}`;
}

function rejectSchedule(availability) {
  throw new ApiError(
    HTTP_STATUS.CONFLICT,
    SCHEDULE_MESSAGES[availability.reason] || 'This time cannot be booked',
    availability.reason
  );
}

function resolveSource(actor, source) {
  if (actor.role === ROLES.CUSTOMER) {
    if (source && source !== BOOKING_SOURCE.WEBSITE) {
      throw ApiError.forbidden('Customers can only create website bookings');
    }

    return BOOKING_SOURCE.WEBSITE;
  }

  const allowed = actor.role === ROLES.ADMIN ? ADMIN_BOOKING_SOURCES : STAFF_BOOKING_SOURCES;
  const selected = source || (actor.role === ROLES.ADMIN ? BOOKING_SOURCE.ADMIN : BOOKING_SOURCE.STAFF);

  if (!allowed.includes(selected)) {
    throw ApiError.forbidden('This booking source is not allowed for your role');
  }

  return selected;
}

async function resolveCustomer(actor, customerId) {
  if (actor.role === ROLES.CUSTOMER) {
    if (customerId && String(customerId) !== String(actor.id)) {
      throw ApiError.forbidden('You cannot create a booking for another customer');
    }

    return actor.id;
  }

  if (!customerId) {
    throw ApiError.validation([{ field: 'customerId', message: 'Customer is required' }]);
  }

  const customer = await User.findById(customerId);

  if (!customer || customer.role !== ROLES.CUSTOMER) {
    throw ApiError.notFound('Customer not found');
  }

  if (!customer.isActive || customer.isBlacklisted) {
    throw ApiError.forbidden('This customer cannot receive a booking');
  }

  return customer.id;
}

async function assertTableCanSeat(tableId, guests) {
  const table = await Table.findById(tableId);

  if (!table) {
    throw ApiError.notFound('Table not found');
  }

  if (!table.isActive) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'This table is not active',
      ERROR_CODES.BAD_REQUEST
    );
  }

  if (table.status === TABLE_STATUS.OUT_OF_SERVICE) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'This table is out of service',
      ERROR_CODES.BAD_REQUEST
    );
  }

  if (table.capacity < guests) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'This table does not have enough seats',
      ERROR_CODES.BAD_REQUEST
    );
  }

  return table;
}

async function acquireTableLock(tableId, date) {
  const owner = crypto.randomBytes(12).toString('hex');
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_MS);

  try {
    await BookingLock.updateOne(
      { tableId, date },
      { $setOnInsert: { tableId, date, owner, lockedUntil } },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
  }

  const acquired = await BookingLock.findOneAndUpdate(
    {
      tableId,
      date,
      $or: [{ owner }, { lockedUntil: { $lte: now } }],
    },
    { $set: { owner, lockedUntil } },
    { returnDocument: 'after' }
  );

  if (!acquired || acquired.owner !== owner) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      'This table is being booked. Please try again.',
      ERROR_CODES.BOOKING_CONFLICT
    );
  }

  return owner;
}

async function releaseTableLock(tableId, date, owner) {
  await BookingLock.updateOne(
    { tableId, date, owner },
    { $set: { lockedUntil: new Date(0) } }
  );
}

async function insertBooking(payload) {
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      return await Booking.create({
        ...payload,
        bookingReference: generateBookingReference(payload.date),
        history: payload.history || [
          {
            action: BOOKING_HISTORY_ACTION.CREATED,
            toStatus: payload.status,
            actorId: payload.createdBy,
            at: new Date(),
          },
        ],
      });
    } catch (error) {
      const duplicateReference = error.code === 11000
        && (error.keyPattern?.bookingReference || error.keyValue?.bookingReference);

      if (!duplicateReference) {
        throw error;
      }
    }
  }

  throw ApiError.internal('Could not generate a booking reference');
}

function selectionError(message) {
  return new ApiError(
    HTTP_STATUS.BAD_REQUEST,
    message,
    ERROR_CODES.INVALID_TABLE_SELECTION
  );
}

function resolveSelectedTableIds(input) {
  const hasSingle = input.tableId !== undefined && input.tableId !== null && input.tableId !== '';
  const hasMany = input.tableIds !== undefined && input.tableIds !== null;

  if (hasSingle === hasMany) {
    throw selectionError('Provide either tableId or tableIds');
  }

  if (hasMany && !Array.isArray(input.tableIds)) {
    throw selectionError('tableIds must be a list of table ids');
  }

  const ids = (hasSingle ? [input.tableId] : input.tableIds).map(String);

  if (ids.length === 0) {
    throw selectionError('Select at least one table');
  }

  if (new Set(ids).size !== ids.length) {
    throw selectionError('Duplicate table ids are not allowed');
  }

  if (ids.length > MAX_TABLES_PER_BOOKING) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `A booking can include at most ${MAX_TABLES_PER_BOOKING} tables`,
      ERROR_CODES.TOO_MANY_TABLES
    );
  }

  return ids;
}

async function loadSelectedTables(ids) {
  const found = await loadTables(ids);
  const byId = new Map(found.map((table) => [String(table._id), table]));
  const ordered = ids.map((id) => byId.get(String(id)));

  if (ordered.some((table) => !table)) {
    throw ApiError.notFound('Table not found');
  }

  ordered.forEach((table) => {
    if (!table.isActive) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        'This table is not active',
        ERROR_CODES.BAD_REQUEST
      );
    }

    if (table.status === TABLE_STATUS.OUT_OF_SERVICE) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        'This table is out of service',
        ERROR_CODES.BAD_REQUEST
      );
    }
  });

  return ordered;
}

function assertCombinedCapacity(tables, guests) {
  const combinedCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);

  if (combinedCapacity < guests) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'These tables do not have enough seats',
      ERROR_CODES.TABLE_CAPACITY_INSUFFICIENT
    );
  }
}

async function createBooking({ actor, input }) {
  const source = resolveSource(actor, input.source);
  const customerId = await resolveCustomer(actor, input.customerId);

  if (actor.role === ROLES.CUSTOMER) {
    await assertCustomerCanOriginateBooking(actor.id);
  }
  const selectedIds = resolveSelectedTableIds(input);
  const availability = await resolveBookingWindow({
    date: input.date,
    startTime: input.startTime,
    guests: input.guests,
  });
  const tables = await loadSelectedTables(selectedIds);
  assertCombinedCapacity(tables, input.guests);

  const depositReq = await depositConfigService.calculateDepositRequirement(input.guests);
  const requiresDeposit = actor.role === ROLES.CUSTOMER && depositReq.required;
  const initialStatus = requiresDeposit ? BOOKING_STATUS.PENDING : BOOKING_STATUS.CONFIRMED;
  const initialDepositStatus = requiresDeposit ? DEPOSIT_STATUS.PENDING : DEPOSIT_STATUS.NOT_REQUIRED;

  return withTableLocks(
    tables.map((table) => ({ tableId: table._id, date: availability.date })),
    async () => {
      const conflict = await findConflictingBooking({
        tableIds: tables.map((table) => table._id),
        date: availability.date,
        startTime: availability.startTime,
        endTime: availability.endTime,
      });

      if (conflict) {
        throw new ApiError(
          HTTP_STATUS.CONFLICT,
          'This table is already booked for that time',
          ERROR_CODES.BOOKING_CONFLICT
        );
      }

      const booking = await insertBooking({
        customerId,
        tableId: tables[0]._id,
        tableIds: tables.map((table) => table._id),
        date: availability.date,
        startTime: availability.startTime,
        endTime: availability.endTime,
        guests: input.guests,
        serviceName: availability.service.name,
        source,
        status: initialStatus,
        depositRequired: requiresDeposit,
        depositAmount: requiresDeposit ? depositReq.amount : 0,
        depositStatus: initialDepositStatus,
        notes: input.notes ? String(input.notes).trim() : undefined,
        createdBy: actor.id,
      });

      let payment = null;
      if (requiresDeposit) {
        const intentResult = await paymentService.createOrGetPaymentIntent({
          booking,
          actor,
        });
        booking.paymentReference = intentResult.payment.paymentReference;
        await booking.save();
        payment = intentResult.order || intentResult.payment;
      }

      const presented = presentBooking(booking, tables);
      return {
        ...presented,
        booking: presented,
        payment,
      };
    }
  );
}

function invalidBookingState(message) {
  return new ApiError(
    HTTP_STATUS.CONFLICT,
    message,
    ERROR_CODES.INVALID_BOOKING_STATE
  );
}

function assertTransition(booking, toStatus) {
  if (!canTransitionBooking(booking.status, toStatus)) {
    throw invalidBookingState('This booking cannot move to that status');
  }
}

function assertReschedulable(booking) {
  if (!RESCHEDULABLE_BOOKING_STATUSES.includes(booking.status)) {
    throw invalidBookingState('This booking cannot be rescheduled');
  }
}

function assertCanAccess(actor, booking) {
  if (actor.role === ROLES.CUSTOMER && String(booking.customerId) !== String(actor.id)) {
    throw ApiError.notFound('Booking not found');
  }
}

function slotKey(tableId, date) {
  return `${String(tableId)}|${date}`;
}

function bookingSlot(booking) {
  return {
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    tableId: booking.tableId,
    serviceName: booking.serviceName,
  };
}

async function findBookingByReference(bookingReference) {
  const booking = await Booking.findOne({
    bookingReference: String(bookingReference).trim().toUpperCase(),
  });

  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }

  return booking;
}

async function resolveBookingWindow({ date, startTime, guests }) {
  const availability = await availabilityService.getAvailability({
    date,
    startTime,
    guests,
  });

  if (!availability.available && SCHEDULE_REASONS.has(availability.reason)) {
    rejectSchedule(availability);
  }

  if (!availability.endTime || !availability.service) {
    rejectSchedule(availability);
  }

  return availability;
}

async function withTableLocks(slots, work) {
  const unique = [];
  const seen = new Set();

  slots.forEach((slot) => {
    const key = slotKey(slot.tableId, slot.date);

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(slot);
    }
  });

  unique.sort((left, right) => slotKey(left.tableId, left.date).localeCompare(slotKey(right.tableId, right.date)));

  const held = [];

  try {
    for (const slot of unique) {
      held.push({
        tableId: slot.tableId,
        date: slot.date,
        owner: await acquireTableLock(slot.tableId, slot.date),
      });
    }

    return await work(new Set(held.map((lock) => slotKey(lock.tableId, lock.date))));
  } finally {
    for (let index = held.length - 1; index >= 0; index -= 1) {
      await releaseTableLock(held[index].tableId, held[index].date, held[index].owner);
    }
  }
}

async function cancelBooking({ actor, bookingReference, reason }) {
  const booking = await findBookingByReference(bookingReference);
  assertCanAccess(actor, booking);
  assertTransition(booking, BOOKING_STATUS.CANCELLED);
  const trimmedReason = reason ? String(reason).trim() : '';

  const updated = await withTableLocks(lockSlots(booking), async () => {
      const current = await Booking.findById(booking._id);

      if (!current) {
        throw ApiError.notFound('Booking not found');
      }

      assertCanAccess(actor, current);
      assertTransition(current, BOOKING_STATUS.CANCELLED);
      current.history.push({
        action: BOOKING_HISTORY_ACTION.STATUS_CHANGED,
        fromStatus: current.status,
        toStatus: BOOKING_STATUS.CANCELLED,
        actorId: actor.id,
        at: new Date(),
        reason: trimmedReason || undefined,
      });
      current.status = BOOKING_STATUS.CANCELLED;
      current.cancellationReason = trimmedReason || undefined;
      current.cancelledAt = new Date();

      if (current.depositStatus === DEPOSIT_STATUS.PAID && current.paymentReference) {
        const depositConfig = await depositConfigService.getDepositConfig();
        const bookingDateTime = combineServerLocalDateTime(current.date, current.startTime);
        const hoursUntilBooking = bookingDateTime
          ? (bookingDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
          : 0;

        if (hoursUntilBooking >= depositConfig.refundCutoffHours) {
          try {
            await paymentService.refundDeposit({
              paymentReference: current.paymentReference,
              reason: trimmedReason || 'Cancelled before refund cutoff',
              actor,
              force: true,
            });
            current.depositStatus = DEPOSIT_STATUS.REFUNDED;
          } catch (refundErr) {
            logger.error(`Automatic deposit refund failed: ${refundErr.message}`);
          }
        }
      } else if (current.depositStatus === DEPOSIT_STATUS.PENDING) {
        current.depositStatus = DEPOSIT_STATUS.NOT_REQUIRED;
      }

      await current.save();
      return current;
    }
  );

  return presentBooking(updated, await loadTables(resolvedTableIds(updated)));
}

async function rescheduleBooking({ actor, bookingReference, input }) {
  if (actor.role === ROLES.CUSTOMER) {
    await assertCustomerCanOriginateBooking(actor.id);
  }

  const booking = await findBookingByReference(bookingReference);
  assertCanAccess(actor, booking);
  assertReschedulable(booking);

  const availability = await resolveBookingWindow({
    date: input.date,
    startTime: input.startTime,
    guests: booking.guests,
  });
  const table = await assertTableCanSeat(input.tableId, booking.guests);

  const updated = await withTableLocks(
    [
      ...lockSlots(booking),
      { tableId: table._id, date: availability.date },
    ],
    async (heldKeys) => {
      const current = await Booking.findById(booking._id);

      if (!current) {
        throw ApiError.notFound('Booking not found');
      }

      assertCanAccess(actor, current);
      assertReschedulable(current);

      const currentIds = resolvedTableIds(current);
      const holdsCurrentTables = currentIds.every((id) => heldKeys.has(slotKey(id, current.date)));

      if (!holdsCurrentTables) {
        throw new ApiError(
          HTTP_STATUS.CONFLICT,
          'This booking changed. Please try again.',
          ERROR_CODES.BOOKING_CONFLICT
        );
      }

      const confirmedWindow = await resolveBookingWindow({
        date: input.date,
        startTime: input.startTime,
        guests: current.guests,
      });
      const confirmedTable = await assertTableCanSeat(input.tableId, current.guests);

      const conflict = await findConflictingBooking({
        tableId: confirmedTable._id,
        date: confirmedWindow.date,
        startTime: confirmedWindow.startTime,
        endTime: confirmedWindow.endTime,
        excludeBookingId: current._id,
      });

      if (conflict) {
        throw new ApiError(
          HTTP_STATUS.CONFLICT,
          'This table is already booked for that time',
          ERROR_CODES.BOOKING_CONFLICT
        );
      }

      const fromSlot = bookingSlot(current);
      current.date = confirmedWindow.date;
      current.startTime = confirmedWindow.startTime;
      current.endTime = confirmedWindow.endTime;
      current.tableId = confirmedTable._id;
      current.tableIds = [confirmedTable._id];
      current.serviceName = confirmedWindow.service.name;
      current.history.push({
        action: BOOKING_HISTORY_ACTION.RESCHEDULED,
        fromStatus: current.status,
        toStatus: current.status,
        actorId: actor.id,
        at: new Date(),
        fromSlot,
        toSlot: bookingSlot(current),
      });
      await current.save();
      return { booking: current, table: confirmedTable };
    }
  );

  return presentBooking(updated.booking, updated.table);
}

async function changeBookingStatus({ actor, bookingReference, toStatus }) {
  if (actor.role === ROLES.CUSTOMER) {
    throw ApiError.forbidden();
  }

  const booking = await findBookingByReference(bookingReference);
  assertCanAccess(actor, booking);
  assertTransition(booking, toStatus);

  const updated = await withTableLocks(lockSlots(booking), async () => {
      const current = await Booking.findById(booking._id);

      if (!current) {
        throw ApiError.notFound('Booking not found');
      }

      assertTransition(current, toStatus);
      current.history.push({
        action: BOOKING_HISTORY_ACTION.STATUS_CHANGED,
        fromStatus: current.status,
        toStatus,
        actorId: actor.id,
        at: new Date(),
      });
      current.status = toStatus;
      await current.save();

      if (toStatus === BOOKING_STATUS.NO_SHOW) {
        await recordNoShow(current.customerId);
      }

      return current;
    }
  );

  return presentBooking(updated, await loadTables(resolvedTableIds(updated)));
}

async function listBookings({ actor, query }) {
  const filter = {};

  if (actor.role === ROLES.CUSTOMER) {
    filter.customerId = actor.id;
  } else if (query.customerId) {
    filter.customerId = query.customerId;
  }

  if (query.date) {
    const parsed = parseCalendarDate(query.date);

    if (!parsed) {
      throw ApiError.validation([
        { field: 'date', message: 'Date must be a real calendar date in YYYY-MM-DD format' },
      ]);
    }

    filter.date = parsed.iso;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.tableId) {
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { tableId: query.tableId },
          { tableIds: query.tableId },
        ],
      },
    ];
  }

  if (query.source) {
    filter.source = query.source;
  }

  const bookings = await Booking.find(filter).sort({ date: 1, startTime: 1 });
  return presentBookings(bookings);
}

async function getBooking({ actor, bookingReference }) {
  const booking = await findBookingByReference(bookingReference);
  assertCanAccess(actor, booking);
  return presentBooking(booking, await loadTables(resolvedTableIds(booking)));
}

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  cancelBooking,
  rescheduleBooking,
  changeBookingStatus,
  presentBooking,
  presentBookings,
};
