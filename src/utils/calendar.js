const DAYS_OF_WEEK = Object.freeze([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SERVICE_NAME_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;

const WEEKDAY_FROM_UTC = Object.freeze([
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]);

function isValidTime(value) {
  return TIME_PATTERN.test(String(value));
}

function timeToMinutes(value) {
  const match = TIME_PATTERN.exec(String(value));

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseCalendarDate(value) {
  const match = CALENDAR_DATE_PATTERN.exec(String(value).trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    iso: `${match[1]}-${match[2]}-${match[3]}`,
    dayOfWeek: WEEKDAY_FROM_UTC[utcDate.getUTCDay()],
  };
}

function combineServerLocalDateTime(date, time) {
  const parsed = parseCalendarDate(date);
  const minutes = timeToMinutes(time);

  if (!parsed || minutes === null) {
    return null;
  }

  const [year, month, day] = parsed.iso.split('-').map(Number);
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function formatServerLocalClock(at = new Date()) {
  const clock = at instanceof Date && !Number.isNaN(at.getTime()) ? at : new Date();
  const month = String(clock.getMonth() + 1).padStart(2, '0');
  const day = String(clock.getDate()).padStart(2, '0');
  const hours = String(clock.getHours()).padStart(2, '0');
  const minutes = String(clock.getMinutes()).padStart(2, '0');

  return {
    date: `${clock.getFullYear()}-${month}-${day}`,
    currentTime: `${hours}:${minutes}`,
  };
}

module.exports = {
  DAYS_OF_WEEK,
  TIME_PATTERN,
  CALENDAR_DATE_PATTERN,
  SERVICE_NAME_PATTERN,
  isValidTime,
  timeToMinutes,
  minutesToTime,
  parseCalendarDate,
  combineServerLocalDateTime,
  formatServerLocalClock,
};
