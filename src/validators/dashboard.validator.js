const { query } = require('express-validator');
const ApiError = require('../utils/ApiError');
const { parseCalendarDate } = require('../utils/calendar');
const { BOOKING_STATUSES, BOOKING_SOURCES } = require('../constants/bookings');

function attachDate({ required }) {
  return function attachDashboardDate(req, res, next) {
    const value = req.query.date;

    if (value === undefined) {
      if (required) {
        next(ApiError.validation([{ field: 'date', message: 'Date is required' }]));
        return;
      }

      req.dashboardDate = null;
      next();
      return;
    }

    if (typeof value !== 'string') {
      next(ApiError.invalidDate());
      return;
    }

    const parsed = parseCalendarDate(value);

    if (!parsed || value !== parsed.iso) {
      next(ApiError.invalidDate());
      return;
    }

    req.dashboardDate = parsed.iso;
    next();
  };
}

const optionalDate = attachDate({ required: false });
const requiredDate = attachDate({ required: true });

const bookingFilters = [
  query('status').optional().isIn(BOOKING_STATUSES).withMessage('Status is not valid'),
  query('source').optional().isIn(BOOKING_SOURCES).withMessage('Source is not valid'),
  query('tableId').optional().isMongoId().withMessage('Table id must be valid'),
];

module.exports = {
  optionalDate,
  requiredDate,
  bookingFilters,
};
