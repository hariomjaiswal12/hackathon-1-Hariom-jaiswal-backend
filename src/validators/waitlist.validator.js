const { body, param, query } = require('express-validator');
const { isValidTime, parseCalendarDate } = require('../utils/calendar');
const { BOOKING_SOURCES } = require('../constants/bookings');
const { WAITLIST_STATUSES } = require('../constants/waitlist');

const SERVER_FIELDS = ['waitlistReference', 'status', 'serviceName', 'createdBy'];

function rejectServerField(field) {
  return body(field).custom((_value, { req }) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      throw new Error(`${field} is set by the server`);
    }

    return true;
  });
}

const createWaitlistValidator = [
  ...SERVER_FIELDS.map(rejectServerField),
  body('date')
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
  body('requestedStartTime')
    .custom((value) => isValidTime(value))
    .withMessage('Requested start time must be HH:mm'),
  body('guests')
    .isInt({ min: 1, max: 100 })
    .withMessage('Guests must be a positive whole number')
    .toInt(),
  body('notes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be at most 500 characters'),
  body('customerId').optional().isMongoId().withMessage('Customer id must be valid'),
  body('source').optional().isIn(BOOKING_SOURCES).withMessage('Source is not valid'),
];

const listWaitlistValidator = [
  query('date')
    .optional()
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
  query('status').optional().isIn(WAITLIST_STATUSES).withMessage('Status is not valid'),
  query('source').optional().isIn(BOOKING_SOURCES).withMessage('Source is not valid'),
];

const waitlistReferenceValidator = [
  param('reference')
    .matches(/^WL-\d{8}-[A-F0-9]{6}$/i)
    .withMessage('Waitlist reference is not valid'),
];

module.exports = {
  createWaitlistValidator,
  listWaitlistValidator,
  waitlistReferenceValidator,
};
