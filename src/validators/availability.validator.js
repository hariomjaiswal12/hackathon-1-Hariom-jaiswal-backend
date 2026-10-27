const { query } = require('express-validator');
const { isValidTime, parseCalendarDate } = require('../utils/calendar');

const availabilityValidator = [
  query('date')
    .exists()
    .withMessage('Date is required')
    .bail()
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
  query('time')
    .exists()
    .withMessage('Time is required')
    .bail()
    .custom((value) => isValidTime(value))
    .withMessage('Time must be HH:mm'),
  query('guests')
    .exists()
    .withMessage('Guests is required')
    .bail()
    .custom((value) => {
      if (!/^\d+$/.test(String(value))) {
        return false;
      }

      const guests = Number(value);
      return guests >= 1 && guests <= 100;
    })
    .withMessage('Guests must be a positive whole number'),
];

module.exports = {
  availabilityValidator,
};
