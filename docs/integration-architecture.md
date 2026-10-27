# TXOTX OS — External Booking Channel Architecture

## 1. Overview & Single Source of Truth Principle

Phase 19 establishes the backend architecture for external booking channels (Phone, WhatsApp, and future Retell voice agent) while guaranteeing that the **existing TXOTX OS booking engine remains the sole authoritative source of truth**.

Under no circumstances does this architecture:
- Duplicate booking logic or availability algorithms
- Bypass schedule validation, closed days, table capacity limits, table conflict detection, group booking rules (max 3 tables), or active booking locks
- Bypass customer no-show blacklist enforcement (Phase 16)
- Bypass deposit and payment requirements (Phase 17)
- Bypass operational Socket.io events and customer in-app notifications

All external channels interface through a normalized service boundary (`ExternalBookingService` / `src/services/channel`) that translates external requests and invokes existing core backend services.

---

## 2. Integration Authentication & Webhook Security

External server-to-server requests are secured using cryptographic HMAC SHA-256 signatures over the exact raw request payload:

- **Environment Variable**: `INTEGRATION_WEBHOOK_SECRET`
- **Request Header**: `X-Integration-Signature`
- **Verification Middleware**: `src/services/channel/webhook.js` (`verifyIntegrationRequest`)

### Security Guarantees:
1. **Raw Body Verification**: The signature is computed directly from `req.rawBody` using HMAC SHA-256.
2. **Timing-Attack Resistance**: Verification uses length-checked `crypto.timingSafeEqual` to avoid side-channel timing leaks.
3. **Strict Rejection**: Missing, empty, or mismatched signatures immediately abort execution with `401 Unauthorized` (`AUTHENTICATION_ERROR`).
4. **Secret Protection**: `INTEGRATION_WEBHOOK_SECRET` is never logged, never exposed via API endpoints, and never included in error messages.

---

## 3. Persistent Database Idempotency

External networks and telephony agents frequently retry requests. To prevent duplicate reservations and race conditions, the integration layer features database-backed idempotency using the `IntegrationEvent` MongoDB collection:

- **Header**: `Idempotency-Key` (1–200 characters)
- **Model**: `src/models/IntegrationEvent.js`
- **Engine**: `src/services/channel/idempotency.js` (`runIdempotent`)

### Concurrency & Replay Semantics:
1. **Initial Request**: Creates an `IntegrationEvent` record with status `RECEIVED`. Upon successful execution of the booking engine, the event is updated to `PROCESSED` with the serialized booking payload.
2. **Sequential Replay**: Subsequent requests with the same `Idempotency-Key` return `200 OK` with the exact cached booking data.
3. **Concurrent Duplicates (Race Conditions)**: When concurrent requests arrive simultaneously with the same key, the database unique index on `idempotencyKey` triggers. The secondary request waits on the in-flight event and returns the resolved booking once complete, guaranteeing that only a single booking is created in the database.

---

## 4. External Customer Resolution

The `CustomerResolutionService` (`src/services/channel/customers.js`) resolves customer identities safely:

- **Supported Identifiers**: `customerId`, `email`, or `phone`.
- **RBAC Enforcement**: New customers created via external channels are **strictly assigned role `CUSTOMER`**.
- **Privilege Escalation Prevention**: External channels cannot create or assign `STAFF` or `ADMIN` roles. Attempting to pass `role: 'STAFF'` is rejected with `400 VALIDATION_ERROR`.
- **Non-Customer Isolation**: Providing the `customerId` of an administrator or staff member is blocked with `403 Forbidden`.
- **Password Security**: New customer accounts are provisioned with secure, random cryptographic entropy (`crypto.randomBytes(24)`). Passwords and password hashes are never returned to the caller.

---

## 5. Booking Source Mapping

TXOTX OS supports the following canonical booking sources:
- `WEBSITE`
- `PHONE`
- `WHATSAPP`
- `STAFF`
- `ADMIN`

### Retell Voice Agent Decision:
Retell voice bookings map to **`PHONE`** (`BOOKING_SOURCE.PHONE`). 

**Architectural Rationale**: Retell acts as an automated conversational voice assistant operating over incoming telephony lines. Mapping Retell to `PHONE` preserves full backward compatibility across operational dashboards, hourly demand analytics, meal period aggregators, and staff floor views without fragmenting phone-based demand metrics.

WhatsApp requests map to **`WHATSAPP`** (`BOOKING_SOURCE.WHATSAPP`).

---

## 6. External Booking Endpoints

All external channel endpoints are mounted under `/api/v1/integrations`:

### 6.1 Create Booking (`POST /api/v1/integrations/bookings`)
- **Headers**: `X-Integration-Signature`, `Idempotency-Key`
- **Payload**:
  ```json
  {
    "channel": "phone",
    "customer": { "name": "Elena Perez", "email": "elena@example.com", "phone": "+34 600 123 456" },
    "date": "2026-11-14",
    "startTime": "13:30",
    "guests": 2,
    "tableId": "6ae00f908fcd7b6834a24ccf",
    "notes": "Window preference"
  }
  ```
- **Server Authority**: Fields such as `bookingReference`, `status`, `endTime`, `serviceName`, `createdBy`, `depositStatus`, and `paymentReference` are strictly server-controlled and rejected if supplied in request bodies.

### 6.2 Check Availability (`POST /api/v1/integrations/availability`)
- Reuses the core `availabilityService.getAvailability` and smart `recommendTables` allocation algorithm.
- Returns operational availability, service window, capacity limits, and ranked recommendations with suitability scores.

### 6.3 Reschedule Booking (`POST /api/v1/integrations/bookings/:reference/reschedule`)
- Reuses `bookingService.rescheduleBooking`.
- Enforces availability, table collision checks, and customer blacklist verification.

### 6.4 Cancel Booking (`POST /api/v1/integrations/bookings/:reference/cancel`)
- Reuses `bookingService.cancelBooking`.
- Automatically executes Phase 17 deposit refund logic if a paid deposit exists and notice meets the restaurant's `refundCutoffHours`.

---

## 7. Retell and WhatsApp webhooks

Provider webhooks live beside the shared channel service. They do not query booking models and they do not repeat schedule, table, blacklist, or deposit rules.

`POST /api/v1/integrations/retell/webhook` accepts a Retell custom function (`name`, `args`, `call`). `X-Retell-Signature` is `v={timestamp},d={hmac}`. The digest is HMAC-SHA256 of the raw body concatenated with the timestamp, using `RETELL_WEBHOOK_SECRET` when it is set and otherwise `RETELL_API_KEY`. The timestamp must be within five minutes. Comparison is constant-time. `check_availability`, `create_booking`, `cancel_booking`, `reschedule_booking`, and `get_booking` call `src/services/channel/`. A group booking sends `tableNumbers` (at most three) and is stored through the same booking service. A booking is stored as `PHONE`. Call lifecycle events return `204` and do not create a reservation. The voice payload uses the service name, start and end time, table numbers, and booking reference. It does not include database ids. Signature and payload failures return a generic error. Spoken business results stay HTTP 200 so the agent can say them.

`GET /api/v1/integrations/whatsapp/webhook` answers Meta's challenge with `WHATSAPP_VERIFY_TOKEN`. `POST` requires `X-Hub-Signature-256`, which is `sha256=` plus HMAC-SHA256 of the raw body using `WHATSAPP_APP_SECRET`. Commands are `availability`, `book`, `cancel`, `reschedule`, and `waitlist`. Any other message is ignored and does not create a booking. The message id is the idempotency key. Payloads larger than 256KB are rejected. A reply is attempted only after a successful booking, cancellation, reschedule, waitlist save, or availability answer, and only when `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are both valid. A failed, timed-out, or rate-limited send is logged without the token and does not undo the booking.

`GET /api/v1/admin/integrations/status` reports `connected`, `ready`, `not_configured`, or `error`. Website is connected because this API serves it. A provider is ready only when its inbound credentials pass format checks. A present but short, blank-padded, or placeholder value is an error. A missing value is not configured. The response includes `checkedAt`, the operations each channel can perform, and whether WhatsApp outbound messaging is available. It never includes secret values and it does not call Retell or Meta.

The shared channel interface is still exported from `src/services/channel/index.js`:

```javascript
const { adapters } = require('../services/channel');

// Available capabilities on adapters.retell and adapters.whatsapp:
await adapters.retell.checkAvailability({ date, startTime, guests });
await adapters.retell.resolveCustomer({ email, phone });
await adapters.retell.createBooking({ ...input });
await adapters.retell.getBooking(reference);
await adapters.retell.rescheduleBooking({ reference, ...input });
await adapters.retell.cancelBooking({ reference, reason });
```

Empty provider variables keep development working: webhooks fail closed, no outbound provider call is made, and website booking continues. A well-formed key is Ready, not Connected. `RETELL_AGENT_ID` is optional; when set it must start with `agent_`. No agent is created from this API. Payment code is unchanged. Channel bookings publish the same in-app notification events as the booking and waitlist controllers. A retried webhook returns the stored idempotency result and does not create a second booking or a second notification.

---

## 8. Payment & Deposit System Integration

Phase 17 deposit logic is completely preserved:
1. When a deposit policy is active (`depositConfig.enabled = true`) and a reservation meets the party threshold:
   - External telephony and messaging channels that cannot accept client credit card payments receive `403 Forbidden` (`PAYMENT_REQUIRED`).
2. Client request tampering (e.g. attempting to send `paymentStatus: 'PAID'` or `paidAmount: 50`) is rejected by strict request validators (`400 VALIDATION_ERROR`).
3. Deposit refunds on cancellation continue to be evaluated against `refundCutoffHours` by `PaymentService.refundDeposit()`.

---

## 9. Error Mapping Summary

| Error Condition | HTTP Status | Code | Description |
|---|---|---|---|
| Missing/Invalid signature | 401 | `AUTHENTICATION_ERROR` | Signature missing or HMAC SHA-256 verification mismatch |
| Restaurant closed | 409 | `RESTAURANT_CLOSED` | Service not open or date marked as closed day |
| Table already booked | 409 | `BOOKING_CONFLICT` | Target table is reserved or locked |
| Customer blacklisted | 403 | `CUSTOMER_BLACKLISTED` | Customer has exceeded no-show blacklist threshold |
| Deposit required | 403 | `PAYMENT_REQUIRED` | Reservation requires upfront deposit collection |
| Invalid table count | 400 | `VALIDATION_ERROR` | More than 3 tables requested in group booking |
| Tampered client fields | 400 | `VALIDATION_ERROR` | Unrecognized or server-authoritative fields in body |
