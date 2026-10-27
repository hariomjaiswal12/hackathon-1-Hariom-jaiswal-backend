const { body, param, query } = require('express-validator');
const { parseCalendarDate } = require('../utils/calendar');

const createClosedDayValidator = [
  body('date')
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
  body('reason')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Reason must be between 2 and 200 characters'),
];

const closedDayDateValidator = [
  param('date')
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
];

const updateClosedDayValidator = [
  param('id').isMongoId().withMessage('Closed day id must be valid'),
  body().custom((value) => {
    if (value.reason === undefined && value.isActive === undefined) {
      throw new Error('A reason or isActive value is required');
    }

    return true;
  }),
  body('reason')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Reason must be between 2 and 200 characters'),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false'),
];

const listClosedDaysValidator = [
  query('isActive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isActive must be true or false'),
];

module.exports = {
  createClosedDayValidator,
  closedDayDateValidator,
  updateClosedDayValidator,
  listClosedDaysValidator,
};
