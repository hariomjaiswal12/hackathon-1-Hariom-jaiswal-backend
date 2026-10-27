# TXOTX OS — Phase 20 Production External Channel Integration Report

## 1. Executive Summary

Phase 20 introduces **production-ready external channel integrations** for the Retell voice agent and the WhatsApp / Meta Cloud API.

The architectural foundation established in Phase 19 remains authoritative:
```
Retell Voice Agent / WhatsApp Meta Cloud API
                   │
                   ▼
     Provider Webhook & HMAC Verification
 (X-Retell-Signature / X-Hub-Signature-256)
                   │
                   ▼
       Provider Adapters & Mappers
    (retell.adapter.js / whatsapp.adapter.js)
                   │
                   ▼
         Customer Resolution & Idempotency
   (customers.js / idempotency.js / IntegrationEvent)
                   │
                   ▼
         ExternalBookingService
        (src/services/channel/)
                   │
                   ▼
 Core Authoritative Services (Single Source of Truth)
(booking.service.js / availability.service.js / depositConfig.service.js)
                   │
                   ▼
          MongoDB Datastore
                   │
                   ▼
   Operational Realtime Sockets & Notifications
        (realtime.service.js / notification.service.js)
```

The provider adapters **never implement booking business rules themselves**. All scheduling, availability checks, table conflict detection, blacklist verification, deposit calculations, and lifecycle transitions flow directly through the core authoritative services.

---

## 2. Retell Voice Agent Integration

### 2.1 File Architecture
- `src/services/integrations/retell/retell.client.js`: Client abstraction for interacting with Retell API endpoints (`/v2/get-call/:call_id`).
- `src/services/integrations/retell/retell.webhook.js`: Cryptographic HMAC-SHA256 signature verification over raw incoming payloads with timestamp replay protection (`MAX_AGE_MS = 5 * 60 * 1000`).
- `src/services/integrations/retell/retell.mapper.js`: Normalizes incoming Retell tool calls and extracts arguments (`date`, `time`, `guests`, `tableNumber`, `notes`), customer identity, and call metadata.
- `src/services/integrations/retell/retell.adapter.js`: Dispatches normalized operations, integrates with `ExternalBookingService`, executes database-backed idempotency, and constructs natural voice speech responses.

### 2.2 Capabilities
1. **`check_availability`**: Calls core availability engine and table recommendation scorer. Returns natural speech response indicating service period, end time, and recommended table numbers without exposing internal MongoDB IDs.
2. **`create_booking`**: Resolves or provisions customer as `CUSTOMER` role, verifies blacklist status, checks deposit requirements, allocates the optimal table, and confirms reservation with canonical source **`PHONE`**.
3. **`reschedule_booking`**: Validates party availability, respects table conflicts, and reschedules reservation using core `bookingService.rescheduleBooking`.
4. **`cancel_booking`**: Cancels reservation using core `bookingService.cancelBooking` while preserving Phase 17 refund policy rules.
5. **`get_booking`**: Safe lookup of customer reservation details.
6. **Call Events**: Handles lifecycle events (e.g. `call_ended`) with HTTP 204 No Content without touching the booking ledger.

### 2.3 Retell Security & Environment
- Supported variables:
  - `RETELL_ENABLED=false`
  - `RETELL_API_KEY=`
  - `RETELL_AGENT_ID=`
  - `RETELL_WEBHOOK_SECRET=`
- Verifies signature header `X-Retell-Signature` (`v={timestamp},d={digest}`).
- Stale signatures (> 5 minutes) and signature mismatches return HTTP 401. Customer JWT tokens cannot access Retell webhooks.

---

## 3. WhatsApp / Meta Cloud API Integration

### 3.1 File Architecture
- `src/services/integrations/whatsapp/whatsapp.client.js`: Dispatches outbound interactive and text messages to the Meta Graph API (`/v21.0/:phoneNumberId/messages`).
- `src/services/integrations/whatsapp/whatsapp.webhook.js`: Handles Meta webhook challenge verification and computes HMAC-SHA256 signatures (`X-Hub-Signature-256`).
- `src/services/integrations/whatsapp/whatsapp.mapper.js`: Parses inbound messaging payloads, interactive button/list replies, and command structures.
- `src/services/integrations/whatsapp/whatsapp.adapter.js`: Normalizes commands, runs idempotency, calls `ExternalBookingService`, and sends formatted response replies.

### 3.2 Capabilities
1. **Verification Challenge**: `GET /api/v1/integrations/whatsapp/webhook` verifies `hub.mode === 'subscribe'` and `hub.verify_token`, responding with the `hub.challenge` string.
2. **Message Processing**: `POST /api/v1/integrations/whatsapp/webhook` receives inbound messages and parses text/interactive commands:
   - `availability <date> <time> <guests>`
   - `book <date> <time> <guests> | <name> | <email> | <notes>` (source: **`WHATSAPP`**)
   - `cancel <reference> <reason>`
   - `reschedule <reference> <date> <time>`
3. **Non-Booking Messages**: Regular chat messages without booking intents are acknowledged cleanly (`code: "IGNORED"`) without creating spurious bookings.

---

## 4. Idempotency & Concurrency Strategy

- **Retell Idempotency Key**: Formatted as `retell:{call_id}:{name}:{args_digest}`.
- **WhatsApp Idempotency Key**: Formatted as `whatsapp:{message_id}:{action}`.
- Handled by `idempotency.js` via the `IntegrationEvent` collection.
- Replays return HTTP 200 with the original booking reference.
- Concurrent requests with the same idempotency key wait on the in-flight event, guaranteeing that exactly one reservation is created.

---

## 5. Security & Isolation Safeguards

1. **Role Protection**: External requests can **never** create `STAFF` or `ADMIN` accounts.
2. **Tampering Prevention**: Request body fields attempting to set `status`, `bookingReference`, `depositStatus`, `paymentStatus`, or `paidAmount` are rejected.
3. **Deposit Enforcement**: Telephony and messaging channels that cannot collect credit card payments are rejected with `403 PAYMENT_REQUIRED` when deposits are enabled.
4. **Secret Confidentiality**: Neither Retell API keys nor Meta webhook secrets are ever returned in API responses or logged.

---

## 6. Verification & Test Results

| Test Suite | Result | Details |
|---|---|---|
| **Phase 20 Provider Check** (`scripts/phase20-integrations-check.js`) | **PASS (26/26)** | Retell availability, create, reschedule, cancel, conflict, blacklist, call events, Meta challenge, WhatsApp booking, idempotency. |
| **Phase 19 Integration Check** (`scripts/integration-booking-check.js`) | **PASS (28/28)** | Channel adapters, webhook security, concurrent deduplication, deposit enforcement, notifications. |
| **Backend Critical Path Tests** (`npm test`) | **PASS (10/10)** | Auth, Tables, Schedule, Availability, Bookings & Concurrency, Waitlist, Notifications, Dashboard, Jobs, Sockets. |
| **Production Audit** (`npm run audit`) | **PASS (20/20)** | Startup, health, floor plan, availability, conflict detection, rescheduling, cancellations, sensitive redaction. |
| **Phase 15 End-to-End** (`node scripts/phase15-e2e.js`) | **PASS (86/86)** | Full operational customer, staff, and admin lifecycle. |
| **Phase 17 Deposit Audit** (`scripts/phase17-deposit-check.js`) | **PASS (7/7)** | Deposit configuration, payment intents, HMAC verification, refund cutoff. |
| **Blacklist Regression** (`scripts/blacklist-check.js`) | **PASS (22/22)** | No-show counters, automatic blacklisting, unblocking. |
| **Events & News Regression** (`scripts/events-news-check.js`) | **PASS (20/20)** | Slugs, draft privacy, publication dates, archival. |
| **Frontend Production Build** (`npm run build`) | **PASS (Code 0)** | Zero TypeScript or Vite bundling errors. |
