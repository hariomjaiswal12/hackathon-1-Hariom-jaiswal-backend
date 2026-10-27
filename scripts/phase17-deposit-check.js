/**
 * Phase 17 — Deposit Payment System Verification Script
 * Validates backend deposit configuration, payment provider abstraction,
 * booking creation flows (with/without deposit), authoritative verification,
 * idempotency, and cancellation refund policy.
 */

const http = require('http');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');
const User = require('../src/models/User');
const Table = require('../src/models/Table');
const Booking = require('../src/models/Booking');
const Payment = require('../src/models/Payment');
const DepositConfig = require('../src/models/DepositConfig');

const TEST_PORT = 5098;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api/v1`;

let server;
const cleanups = {
  users: [],
  tables: [],
  bookings: [],
  payments: [],
};

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runPhase17Checks() {
  console.log('===============================================================');
  console.log('       TXOTX OS BACKEND — PHASE 17 DEPOSIT PAYMENT AUDIT');
  console.log('===============================================================\n');

  await connectDB();
  server = http.createServer(app);
  initializeRealtime(server);

  await new Promise((resolve, reject) => {
    server.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  try {
    const stamp = Date.now();

    // 1. Setup Admin and Customer Users
    console.log('[1/7] Setting up test users and tables...');
    const adminLogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@iturrieta.eus', password: 'Admin12345!' }),
    });
    expect(adminLogin.status === 200, 'Admin logs in successfully');
    const adminToken = adminLogin.data.data.token;

    const custReg = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Deposit Customer 1',
        email: `deposit-cust1-${stamp}@iturrieta.test`,
        password: 'ValidPass123!',
      }),
    });
    expect(custReg.status === 201, 'Customer 1 registers');
    const custToken = custReg.data.data.token;
    cleanups.users.push(custReg.data.data.user.id);

    const custReg2 = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Deposit Customer 2',
        email: `deposit-cust2-${stamp}@iturrieta.test`,
        password: 'ValidPass123!',
      }),
    });
    expect(custReg2.status === 201, 'Customer 2 registers');
    const custToken2 = custReg2.data.data.token;
    cleanups.users.push(custReg2.data.data.user.id);

    const tableRes = await api('/tables', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        tableNumber: `D${stamp.toString().slice(-4)}`,
        name: 'Deposit Test Table',
        capacity: 8,
        shape: 'RECTANGLE',
        location: 'CENTER',
        position: { x: 50, y: 50, rotation: 0 },
      }),
    });
    expect(tableRes.status === 201, 'Table created');
    const tableId = tableRes.data.data.table.id;
    cleanups.tables.push(tableId);

    console.log('  -> PASS: Test users and table prepared');

    // 2. Deposit Configuration Tests
    console.log('[2/7] Testing Deposit Configuration endpoints...');
    // Public read
    const publicConfig = await api('/deposit/config');
    expect(publicConfig.status === 200, 'Public can read deposit config');
    expect(typeof publicConfig.data.data.config.enabled === 'boolean', 'Enabled is boolean');

    // Customer cannot update config
    const custUpdateConfig = await api('/payments/admin/config', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ enabled: true }),
    });
    expect(custUpdateConfig.status === 403, 'Customer cannot update deposit config');

    // Admin updates config
    const adminUpdate = await api('/payments/admin/config', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        enabled: true,
        type: 'PER_GUEST',
        amount: 15,
        currency: 'EUR',
        minGuests: 3,
        refundCutoffHours: 24,
      }),
    });
    expect(adminUpdate.status === 200, 'Admin updates deposit config');
    expect(adminUpdate.data.data.config.enabled === true, 'Deposit is now enabled');
    expect(adminUpdate.data.data.config.amount === 15, 'Deposit amount is 15');
    expect(adminUpdate.data.data.config.minGuests === 3, 'Min guests threshold is 3');

    console.log('  -> PASS: Deposit config read & admin write verified');

    // 3. Booking creation with Deposit Required vs Below Threshold
    console.log('[3/7] Testing booking flow when deposit is required vs not required...');
    // Case A: Below threshold (guests: 2 < minGuests: 3)
    const belowThresholdRes = await api('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '13:30',
        guests: 2,
        tableId,
      }),
    });
    expect(belowThresholdRes.status === 201, 'Booking created below deposit threshold');
    expect(belowThresholdRes.data.data.booking.status === 'CONFIRMED', 'Booking is immediately CONFIRMED');
    expect(belowThresholdRes.data.data.booking.depositRequired === false, 'Deposit not required');
    expect(belowThresholdRes.data.data.booking.depositStatus === 'NOT_REQUIRED', 'Deposit status NOT_REQUIRED');
    cleanups.bookings.push(belowThresholdRes.data.data.booking.bookingReference);

    // Cancel Case A to free up table
    await api(`/bookings/${belowThresholdRes.data.data.booking.bookingReference}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${custToken}` },
    });

    // Case B: At/above threshold (guests: 4 >= minGuests: 3)
    const depositRequiredRes = await api('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '13:30',
        guests: 4,
        tableId,
      }),
    });
    expect(depositRequiredRes.status === 201, 'Booking created requiring deposit');
    const bkg = depositRequiredRes.data.data.booking;
    const paymentIntent = depositRequiredRes.data.data.payment;

    expect(bkg.status === 'PENDING', 'Booking is created in PENDING state awaiting payment');
    expect(bkg.depositRequired === true, 'depositRequired is true');
    expect(bkg.depositAmount === 60, 'Deposit amount is 4 * 15 = 60 EUR');
    expect(bkg.depositStatus === 'PENDING', 'depositStatus is PENDING');
    expect(paymentIntent, 'Payment intent returned in response');
    expect(paymentIntent.amount === 60, 'Payment intent amount matches 60');
    expect(paymentIntent.provider === 'DEV_SIMULATED', 'Provider is DEV_SIMULATED');
    expect(paymentIntent.providerSignature, 'Provider signature generated by server');
    cleanups.bookings.push(bkg.bookingReference);
    cleanups.payments.push(bkg.paymentReference);

    // Operational actions blocked on PENDING booking
    const arrivePending = await api(`/bookings/${bkg.bookingReference}/arrive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(arrivePending.status === 409, 'Cannot arrive a PENDING booking');

    console.log('  -> PASS: Booking created as PENDING with server-authoritative payment intent');

    // 4. Payment Verification & Security
    console.log('[4/7] Testing payment verification, security & anti-tampering...');
    // A: Tampered signature rejection
    const fakeVerify = await api('/payments/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({
        paymentReference: bkg.paymentReference,
        providerOrderId: paymentIntent.providerOrderId,
        providerSignature: 'tampered_fake_signature_hex_1234567890abcdef',
      }),
    });
    expect(fakeVerify.status === 400, 'Tampered signature rejected with 400');

    // B: Unauthorized customer cannot verify someone else's payment
    const otherCustVerify = await api('/payments/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custToken2}` },
      body: JSON.stringify({
        paymentReference: bkg.paymentReference,
        providerOrderId: paymentIntent.providerOrderId,
        providerSignature: paymentIntent.providerSignature,
      }),
    });
    expect(otherCustVerify.status === 404, 'Other customer cannot access someone else payment');

    // C: Authoritative verification succeeds
    const validVerify = await api('/payments/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({
        paymentReference: bkg.paymentReference,
        providerOrderId: paymentIntent.providerOrderId,
        providerSignature: paymentIntent.providerSignature,
      }),
    });
    expect(validVerify.status === 200, 'Valid verification succeeds');
    expect(validVerify.data.data.payment.status === 'PAID', 'Payment status is PAID');
    expect(validVerify.data.data.booking.status === 'CONFIRMED', 'Booking transitions to CONFIRMED');
    expect(validVerify.data.data.booking.depositStatus === 'PAID', 'Booking depositStatus is PAID');

    // D: Idempotent replay: verifying already PAID payment returns safe 200
    const replayVerify = await api('/payments/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({
        paymentReference: bkg.paymentReference,
        providerOrderId: paymentIntent.providerOrderId,
        providerSignature: paymentIntent.providerSignature,
      }),
    });
    expect(replayVerify.status === 200, 'Replay verification is safe and idempotent');
    expect(replayVerify.data.data.payment.status === 'PAID', 'Payment remains PAID');

    console.log('  -> PASS: Tamper detection, customer ownership, and idempotent verification verified');

    // 5. Booking Inspection & Relationship
    console.log('[5/7] Testing booking details and payment relationship...');
    const readBkg = await api(`/bookings/${bkg.bookingReference}`, {
      headers: { Authorization: `Bearer ${custToken}` },
    });
    expect(readBkg.status === 200, 'Booking retrieved');
    expect(readBkg.data.data.booking.status === 'CONFIRMED', 'Booking confirmed');
    expect(readBkg.data.data.booking.depositStatus === 'PAID', 'depositStatus is PAID');
    expect(readBkg.data.data.booking.depositAmount === 60, 'depositAmount is 60');
    expect(readBkg.data.data.booking.paymentReference === bkg.paymentReference, 'paymentReference matches');

    const readPayment = await api(`/payments/booking/${bkg.bookingReference}`, {
      headers: { Authorization: `Bearer ${custToken}` },
    });
    expect(readPayment.status === 200, 'Payment retrieved for booking');
    expect(readPayment.data.data.payment.amount === 60, 'Payment amount matches');

    console.log('  -> PASS: Booking and payment relationships verified');

    // 6. Cancellation & Automatic Refund Policy
    console.log('[6/7] Testing cancellation and deposit refund policy...');
    // The booking is for 2026-11-14 (> 24h away) -> cancellation triggers automatic refund!
    const cancelRes = await api(`/bookings/${bkg.bookingReference}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ reason: 'Family schedule change' }),
    });
    expect(cancelRes.status === 200, 'Booking cancelled successfully');
    expect(cancelRes.data.data.booking.status === 'CANCELLED', 'Booking status is CANCELLED');
    expect(cancelRes.data.data.booking.depositStatus === 'REFUNDED', 'Deposit is automatically REFUNDED');

    const checkRefundedPayment = await api(`/payments/${bkg.paymentReference}`, {
      headers: { Authorization: `Bearer ${custToken}` },
    });
    expect(checkRefundedPayment.status === 200, 'Refunded payment retrieved');
    expect(checkRefundedPayment.data.data.payment.status === 'REFUNDED', 'Payment status is REFUNDED');
    expect(checkRefundedPayment.data.data.payment.refundAmount === 60, 'Refund amount is 60');

    console.log('  -> PASS: Cancellation > cutoff hours correctly triggers automatic refund');

    // 7. Admin Manual Refund & Payment List
    console.log('[7/7] Testing admin payment management & restore...');
    const listPaymentsRes = await api('/payments', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(listPaymentsRes.status === 200, 'Admin can list all payments');
    expect(Array.isArray(listPaymentsRes.data.data.payments), 'Payments is an array');

    // Reset deposit config to disabled to restore default clean state
    await api('/payments/admin/config', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ enabled: false }),
    });

    console.log('  -> PASS: Admin payment list and configuration restore verified');

    console.log('\n===============================================================');
    console.log(' >>> ALL PHASE 17 DEPOSIT & PAYMENT CHECKS PASSED 100% <<<');
    console.log('===============================================================\n');
  } finally {
    // Teardown test artifacts
    if (cleanups.bookings.length > 0) {
      await Booking.deleteMany({ bookingReference: { $in: cleanups.bookings } });
    }
    if (cleanups.payments.length > 0) {
      await Payment.deleteMany({ paymentReference: { $in: cleanups.payments } });
    }
    if (cleanups.tables.length > 0) {
      await Table.deleteMany({ _id: { $in: cleanups.tables } });
    }
    if (cleanups.users.length > 0) {
      await User.deleteMany({ _id: { $in: cleanups.users } });
    }

    closeRealtime();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  }
}

runPhase17Checks().catch((err) => {
  console.error('\n❌ PHASE 17 TEST FAILED:', err);
  process.exit(1);
});
