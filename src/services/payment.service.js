const crypto = require('crypto');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Table = require('../models/Table');
const ApiError = require('../utils/ApiError');
const HTTP_STATUS = require('../constants/httpStatus');
const ERROR_CODES = require('../constants/errorCodes');
const { ROLES } = require('../constants/roles');
const {
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  PAYMENT_PROVIDER,
  DEPOSIT_STATUS,
} = require('../constants/payments');
const { BOOKING_STATUS, BOOKING_HISTORY_ACTION } = require('../constants/bookings');
const { getPaymentProvider } = require('./payment');
const { resolvedTableIds } = require('./bookingConflict.service');
const { publishBooking, publishToUser } = require('./realtime.service');
const { REALTIME_EVENT } = require('../constants/realtime');
const { NOTIFICATION_TYPE } = require('../constants/notifications');
const logger = require('../utils/logger');

function generatePaymentReference() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PAY-${year}${month}${day}-${suffix}`;
}

function presentPayment(payment) {
  if (!payment) return null;
  const plain = payment.toObject ? payment.toObject() : payment;

  return {
    id: String(plain.id || plain._id),
    paymentReference: plain.paymentReference,
    bookingReference: plain.bookingReference,
    bookingId: String(plain.bookingId),
    customerId: String(plain.customerId),
    amount: plain.amount,
    currency: plain.currency,
    provider: plain.provider,
    providerOrderId: plain.providerOrderId,
    providerPaymentId: plain.providerPaymentId,
    status: plain.status,
    type: plain.type,
    paidAt: plain.paidAt,
    refundedAt: plain.refundedAt,
    refundAmount: plain.refundAmount,
    refundReason: plain.refundReason,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

function assertPaymentAccess(actor, payment) {
  if (actor.role === ROLES.CUSTOMER && String(payment.customerId) !== String(actor.id)) {
    throw ApiError.notFound('Payment not found');
  }
}

async function createOrGetPaymentIntent({ booking, actor, idempotencyKey }) {
  if (actor.role === ROLES.CUSTOMER && String(booking.customerId) !== String(actor.id)) {
    throw ApiError.forbidden('You do not have access to this booking');
  }

  // Idempotency: check if payment already exists for this booking
  let existingPayment = await Payment.findOne({
    bookingId: booking._id || booking.id,
  });

  const provider = getPaymentProvider(PAYMENT_PROVIDER.DEV_SIMULATED);

  if (existingPayment) {
    if (existingPayment.status === PAYMENT_STATUS.PAID) {
      return {
        payment: presentPayment(existingPayment),
        order: null,
        isPaid: true,
      };
    }

    // Refresh provider order for pending payment
    const providerOrder = await provider.createPaymentOrder({
      paymentReference: existingPayment.paymentReference,
      amount: existingPayment.amount,
      currency: existingPayment.currency,
      metadata: { bookingReference: existingPayment.bookingReference },
    });

    existingPayment.providerOrderId = providerOrder.providerOrderId;
    await existingPayment.save();

    return {
      payment: presentPayment(existingPayment),
      order: providerOrder,
      isPaid: false,
    };
  }

  // Allocate reference and create payment order
  const paymentReference = generatePaymentReference();
  const amount = Number(booking.depositAmount) || 0;
  const currency = 'EUR';

  const providerOrder = await provider.createPaymentOrder({
    paymentReference,
    amount,
    currency,
    metadata: { bookingReference: booking.bookingReference },
  });

  const payment = await Payment.create({
    paymentReference,
    bookingReference: booking.bookingReference,
    bookingId: booking._id || booking.id,
    customerId: booking.customerId,
    amount,
    currency,
    provider: provider.name,
    providerOrderId: providerOrder.providerOrderId,
    status: PAYMENT_STATUS.PENDING,
    type: PAYMENT_TYPE.BOOKING_DEPOSIT,
    idempotencyKey: idempotencyKey || `${booking.bookingReference}:deposit`,
  });

  // Link payment reference to booking if not linked
  await Booking.updateOne(
    { _id: booking._id || booking.id },
    { $set: { paymentReference, depositStatus: DEPOSIT_STATUS.PENDING } }
  );

  return {
    payment: presentPayment(payment),
    order: providerOrder,
    isPaid: false,
  };
}

async function verifyPayment({
  paymentReference,
  providerPaymentId,
  providerOrderId,
  providerSignature,
  actor,
}) {
  const cleanRef = String(paymentReference || '').trim().toUpperCase();
  const payment = await Payment.findOne({ paymentReference: cleanRef });

  if (!payment) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment not found', ERROR_CODES.PAYMENT_NOT_FOUND);
  }

  assertPaymentAccess(actor, payment);

  const booking = await Booking.findById(payment.bookingId);
  if (!booking) {
    throw ApiError.notFound('Associated booking not found');
  }

  // Idempotency: if already paid, return safely without duplicate processing
  if (payment.status === PAYMENT_STATUS.PAID) {
    const tables = await Table.find({ _id: { $in: resolvedTableIds(booking) } });
    const bookingService = require('./booking.service');
    return {
      success: true,
      message: 'Payment already verified',
      payment: presentPayment(payment),
      booking: bookingService.presentBooking(booking, tables),
    };
  }

  if (payment.status === PAYMENT_STATUS.CANCELLED || payment.status === PAYMENT_STATUS.REFUNDED) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      `Cannot verify payment in ${payment.status} status`,
      ERROR_CODES.INVALID_BOOKING_STATE
    );
  }

  const provider = getPaymentProvider(payment.provider);
  const verifyResult = await provider.verifyPayment({
    paymentReference: payment.paymentReference,
    providerPaymentId,
    providerOrderId: providerOrderId || payment.providerOrderId,
    providerSignature,
    amount: payment.amount,
    currency: payment.currency,
  });

  if (!verifyResult || !verifyResult.verified) {
    payment.status = PAYMENT_STATUS.FAILED;
    await payment.save();

    booking.depositStatus = DEPOSIT_STATUS.FAILED;
    await booking.save();

    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      verifyResult?.reason || 'Payment verification failed with provider',
      ERROR_CODES.PAYMENT_VERIFICATION_FAILED
    );
  }

  // Update payment to PAID
  payment.status = PAYMENT_STATUS.PAID;
  payment.providerPaymentId = verifyResult.providerPaymentId;
  payment.paidAt = verifyResult.paidAt || new Date();
  await payment.save();

  // Authoritatively update booking
  const wasPending = booking.status === BOOKING_STATUS.PENDING;
  booking.depositStatus = DEPOSIT_STATUS.PAID;
  booking.paymentReference = payment.paymentReference;

  if (wasPending) {
    booking.status = BOOKING_STATUS.CONFIRMED;
    booking.history.push({
      action: BOOKING_HISTORY_ACTION.STATUS_CHANGED,
      fromStatus: BOOKING_STATUS.PENDING,
      toStatus: BOOKING_STATUS.CONFIRMED,
      actorId: actor.id,
      at: new Date(),
      reason: 'Deposit payment verified',
    });
  }
  await booking.save();

  const tables = await Table.find({ _id: { $in: resolvedTableIds(booking) } });
  const bookingService = require('./booking.service');
  const presentedBooking = bookingService.presentBooking(booking, tables);

  // Emit realtime events
  publishBooking(REALTIME_EVENT.BOOKING_CREATED, presentedBooking);
  publishToUser(payment.customerId, REALTIME_EVENT.PAYMENT_PAID, {
    paymentReference: payment.paymentReference,
    bookingReference: booking.bookingReference,
    amount: payment.amount,
    currency: payment.currency,
  });

  // Safe notification
  try {
    const { notifyBookingEvent } = require('./notification.service');
    await notifyBookingEvent(REALTIME_EVENT.BOOKING_CREATED, presentedBooking);
  } catch (notifyErr) {
    logger.error(`Notification after payment verification failed: ${notifyErr.message}`);
  }

  return {
    success: true,
    message: 'Deposit payment verified successfully',
    payment: presentPayment(payment),
    booking: presentedBooking,
  };
}

async function refundDeposit({ paymentReference, reason, actor, force = false }) {
  const cleanRef = String(paymentReference || '').trim().toUpperCase();
  const payment = await Payment.findOne({ paymentReference: cleanRef });

  if (!payment) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment not found', ERROR_CODES.PAYMENT_NOT_FOUND);
  }

  if (actor.role === ROLES.CUSTOMER && !force) {
    throw ApiError.forbidden('Only staff or administrators can issue manual refunds');
  }

  if (payment.status === PAYMENT_STATUS.REFUNDED) {
    return presentPayment(payment);
  }

  if (payment.status !== PAYMENT_STATUS.PAID) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `Cannot refund payment in ${payment.status} status`,
      ERROR_CODES.REFUND_FAILED
    );
  }

  const provider = getPaymentProvider(payment.provider);
  const refundResult = await provider.refundPayment({
    providerPaymentId: payment.providerPaymentId,
    amount: payment.amount,
    currency: payment.currency,
    reason,
  });

  payment.status = PAYMENT_STATUS.REFUNDED;
  payment.refundedAt = refundResult.refundedAt || new Date();
  payment.refundAmount = payment.amount;
  payment.refundReason = reason || 'Reservation deposit refund';
  await payment.save();

  // Update booking deposit status
  const booking = await Booking.findById(payment.bookingId);
  if (booking) {
    booking.depositStatus = DEPOSIT_STATUS.REFUNDED;
    await booking.save();
  }

  publishToUser(payment.customerId, REALTIME_EVENT.PAYMENT_REFUNDED, {
    paymentReference: payment.paymentReference,
    bookingReference: payment.bookingReference,
    refundAmount: payment.amount,
    currency: payment.currency,
  });

  return presentPayment(payment);
}

async function getPaymentByReference(paymentReference, actor) {
  const cleanRef = String(paymentReference || '').trim().toUpperCase();
  const payment = await Payment.findOne({ paymentReference: cleanRef });

  if (!payment) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment not found', ERROR_CODES.PAYMENT_NOT_FOUND);
  }

  assertPaymentAccess(actor, payment);
  return presentPayment(payment);
}

async function getPaymentForBooking(bookingReference, actor) {
  const cleanRef = String(bookingReference || '').trim().toUpperCase();
  const payment = await Payment.findOne({ bookingReference: cleanRef });

  if (!payment) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, 'No payment found for this booking', ERROR_CODES.PAYMENT_NOT_FOUND);
  }

  assertPaymentAccess(actor, payment);
  return presentPayment(payment);
}

async function listPayments({ query, actor }) {
  const filter = {};

  if (actor.role === ROLES.CUSTOMER) {
    filter.customerId = actor.id;
  } else if (query.customerId) {
    filter.customerId = query.customerId;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.bookingReference) {
    filter.bookingReference = String(query.bookingReference).trim().toUpperCase();
  }

  const payments = await Payment.find(filter).sort({ createdAt: -1 }).limit(100);
  return payments.map(presentPayment);
}

module.exports = {
  presentPayment,
  createOrGetPaymentIntent,
  verifyPayment,
  refundDeposit,
  getPaymentByReference,
  getPaymentForBooking,
  listPayments,
};
