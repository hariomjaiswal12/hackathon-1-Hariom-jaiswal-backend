const express = require('express');
const paymentController = require('../controllers/payment.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  verifyPaymentValidator,
  refundPaymentValidator,
  depositConfigValidator,
  listPaymentsValidator,
} = require('../validators/payment.validator');

const router = express.Router();
const operators = authorize(ROLES.STAFF, ROLES.ADMIN);

// Public route to inspect deposit requirements & policy
router.get('/config', paymentController.getDepositConfig);

// Admin-only deposit configuration
router.get(
  '/admin/config',
  authenticate,
  authorize(ROLES.ADMIN),
  paymentController.getDepositConfig
);
router.put(
  '/admin/config',
  authenticate,
  authorize(ROLES.ADMIN),
  depositConfigValidator,
  validate,
  paymentController.updateDepositConfig
);

// Payment operations
router.post(
  '/verify',
  authenticate,
  verifyPaymentValidator,
  validate,
  paymentController.verifyPayment
);
router.post(
  '/create-intent',
  authenticate,
  paymentController.createPaymentIntent
);
router.get(
  '/booking/:reference',
  authenticate,
  paymentController.getBookingPayment
);
router.post(
  '/:reference/refund',
  authenticate,
  operators,
  refundPaymentValidator,
  validate,
  paymentController.refundPayment
);
router.get(
  '/:reference',
  authenticate,
  paymentController.getPayment
);
router.get(
  '/',
  authenticate,
  operators,
  listPaymentsValidator,
  validate,
  paymentController.listPayments
);

module.exports = router;
