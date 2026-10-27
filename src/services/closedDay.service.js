const ClosedDay = require('../models/ClosedDay');
const ApiError = require('../utils/ApiError');
const HTTP_STATUS = require('../constants/httpStatus');
const ERROR_CODES = require('../constants/errorCodes');
const { parseCalendarDate } = require('../utils/calendar');

function requireCalendarDate(value) {
  const parsed = parseCalendarDate(value);

  if (!parsed) {
    throw ApiError.validation([{ field: 'date', message: 'Date must be a real calendar date in YYYY-MM-DD format' }]);
  }

  return parsed;
}

async function createClosedDay({ date, reason, createdBy }) {
  const parsed = requireCalendarDate(date);

  try {
    const closedDay = await ClosedDay.create({
      date: parsed.iso,
      reason: String(reason).trim(),
      isActive: true,
      createdBy,
    });

    return closedDay.toObject();
  } catch (error) {
    if (error.code === 11000) {
      throw ApiError.duplicate('A closed day already exists for this date');
    }

    throw error;
  }
}

async function listClosedDays(query) {
  const filter = {};

  if (query.isActive === 'false') {
    filter.isActive = false;
  } else if (query.isActive === 'true' || query.isActive === undefined) {
    filter.isActive = true;
  }

  const closedDays = await ClosedDay.find(filter).sort({ date: 1 });
  return closedDays.map((closedDay) => closedDay.toObject());
}

async function getClosedDayByDate(date) {
  const parsed = requireCalendarDate(date);
  const closedDay = await ClosedDay.findOne({ date: parsed.iso });

  if (!closedDay) {
    throw ApiError.notFound('Closed day not found');
  }

  return closedDay.toObject();
}

async function updateClosedDay(id, input) {
  const closedDay = await ClosedDay.findById(id);

  if (!closedDay) {
    throw ApiError.notFound('Closed day not found');
  }

  if (input.isActive === false && !closedDay.isActive && input.reason === undefined) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'Closed day is already deactivated',
      ERROR_CODES.BAD_REQUEST
    );
  }

  if (input.reason !== undefined) {
    closedDay.reason = String(input.reason).trim();
  }

  if (input.isActive !== undefined) {
    closedDay.isActive = input.isActive;
  }

  await closedDay.save();
  return closedDay.toObject();
}

async function findActiveClosedDay(date) {
  const parsed = requireCalendarDate(date);
  return ClosedDay.findOne({ date: parsed.iso, isActive: true });
}

module.exports = {
  createClosedDay,
  listClosedDays,
  getClosedDayByDate,
  updateClosedDay,
  findActiveClosedDay,
};
