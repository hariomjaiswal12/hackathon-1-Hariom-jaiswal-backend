const ApiError = require('./ApiError');
const { parseCalendarDate, timeToMinutes } = require('./calendar');

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function normalizeImageUrl(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || String(value).trim() === '') {
    return null;
  }

  const text = String(value).trim();

  if (text.length > 500) {
    throw ApiError.validation([{ field: 'imageUrl', message: 'Image URL must be at most 500 characters' }]);
  }

  let parsed;

  try {
    parsed = new URL(text);
  } catch (error) {
    throw ApiError.validation([{ field: 'imageUrl', message: 'Image URL must be a valid http or https URL' }]);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw ApiError.validation([{ field: 'imageUrl', message: 'Image URL must be a valid http or https URL' }]);
  }

  return text;
}

function requireCalendarDate(value, field) {
  const parsed = parseCalendarDate(value);

  if (!parsed) {
    throw ApiError.validation([{ field, message: `${field} must be a real calendar date in YYYY-MM-DD format` }]);
  }

  return parsed.iso;
}

function requireTime(value, field) {
  const minutes = timeToMinutes(value);

  if (minutes === null) {
    throw ApiError.validation([{ field, message: `${field} must be HH:mm` }]);
  }

  return String(value).trim();
}

function assertEventSchedule({ startDate, endDate, startTime, endTime }) {
  const start = requireCalendarDate(startDate, 'startDate');
  const end = endDate === undefined || endDate === null || endDate === ''
    ? start
    : requireCalendarDate(endDate, 'endDate');
  const startMinutes = requireTime(startTime, 'startTime');
  const endMinutes = endTime === undefined || endTime === null || endTime === ''
    ? null
    : requireTime(endTime, 'endTime');

  if (end < start) {
    throw ApiError.validation([{ field: 'endDate', message: 'End date cannot be before the start date' }]);
  }

  if (end === start && endMinutes !== null && timeToMinutes(endMinutes) <= timeToMinutes(startMinutes)) {
    throw ApiError.validation([{ field: 'endTime', message: 'End time must be after the start time on the same day' }]);
  }

  return {
    startDate: start,
    endDate: end,
    startTime: startMinutes,
    endTime: endMinutes,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  slugify,
  normalizeImageUrl,
  assertEventSchedule,
  todayIso,
};
