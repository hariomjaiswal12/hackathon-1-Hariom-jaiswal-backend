# TXOTX OS — Phase 17 Deposit Payment System Report

## 1. Executive Summary

Phase 17 introduces a restaurant-level **Deposit Payment System** to TXOTX OS. The system enables the restaurant to configure deposit requirements (fixed fee or percentage per guest), enforce server-authoritative payment intents, verify transactions securely via provider abstractions, and handle automated policy-based refunds upon cancellation.

Crucially:
- The **Backend is the sole source of truth** for all payment states and booking confirmations.
- The **Booking model** remains the authoritative source for reservation status; the **Payment model** manages transactional ledgers and provider interactions.
- When deposit requirements are disabled (`depositConfig.enabled = false`), the booking lifecycle runs 100% identically to previous phases with zero friction.
- When deposit requirements are active, eligible reservations are created in `PENDING` status with a locked table reservation and a server-generated payment intent. A booking only transitions to `CONFIRMED` upon cryptographic verification from the payment provider.

---

## 2. Architecture & Provider Abstraction

The payment layer is decoupled from underlying payment gateways using an abstract provider pattern:

```
                  ┌──────────────────────┐
                  │    BookingService    │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │    PaymentService    │
                  └──────────┬───────────┘
                             │
               ┌─────────────┴─────────────┐
               │                           │
    ┌──────────▼──────────┐     ┌──────────▼──────────┐
    │  PaymentProvider    │     │ DepositConfigService │
    │    (Base Class)     │     └─────────────────────┘
    └──────────┬──────────┘
               │
   ┌───────────┴───────────┐
   │                       │
┌──▼──────────────────┐ ┌──▼──────────────────┐
│ DevPaymentProvider  │ │ (Stripe / Razorpay) │
│ (Development-safe)  │ │   (Future plugin)   │
└─────────────────────┘ └─────────────────────┘
```

### Files Implemented:
- `backendtask1/src/constants/payments.js`: Standard enums for `PAYMENT_STATUS`, `PAYMENT_TYPE`, `PAYMENT_PROVIDER`, `DEPOSIT_TYPE`, and `DEPOSIT_STATUS`.
- `backendtask1/src/services/payment/PaymentProvider.js`: Base class defining `createOrder()`, `verifyPayment()`, and `refund()`.
- `backendtask1/src/services/payment/DevPaymentProvider.js`: Development-safe provider implementing HMAC-SHA256 signature generation and timing-safe equality verification.
- `backendtask1/src/services/payment/index.js`: Factory resolver `getPaymentProvider(providerName)`.
- `backendtask1/src/services/depositConfig.service.js`: Singleton configuration management and dynamic deposit calculation.
- `backendtask1/src/services/payment.service.js`: Core payment lifecycle, anti-tampering verification, idempotent processing, and automated refund dispatcher.

---

## 3. Data Models

### 3.1 DepositConfig (`backendtask1/src/models/DepositConfig.js`)
Configured at the restaurant level by administrators:
- `enabled`: Boolean toggle (defaults to `false`).
- `type`: `FIXED` (flat charge per booking) or `PER_GUEST` (charge multiplied by guest count).
- `amount`: Monetary value in currency units (e.g. 15.00 EUR).
- `currency`: Default `EUR`.
- `minGuests`: Minimum party size before a deposit is triggered (e.g. 4+ guests).
- `refundCutoffHours`: Cancellation notice window for automated refunds (default 24 hours).

### 3.2 Payment (`backendtask1/src/models/Payment.js`)
Server-authoritative ledger record:
- `paymentReference`: Unique identifier generated on backend (`PAY-YYYYMMDD-XXXXXX`).
- `bookingReference`: Associated booking reference (`TX-YYYYMMDD-XXXXXX`).
- `bookingId`: ObjectId reference to Booking.
- `customerId`: ObjectId reference to User.
- `amount`: Verified decimal deposit amount.
- `currency`: ISO currency code (`EUR`).
- `provider`: `DEV_SIMULATED`, `STRIPE`, `RAZORPAY`.
- `providerOrderId`: Gateway order identifier (`dev_order_...`).
- `providerPaymentId`: Gateway settlement identifier (`dev_pay_...`).
- `status`: `CREATED`, `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED`.
- `type`: `BOOKING_DEPOSIT`.
- `refundAmount`, `refundedAt`, `refundReason`: Audit fields for refunds.

### 3.3 Booking Updates (`backendtask1/src/models/Booking.js`)
Safe non-sensitive deposit fields added to reservations:
- `depositRequired`: Boolean.
- `depositAmount`: Number.
- `depositStatus`: `NOT_REQUIRED`, `PENDING`, `PAID`, `REFUNDED`.
- `paymentReference`: Reference string linking the active transaction.

---

## 4. Payment & Booking Lifecycle Flow

```
1. Customer initiates booking (Step 5)
   │
   ▼
2. POST /api/v1/bookings
   ├─ If deposit NOT required:
   │  └─ status: CONFIRMED, depositStatus: NOT_REQUIRED (Immediate confirmation)
   │
   └─ If deposit IS required:
      ├─ Calculate depositAmount based on DepositConfig (type & minGuests)
      ├─ Reserve table with status: PENDING
      ├─ Create Payment ledger record with status: PENDING
      ├─ Create gateway order via PaymentProvider
      └─ Return { booking, payment: { paymentReference, orderId, amount, currency, ... } }
         │
         ▼
3. Frontend presents Payment Checkout sandbox
   │ Customer completes payment interaction
   ▼
4. POST /api/v1/payments/verify
   ├─ Validate payload & authenticate user
   ├─ Fetch Payment & verify customerId ownership
   ├─ Check idempotency: If already PAID, return 200 with existing confirmation
   ├─ PaymentProvider cryptographically verifies provider signature / tokens
   ├─ Transition Payment status -> PAID, record providerPaymentId & paidAt
   ├─ Transition Booking status -> CONFIRMED, depositStatus -> PAID
   ├─ Emit Realtime Event: `payment:paid` & `floor:update`
   ├─ Dispatch Customer Notification: `DEPOSIT_PAID`
   └─ Return 200 { payment, booking }
```

---

## 5. Security & Verification Engine

1. **Anti-Tampering**:
   - The browser cannot dictate the deposit amount or status.
   - Provider signatures are computed using HMAC-SHA256 with a server secret (`dev_order_id|dev_payment_id`).
   - Length-checked, constant-time comparison (`crypto.timingSafeEqual`) eliminates timing attack vectors.
2. **Customer Isolation**:
   - A customer cannot verify a payment or claim a booking belonging to another user (`AUTHORIZATION_ERROR`).
3. **Double-Payment & Replay Prevention**:
   - Verification is strictly idempotent. Repeated calls for an already settled payment return HTTP 200 with the confirmed records without duplicating notifications or re-triggering state changes.
4. **Table Collision Immunity**:
   - `BOOKING_STATUS.PENDING` is part of `ACTIVE_BOOKING_STATUSES`, ensuring the selected table cannot be sniped or double-booked during the customer's checkout window.

---

## 6. Cancellation & Automated Refund Policy

When a customer or staff cancels an existing reservation (`PATCH /api/v1/bookings/:reference/cancel`):
1. The backend inspects `booking.depositStatus`.
2. If `PAID`, the cancellation engine calculates hours remaining until the booking's `bookingDate` and `startTime`.
3. If `hoursNotice >= config.refundCutoffHours`:
   - `PaymentService.refundDeposit()` executes a provider refund.
   - Payment status transitions to `REFUNDED`.
   - Booking `depositStatus` transitions to `REFUNDED`.
   - Audit logs capture `refundAmount` and `refundReason: "Cancellation before cutoff"`.
   - Realtime event `payment:refunded` and customer notification `DEPOSIT_REFUNDED` are dispatched.
4. If `hoursNotice < config.refundCutoffHours`:
   - Booking is cancelled, but deposit is retained according to restaurant policy (`refundReason: "Deposit forfeited - late cancellation"`).

---

## 7. Frontend Integration

1. **Public Booking Widget (`BookingSection.tsx`)**:
   - Fetches active deposit policy on mount (`GET /api/v1/deposit/config`).
   - Dynamic step-level messaging in Step 3 (Guest Selection) and Step 5 (Details Review) showing exact required deposit.
   - Integrated sandbox payment checkout modal when booking creation returns `PENDING`.
   - Direct authoritative verification call to `paymentService.verifyPayment()`.
   - Confirmation step displaying deposit reference and paid amount.
2. **Customer Dashboard (`DashboardPage.tsx`)**:
   - Added visual badges for deposit status (`Paid`, `Refunded`, `Pending Deposit`).
   - Drawer details displaying deposit reference and amount.
   - Cancellation modal with automatic refund policy notice according to cutoff hours.
3. **Staff Floor Operations (`OperationsPage.tsx`)**:
   - Bookings table enhanced with `Deposit` column indicating status and amount.
4. **Admin Dashboard (`AdminDashboardPage.tsx` & `DepositPanel.tsx`)**:
   - New dedicated `DepositPanel` featuring:
     - Real-time policy configuration (enabled toggle, type selection, amount, party threshold, cutoff window).
     - Full transaction audit table with filterable payment status, customer ID, booking reference, and direct manual refund triggers.

---

## 8. Verification & QA Results

| Test Suite | Result | Details |
|---|---|---|
| **Phase 17 Deposit Check** (`scripts/phase17-deposit-check.js`) | **PASS (7/7)** | Config endpoints, PENDING booking flow, anti-tampering verification, replay prevention, cancellation refund, admin audit. |
| **Backend Critical Path Tests** (`npm test`) | **PASS (10/10)** | Auth, Tables, Schedule, Availability, Bookings & Concurrency, Waitlist, Notifications, Dashboard, Jobs, Sockets. |
| **Production Audit** (`npm run audit`) | **PASS (20/20)** | Health, Token issuance, Floor plan, Availability, Rescheduling, Cancellation, Sockets, Role isolation, Sensitive redaction. |
| **Blacklist Regression** (`scripts/blacklist-check.js`) | **PASS (22/22)** | No-show counters, automatic blacklisting, staff overrides, admin unblock. |
| **Frontend Production Build** (`npm run build`) | **PASS (Code 0)** | Clean TypeScript compilation (`tsc --noEmit`) and Vite bundle generation. |
