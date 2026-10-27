const { body, param, query } = require('express-validator');
const { DEPOSIT_TYPES, PAYMENT_STATUSES } = require('../constants/payments');

const verifyPaymentValidator = [
  body('paymentReference')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Payment reference is required'),
  body('providerSignature')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Provider signature or payment token is required'),
  body('providerPaymentId')
    .optional()
    .isString()
    .trim(),
  body('providerOrderId')
    .optional()
    .isString()
    .trim(),
];

const refundPaymentValidator = [
  param('reference')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Payment reference is required'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Refund reason must be at most 200 characters'),
];

const depositConfigValidator = [
  body('enabled')
    .optional()
    .isBoolean()
    .withMessage('Enabled must be a boolean'),
  body('type')
    .optional()
    .isIn(DEPOSIT_TYPES)
    .withMessage(`Type must be one of: ${DEPOSIT_TYPES.join(', ')}`),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a non-negative number'),
  body('currency')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter currency code (e.g. EUR)'),
  body('minGuests')
    .optional()
    .isInt({ min: 1 })
    .withMessage('minGuests must be an integer >= 1'),
  body('refundCutoffHours')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('refundCutoffHours must be a non-negative number'),
];

const listPaymentsValidator = [
  query('status')
    .optional()
    .isIn(PAYMENT_STATUSES)
    .withMessage(`Status must be one of: ${PAYMENT_STATUSES.join(', ')}`),
  query('bookingReference')
    .optional()
    .isString()
    .trim(),
];

module.exports = {
  verifyPaymentValidator,
  refundPaymentValidator,
  depositConfigValidator,
  listPaymentsValidator,
};
