const Schedule = require('../models/Schedule');
const ApiError = require('../utils/ApiError');
const closedDayService = require('./closedDay.service');
const {
  DAYS_OF_WEEK,
  SERVICE_NAME_PATTERN,
  isValidTime,
  timeToMinutes,
  parseCalendarDate,
} = require('../utils/calendar');

function requireDayOfWeek(value) {
  const dayOfWeek = String(value).trim().toUpperCase();

  if (!DAYS_OF_WEEK.includes(dayOfWeek)) {
    throw ApiError.validation([{ field: 'day', message: 'Day must be a weekday name such as MONDAY' }]);
  }

  return dayOfWeek;
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

function presentSchedule(schedule) {
  const plain = schedule.toObject();

  return {
    id: plain.id,
    dayOfWeek: plain.dayOfWeek,
    isOpen: plain.isOpen,
    isConfigured: true,
    services: plain.services.map(presentService),
  };
}

function normalizeService(service, index) {
  const label = `services[${index}]`;
  const name = String(service.name || '').trim().toUpperCase();
  const startTime = String(service.startTime || '');
  const endTime = String(service.endTime || '');
  const lastBookingTime = String(service.lastBookingTime || '');
  const bookingDurationMinutes = Number(service.bookingDurationMinutes);
  const maxGuestsPerBooking = Number(service.maxGuestsPerBooking);
  const errors = [];

  if (!SERVICE_NAME_PATTERN.test(name)) {
    errors.push({ field: `${label}.name`, message: 'Service name must use letters, numbers, and hyphens' });
  }

  if (!isValidTime(startTime)) {
    errors.push({ field: `${label}.startTime`, message: 'Start time must be HH:mm' });
  }

  if (!isValidTime(endTime)) {
    errors.push({ field: `${label}.endTime`, message: 'End time must be HH:mm' });
  }

  if (!isValidTime(lastBookingTime)) {
    errors.push({ field: `${label}.lastBookingTime`, message: 'Last booking time must be HH:mm' });
  }

  if (!Number.isInteger(bookingDurationMinutes) || bookingDurationMinutes < 1) {
    errors.push({
      field: `${label}.bookingDurationMinutes`,
      message: 'Booking duration must be a positive whole number of minutes',
    });
  }

  if (!Number.isInteger(maxGuestsPerBooking) || maxGuestsPerBooking < 1) {
    errors.push({
      field: `${label}.maxGuestsPerBooking`,
      message: 'Maximum guests must be a positive whole number',
    });
  }

  if (errors.length > 0) {
    throw ApiError.validation(errors);
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const lastBookingMinutes = timeToMinutes(lastBookingTime);

  if (startMinutes >= endMinutes) {
    errors.push({ field: `${label}.endTime`, message: 'End time must be later than start time' });
  }

  if (lastBookingMinutes < startMinutes || lastBookingMinutes > endMinutes) {
    errors.push({
      field: `${label}.lastBookingTime`,
      message: 'Last booking time must be within the service window',
    });
  }

  if (errors.length === 0 && lastBookingMinutes + bookingDurationMinutes > endMinutes) {
    errors.push({
      field: `${label}.bookingDurationMinutes`,
      message: 'A booking starting at the last booking time must finish by the service end time',
    });
  }

  if (errors.length > 0) {
    throw ApiError.validation(errors);
  }

  return {
    name,
    startTime,
    endTime,
    lastBookingTime,
    bookingDurationMinutes,
    maxGuestsPerBooking,
  };
}

function validateScheduleConfiguration(input) {
  if (typeof input.isOpen !== 'boolean') {
    throw ApiError.validation([{ field: 'isOpen', message: 'isOpen must be true or false' }]);
  }

  const services = Array.isArray(input.services) ? input.services : null;

  if (!services) {
    throw ApiError.validation([{ field: 'services', message: 'Services must be an array' }]);
  }

  if (!input.isOpen) {
    if (services.length > 0) {
      throw ApiError.validation([
        { field: 'services', message: 'A closed weekday cannot include services' },
      ]);
    }

    return { isOpen: false, services: [] };
  }

  if (services.length === 0) {
    throw ApiError.validation([
      { field: 'services', message: 'An open day must include at least one service' },
    ]);
  }

  const normalized = services.map(normalizeService);
  const names = new Set();

  for (const service of normalized) {
    if (names.has(service.name)) {
      throw ApiError.validation([
        { field: 'services', message: `Service ${service.name} is listed more than once` },
      ]);
    }

    names.add(service.name);
  }

  const ordered = [...normalized].sort(
    (left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime)
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const overlaps = timeToMinutes(previous.startTime) < timeToMinutes(current.endTime)
      && timeToMinutes(current.startTime) < timeToMinutes(previous.endTime);

    if (overlaps) {
      throw ApiError.validation([
        {
          field: 'services',
          message: `${previous.name} and ${current.name} have overlapping times`,
        },
      ]);
    }
  }

  return { isOpen: true, services: ordered };
}

async function getWeeklySchedule() {
  const schedules = await Schedule.find({});
  const byDay = new Map(schedules.map((schedule) => [schedule.dayOfWeek, presentSchedule(schedule)]));

  return DAYS_OF_WEEK.map((dayOfWeek) => byDay.get(dayOfWeek) || {
    dayOfWeek,
    isConfigured: false,
  });
}

async function getScheduleForDay(day) {
  const dayOfWeek = requireDayOfWeek(day);
  const schedule = await Schedule.findOne({ dayOfWeek });

  if (!schedule) {
    return {
      dayOfWeek,
      isConfigured: false,
    };
  }

  return presentSchedule(schedule);
}

async function saveDaySchedule(day, input) {
  const dayOfWeek = requireDayOfWeek(day);
  const configuration = validateScheduleConfiguration(input);
  let schedule = await Schedule.findOne({ dayOfWeek });

  if (!schedule) {
    schedule = new Schedule({ dayOfWeek });
  }

  schedule.isOpen = configuration.isOpen;
  schedule.services = configuration.services;

  try {
    await schedule.save();
  } catch (error) {
    if (error.code === 11000) {
      throw ApiError.duplicate('A schedule for this day already exists');
    }

    throw error;
  }

  return presentSchedule(schedule);
}

async function getEffectiveSchedule(date) {
  const parsed = parseCalendarDate(date);

  if (!parsed) {
    throw ApiError.validation([
      { field: 'date', message: 'Date must be a real calendar date in YYYY-MM-DD format' },
    ]);
  }

  const closedDay = await closedDayService.findActiveClosedDay(parsed.iso);

  if (closedDay) {
    return {
      date: parsed.iso,
      dayOfWeek: parsed.dayOfWeek,
      isConfigured: true,
      isClosed: true,
      reason: closedDay.reason,
      services: [],
    };
  }

  const schedule = await Schedule.findOne({ dayOfWeek: parsed.dayOfWeek });

  if (!schedule) {
    return {
      date: parsed.iso,
      dayOfWeek: parsed.dayOfWeek,
      isConfigured: false,
      isClosed: false,
      services: [],
    };
  }

  if (!schedule.isOpen) {
    return {
      date: parsed.iso,
      dayOfWeek: parsed.dayOfWeek,
      isConfigured: true,
      isClosed: true,
      reason: 'The restaurant is closed on this day of the week',
      services: [],
    };
  }

  return {
    date: parsed.iso,
    dayOfWeek: parsed.dayOfWeek,
    isConfigured: true,
    isClosed: false,
    services: schedule.services.map(presentService),
  };
}

module.exports = {
  getWeeklySchedule,
  getScheduleForDay,
  saveDaySchedule,
  getEffectiveSchedule,
  validateScheduleConfiguration,
};
