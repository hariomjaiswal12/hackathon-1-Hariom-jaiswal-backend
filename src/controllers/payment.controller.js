const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const depositConfigService = require('../services/depositConfig.service');
const paymentService = require('../services/payment.service');
const bookingService = require('../services/booking.service');

const getDepositConfig = asyncHandler(async (_req, res) => {
  const config = await depositConfigService.getDepositConfig();
  return ApiResponse.ok(res, 'Deposit configuration retrieved', { config });
});

const updateDepositConfig = asyncHandler(async (req, res) => {
  const config = await depositConfigService.updateDepositConfig({
    enabled: req.body.enabled,
    type: req.body.type,
    amount: req.body.amount,
    currency: req.body.currency,
    minGuests: req.body.minGuests,
    refundCutoffHours: req.body.refundCutoffHours,
    actor: req.user,
  });

  return ApiResponse.ok(res, 'Deposit configuration updated', { config });
});

const createPaymentIntent = asyncHandler(async (req, res) => {
  const { bookingReference, idempotencyKey } = req.body;
  const booking = await bookingService.getBooking({
    actor: req.user,
    bookingReference,
  });

  const intent = await paymentService.createOrGetPaymentIntent({
    booking,
    actor: req.user,
    idempotencyKey,
  });

  return ApiResponse.ok(res, 'Payment intent created', intent);
});

const verifyPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.verifyPayment({
    paymentReference: req.body.paymentReference,
    providerPaymentId: req.body.providerPaymentId,
    providerOrderId: req.body.providerOrderId,
    providerSignature: req.body.providerSignature,
    actor: req.user,
  });

  return ApiResponse.ok(res, result.message, {
    payment: result.payment,
    booking: result.booking,
  });
});

const getPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPaymentByReference(
    req.params.reference,
    req.user
  );

  return ApiResponse.ok(res, 'Payment retrieved', { payment });
});

const getBookingPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPaymentForBooking(
    req.params.reference,
    req.user
  );

  return ApiResponse.ok(res, 'Booking payment retrieved', { payment });
});

const refundPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.refundDeposit({
    paymentReference: req.params.reference,
    reason: req.body.reason,
    actor: req.user,
  });

  return ApiResponse.ok(res, 'Payment refunded successfully', { payment });
});

const listPayments = asyncHandler(async (req, res) => {
  const payments = await paymentService.listPayments({
    query: req.query,
    actor: req.user,
  });

  return ApiResponse.ok(res, 'Payments retrieved', { payments });
});

module.exports = {
  getDepositConfig,
  updateDepositConfig,
  createPaymentIntent,
  verifyPayment,
  getPayment,
  getBookingPayment,
  refundPayment,
  listPayments,
};
