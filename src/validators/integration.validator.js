const { body, param, header } = require('express-validator');
const { parseCalendarDate, isValidTime } = require('../utils/calendar');
const { CHANNELS } = require('../constants/channels');

const BOOKING_FIELDS = ['channel', 'customer', 'date', 'startTime', 'guests', 'tableId', 'tableIds', 'notes'];
const CUSTOMER_FIELDS = ['name', 'email', 'phone', 'customerId'];

function rejectUnknown(allowed) {
  return (value) => {
    const unknown = Object.keys(value || {}).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`Unknown field: ${unknown.join(', ')}`);
    }
    return true;
  };
}

const idempotencyHeader = header('idempotency-key')
  .isString()
  .bail()
  .trim()
  .isLength({ min: 1, max: 200 })
  .withMessage('Idempotency key must be between 1 and 200 characters');

const channelField = body('channel').isIn(CHANNELS).withMessage('Channel is not valid');

const customerField = body('customer')
  .isObject()
  .withMessage('Customer is required')
  .custom(rejectUnknown(CUSTOMER_FIELDS));

const createIntegrationBookingValidator = [
  idempotencyHeader,
  body().custom(rejectUnknown(BOOKING_FIELDS)),
  channelField,
  customerField,
  body('customer.name').optional().isString().bail().trim().isLength({ min: 2, max: 80 }),
  body('customer.email').optional().isEmail().withMessage('Email must be valid'),
  body('customer.phone').optional().isString().bail().trim().isLength({ max: 20 }),
  body('customer.customerId').optional().isMongoId().withMessage('Customer id must be valid'),
  body('date').custom((value) => Boolean(parseCalendarDate(value))).withMessage('Date must be YYYY-MM-DD'),
  body('startTime').custom((value) => isValidTime(value)).withMessage('Start time must be HH:mm'),
  body('guests').isInt({ min: 1, max: 100 }).withMessage('Guests must be between 1 and 100').toInt(),
  body('tableId').optional().isMongoId().withMessage('Table id must be valid'),
  body('tableIds').optional().isArray({ min: 1, max: 3 }).withMessage('A booking can include at most three tables'),
  body('tableIds.*').optional().isMongoId().withMessage('Table id must be valid'),
  body('notes').optional().isString().bail().trim().isLength({ max: 500 }),
];

const availabilityValidator = [
  body().custom(rejectUnknown(['channel', 'date', 'startTime', 'guests'])),
  channelField,
  body('date').custom((value) => Boolean(parseCalendarDate(value))).withMessage('Date must be YYYY-MM-DD'),
  body('startTime').custom((value) => isValidTime(value)).withMessage('Start time must be HH:mm'),
  body('guests').isInt({ min: 1, max: 100 }).withMessage('Guests must be between 1 and 100').toInt(),
];

const cancelValidator = [
  idempotencyHeader,
  param('reference').isString().bail().trim().notEmpty().withMessage('Booking reference is required'),
  body().custom(rejectUnknown(['channel', 'reason'])),
  channelField,
  body('reason').optional().isString().bail().trim().isLength({ max: 200 }),
];

const rescheduleValidator = [
  idempotencyHeader,
  param('reference').isString().bail().trim().notEmpty().withMessage('Booking reference is required'),
  body().custom(rejectUnknown(['channel', 'date', 'startTime', 'tableId'])),
  channelField,
  body('date').custom((value) => Boolean(parseCalendarDate(value))).withMessage('Date must be YYYY-MM-DD'),
  body('startTime').custom((value) => isValidTime(value)).withMessage('Start time must be HH:mm'),
  body('tableId').isMongoId().withMessage('Table id must be valid'),
];

module.exports = {
  createIntegrationBookingValidator,
  availabilityValidator,
  cancelValidator,
  rescheduleValidator,
};
