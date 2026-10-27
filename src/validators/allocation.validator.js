const { query } = require('express-validator');
const { availabilityValidator } = require('./availability.validator');
const { TABLE_LOCATIONS, TABLE_SHAPES } = require('../constants/tables');

const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REJECTED_FIELDS = ['tableId', 'bookingReference', 'customerId', 'status'];

function rejectAllocationField(field) {
  return query(field).custom((_value, { req }) => {
    if (Object.prototype.hasOwnProperty.call(req.query || {}, field)) {
      throw new Error(`${field} cannot be used to request a recommendation`);
    }

    return true;
  });
}

const allocationValidator = [
  ...availabilityValidator,
  ...REJECTED_FIELDS.map(rejectAllocationField),
  query('location').optional().isIn(TABLE_LOCATIONS).withMessage('Location is not valid'),
  query('shape').optional().isIn(TABLE_SHAPES).withMessage('Shape is not valid'),
  query('tag')
    .optional()
    .custom((value) => TAG_PATTERN.test(String(value).trim().toLowerCase()))
    .withMessage('Tag is not valid'),
];

module.exports = {
  allocationValidator,
};
