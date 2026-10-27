const Table = require('../models/Table');
const scheduleService = require('./schedule.service');
const { findBlockedTableIds } = require('./bookingConflict.service');
const ApiError = require('../utils/ApiError');
const { TABLE_STATUS } = require('../constants/tables');
const { AVAILABILITY_REASON } = require('../constants/availability');
const { isValidTime, timeToMinutes, minutesToTime, parseCalendarDate } = require('../utils/calendar');

function unavailable(reason, details) {
  return {
    available: false,
    reason,
    tables: [],
    ...details,
  };
}

function presentService(service) {
  return {
    name: service.name,
    startTime: service.startTime,
    endTime: service.endTime,
    lastBookingTime: service.lastBookingTime,
    bookingDurationMinutes: service.bookingDurationMinutes,
    maxGuestsPerBooking: service.maxGuestsPerBooking,
  };
}

function presentTable(table) {
  const plain = table.toObject();

  return {
    id: plain.id,
    tableNumber: plain.tableNumber,
    name: plain.name,
    capacity: plain.capacity,
    status: plain.status,
    shape: plain.shape,
    location: plain.location,
    tags: plain.tags,
    position: {
      x: plain.position.x,
      y: plain.position.y,
      rotation: plain.position.rotation,
    },
  };
}

function findServiceForTime(services, startMinutes) {
  const ordered = [...services].sort(
    (left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime)
  );

  return ordered.find((service) => {
    const opens = timeToMinutes(service.startTime);
    const closes = timeToMinutes(service.endTime);
    return startMinutes >= opens && startMinutes < closes;
  }) || null;
}

function assertRequest({ date, startTime, guests }) {
  const errors = [];
  const parsedDate = parseCalendarDate(date);

  if (!parsedDate) {
    errors.push({ field: 'date', message: 'Date must be a real calendar date in YYYY-MM-DD format' });
  }

  if (!isValidTime(startTime)) {
    errors.push({ field: 'time', message: 'Time must be HH:mm' });
  }

  if (!Number.isInteger(guests) || guests < 1) {
    errors.push({ field: 'guests', message: 'Guests must be a positive whole number' });
  }

  if (errors.length > 0) {
    throw ApiError.validation(errors);
  }

  return parsedDate;
}

async function findSuitableTables(guests) {
  const tables = await Table.find({
    isActive: true,
    capacity: { $gte: guests },
    status: { $ne: TABLE_STATUS.OUT_OF_SERVICE },
  }).sort({ capacity: 1, tableNumber: 1 });

  return tables.map(presentTable);
}

async function getAvailability({ date, startTime, guests }) {
  const parsedDate = assertRequest({ date, startTime, guests });
  const schedule = await scheduleService.getEffectiveSchedule(parsedDate.iso);
  const request = {
    date: parsedDate.iso,
    dayOfWeek: parsedDate.dayOfWeek,
    startTime,
    guests,
  };

  if (!schedule.isConfigured) {
    return unavailable(AVAILABILITY_REASON.SCHEDULE_NOT_CONFIGURED, request);
  }

  if (schedule.isClosed) {
    return unavailable(AVAILABILITY_REASON.RESTAURANT_CLOSED, {
      ...request,
      closedReason: schedule.reason,
    });
  }

  const startMinutes = timeToMinutes(startTime);
  const service = findServiceForTime(schedule.services, startMinutes);

  if (!service) {
    return unavailable(AVAILABILITY_REASON.OUTSIDE_SERVICE_HOURS, request);
  }

  const serviceEnd = timeToMinutes(service.endTime);
  const lastBooking = timeToMinutes(service.lastBookingTime);
  const endMinutes = startMinutes + service.bookingDurationMinutes;
  const endTime = minutesToTime(endMinutes);
  const resolved = {
    ...request,
    endTime,
    service: presentService(service),
  };

  if (startMinutes > lastBooking) {
    return unavailable(AVAILABILITY_REASON.AFTER_LAST_BOOKING_TIME, resolved);
  }

  if (endMinutes > serviceEnd) {
    return unavailable(AVAILABILITY_REASON.BOOKING_ENDS_AFTER_SERVICE, resolved);
  }

  if (guests > service.maxGuestsPerBooking) {
    return unavailable(AVAILABILITY_REASON.PARTY_TOO_LARGE, resolved);
  }

  const tables = await findSuitableTables(guests);
  const blockedTableIds = await findBlockedTableIds({
    date: parsedDate.iso,
    startTime,
    endTime,
  });
  const openTables = tables.filter((table) => !blockedTableIds.has(String(table.id)));

  if (openTables.length === 0) {
    return unavailable(AVAILABILITY_REASON.NO_SUITABLE_TABLE, resolved);
  }

  return {
    available: true,
    ...resolved,
    tables: openTables,
  };
}

module.exports = {
  getAvailability,
};
