const { body, param, query } = require('express-validator');
const { isValidTime, parseCalendarDate } = require('../utils/calendar');
const { BOOKING_SOURCES, BOOKING_STATUSES } = require('../constants/bookings');

const SERVER_FIELDS = [
  'endTime',
  'bookingReference',
  'serviceName',
  'status',
  'cancellationReason',
  'cancelledAt',
  'createdBy',
  'history',
];

function rejectServerField(field) {
  return body(field).custom((_value, { req }) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      throw new Error(`${field} is set by the server`);
    }

    return true;
  });
}

const createBookingValidator = [
  ...SERVER_FIELDS.map(rejectServerField),
  body('date')
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
  body('startTime')
    .custom((value) => isValidTime(value))
    .withMessage('Start time must be HH:mm'),
  body('guests')
    .isInt({ min: 1, max: 100 })
    .withMessage('Guests must be a positive whole number')
    .toInt(),
  body('tableId').optional().isMongoId().withMessage('Table id must be valid'),
  body('tableIds').optional().isArray().withMessage('tableIds must be a list of table ids'),
  body('tableIds.*').if(body('tableIds').exists()).isMongoId().withMessage('Table id must be valid'),
  body('notes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be at most 500 characters'),
  body('customerId').optional().isMongoId().withMessage('Customer id must be valid'),
  body('source').optional().isIn(BOOKING_SOURCES).withMessage('Source is not valid'),
];

const listBookingsValidator = [
  query('date')
    .optional()
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
  query('status').optional().isIn(BOOKING_STATUSES).withMessage('Status is not valid'),
  query('customerId').optional().isMongoId().withMessage('Customer id must be valid'),
  query('tableId').optional().isMongoId().withMessage('Table id must be valid'),
  query('source').optional().isIn(BOOKING_SOURCES).withMessage('Source is not valid'),
];

const bookingReferenceValidator = [
  param('reference')
    .matches(/^TX-\d{8}-[A-F0-9]{6}$/i)
    .withMessage('Booking reference is not valid'),
];

const cancelBookingValidator = [
  ...bookingReferenceValidator,
  body('reason')
    .optional({ values: 'undefined' })
    .isString()
    .withMessage('Reason must be text')
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason must be at most 200 characters'),
];

const RESCHEDULE_SERVER_FIELDS = [
  'endTime',
  'serviceName',
  'status',
  'bookingReference',
  'customerId',
  'createdBy',
  'history',
];

const rescheduleBookingValidator = [
  ...bookingReferenceValidator,
  ...RESCHEDULE_SERVER_FIELDS.map(rejectServerField),
  body('date')
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
  body('startTime')
    .custom((value) => isValidTime(value))
    .withMessage('Start time must be HH:mm'),
  body('tableId').isMongoId().withMessage('Table id must be valid'),
];

module.exports = {
  createBookingValidator,
  listBookingsValidator,
  bookingReferenceValidator,
  cancelBookingValidator,
  rescheduleBookingValidator,
};
