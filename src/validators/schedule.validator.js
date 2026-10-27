const { body, param, query } = require('express-validator');
const {
  DAYS_OF_WEEK,
  TIME_PATTERN,
  SERVICE_NAME_PATTERN,
  parseCalendarDate,
} = require('../utils/calendar');

const saveDayValidator = [
  param('day')
    .custom((value) => DAYS_OF_WEEK.includes(String(value).trim().toUpperCase()))
    .withMessage('Day must be a weekday name such as MONDAY'),
  body('isOpen').isBoolean().withMessage('isOpen must be true or false'),
  body('services')
    .isArray({ max: 8 })
    .withMessage('Services must be an array of at most 8 items'),
  body('services.*.name')
    .trim()
    .notEmpty()
    .withMessage('Service name is required')
    .isLength({ max: 32 })
    .withMessage('Service name must be at most 32 characters')
    .custom((value) => SERVICE_NAME_PATTERN.test(String(value).trim().toUpperCase()))
    .withMessage('Service name must use letters, numbers, and hyphens'),
  body('services.*.startTime')
    .matches(TIME_PATTERN)
    .withMessage('Start time must be HH:mm'),
  body('services.*.endTime')
    .matches(TIME_PATTERN)
    .withMessage('End time must be HH:mm'),
  body('services.*.lastBookingTime')
    .matches(TIME_PATTERN)
    .withMessage('Last booking time must be HH:mm'),
  body('services.*.bookingDurationMinutes')
    .isInt({ min: 1, max: 720 })
    .withMessage('Booking duration must be a positive number of minutes')
    .toInt(),
  body('services.*.maxGuestsPerBooking')
    .isInt({ min: 1, max: 100 })
    .withMessage('Maximum guests must be a positive whole number')
    .toInt(),
];

const dayParamValidator = [
  param('day')
    .custom((value) => DAYS_OF_WEEK.includes(String(value).trim().toUpperCase()))
    .withMessage('Day must be a weekday name such as MONDAY'),
];

const effectiveDateValidator = [
  param('date')
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
];

module.exports = {
  saveDayValidator,
  dayParamValidator,
  effectiveDateValidator,
};
