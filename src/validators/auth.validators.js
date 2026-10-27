const { body } = require('express-validator');

const emailAddress = body('email')
  .trim()
  .notEmpty()
  .withMessage('Email is required')
  .isEmail()
  .withMessage('Email must be valid')
  .normalizeEmail({
    gmail_remove_dots: false,
    gmail_remove_subaddress: false,
    outlookdotcom_remove_subaddress: false,
    yahoo_remove_subaddress: false,
    icloud_remove_subaddress: false,
  });

const registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be between 2 and 80 characters'),
  emailAddress,
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 7, max: 20 })
    .withMessage('Phone must be between 7 and 20 characters')
    .matches(/^[0-9+\-()\s]+$/)
    .withMessage('Phone contains invalid characters'),
  body('password')
    .isString()
    .withMessage('Password is required')
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be between 8 and 72 characters'),
];

const loginValidator = [
  emailAddress,
  body('password')
    .isString()
    .withMessage('Password is required')
    .notEmpty()
    .withMessage('Password is required'),
];

module.exports = {
  registerValidator,
  loginValidator,
};
