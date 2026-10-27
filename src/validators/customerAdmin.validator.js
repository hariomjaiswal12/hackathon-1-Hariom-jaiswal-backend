const { body, param, query } = require('express-validator');
const { BLACKLIST_STATUSES } = require('../constants/blacklist');

const FORBIDDEN_FIELDS = [
  'role',
  'password',
  'passwordHash',
  'isActive',
  'isBlacklisted',
  'noShowCount',
  'blacklistStatus',
  'blacklistReason',
  'blacklistedAt',
  'lastLoginAt',
  'createdAt',
  'updatedAt',
];

const listCustomersValidator = [
  query('q')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 80 })
    .withMessage('Search must be at most 80 characters'),
  query('blacklistStatus')
    .optional()
    .isIn(BLACKLIST_STATUSES)
    .withMessage('Blacklist status is not valid'),
  query('page')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Page must be a positive number')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

const customerIdValidator = [
  param('id').isMongoId().withMessage('Customer id must be valid'),
];

const updateCustomerValidator = [
  ...customerIdValidator,
  ...FORBIDDEN_FIELDS.map((field) => body(field).custom((_value, { req }) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      throw new Error(`${field} cannot be changed here`);
    }
    return true;
  })),
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be between 2 and 80 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Email must be valid')
    .normalizeEmail(),
  body('phone')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone must be at most 20 characters'),
  body().custom((value) => {
    const hasEdit = ['name', 'email', 'phone'].some((field) => Object.prototype.hasOwnProperty.call(value || {}, field));
    if (!hasEdit) {
      throw new Error('A name, email, or phone is required');
    }
    return true;
  }),
];

module.exports = {
  listCustomersValidator,
  customerIdValidator,
  updateCustomerValidator,
};
