const { body, param, query } = require('express-validator');
const { BLACKLIST_STATUSES } = require('../constants/blacklist');

const userIdParam = param('userId').isMongoId().withMessage('Customer id must be valid');

const listBlacklistValidator = [
  query('blacklistStatus')
    .optional()
    .isIn(BLACKLIST_STATUSES)
    .withMessage('Blacklist status is not valid'),
  query('minNoShowCount')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum no-show count must be a whole number')
    .toInt(),
];

const getBlacklistValidator = [userIdParam];

const blacklistCustomerValidator = [
  userIdParam,
  body('reason')
    .isString()
    .withMessage('Reason is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Reason is required')
    .isLength({ max: 200 })
    .withMessage('Reason must be at most 200 characters'),
];

const unblockBlacklistValidator = [userIdParam];

module.exports = {
  listBlacklistValidator,
  getBlacklistValidator,
  blacklistCustomerValidator,
  unblockBlacklistValidator,
};
