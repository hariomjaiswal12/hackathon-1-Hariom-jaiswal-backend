# TXOTX OS — Frontend Integration Guide

Welcome to the **TXOTX OS** backend API integration guide. This document provides everything you need to connect frontend interfaces (Customer Portal, Booking Widget, Staff Floor Plan, and Admin Operations Dashboard) to the TXOTX OS backend.

---

## 1. Base URL & Protocol

| Environment | Base URL | WebSocket URL |
|---|---|---|
| **Local Development** | `http://127.0.0.1:5000/api/v1` | `ws://127.0.0.1:5000` |
| **Interactive Docs** | `http://127.0.0.1:5000/api/docs` | Swagger UI |
| **OpenAPI Spec JSON** | `http://127.0.0.1:5000/api/docs/spec.json` | OpenAPI 3.0 |

---

## 2. Authentication Flow & Role Model

TXOTX OS uses stateless **JWT Bearer Tokens**.

### User Roles
- **`CUSTOMER`**: Can check availability, recommend tables, create/cancel/reschedule their own bookings, join/cancel waitlist, read personal notifications.
- **`STAFF`**: Can view the live floor map, update table statuses, manage operational guest flow (arrive, seat, complete, no-show), manage waitlist (notify, convert), and view dashboard analytics.
- **`ADMIN`**: Full permissions, including creating/updating tables, modifying weekly schedules, managing closed days, viewing executive revenue/analytics, and inspecting background jobs.

### Authentication Header
Every authenticated request MUST include the standard Authorization header:
```http
Authorization: Bearer <token>
```

### Storing Tokens (Frontend Best Practice)
Store the token securely in memory, `localStorage`, or `sessionStorage` (e.g., `localStorage.getItem('token')`).

### Example: Sign In & Storing Token
```typescript
interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: 'ADMIN' | 'STAFF' | 'CUSTOMER';
    };
  };
}

async function login(email: string, password: string): Promise<LoginResponse['data']> {
  const res = await fetch('http://127.0.0.1:5000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error?.message || payload.message || 'Login failed');
  }

  localStorage.setItem('txotx_token', payload.data.token);
  return payload.data;
}
```

---

## 3. Standardized Response & Error Format

All API responses follow a strict, predictable JSON envelope.

### Successful Response:
```json
{
  "success": true,
  "message": "Booking confirmed",
  "data": { ... }
}
```

### Error Response:
```json
{
  "success": false,
  "code": "BOOKING_CONFLICT",
  "message": "This table is already booked for that time",
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "This table is already booked for that time"
  },
  "errors": []
}
```

### Common HTTP Status Codes
| Status | Meaning | Typical Scenario |
|---|---|---|
| **200 OK** | Request succeeded | Data retrieved or resource updated |
| **201 Created** | Resource created | Booking, waitlist, or table created |
| **400 Bad Request** | Validation failed | Malformed date, invalid guests count |
| **401 Unauthorized** | Missing/invalid token | Expired session, invalid credentials |
| **403 Forbidden** | Insufficient permissions | Customer attempting to access live floor |
| **404 Not Found** | Resource missing | Unknown booking reference or table ID |
| **409 Conflict** | Business rule conflict | Table already booked, duplicate booking |
| **429 Too Many Requests** | Rate limit exceeded | Exceeded 20 auth attempts / 15 mins |
| **500 Internal Error** | Server error | Unexpected runtime fault |

---

## 4. Availability & Recommendations

### Checking Service Availability
Query time slots and seating status before displaying the time picker:
```typescript
// GET /api/v1/availability?date=2026-11-14&time=13:30&guests=4
const res = await fetch('http://127.0.0.1:5000/api/v1/availability?date=2026-11-14&time=13:30&guests=4');
const { data } = await res.json();

console.log(data.availability.available); // true / false
console.log(data.availability.service);   // { name: "LUNCH", startTime: "13:00", endTime: "16:00", ... }
console.log(data.availability.tables);    // [ { id: "...", tableNumber: "T-01", capacity: 4, ... } ]
```

### Smart Table Recommendation
Let the backend select the optimal table(s) based on capacity, shape, and room:
```typescript
// GET /api/v1/tables/recommendation?date=2026-11-14&time=13:30&guests=4
const res = await fetch(
  'http://127.0.0.1:5000/api/v1/tables/recommendation?date=2026-11-14&time=13:30&guests=4'
);
const { data } = await res.json();

if (data.recommendation.available) {
  const topChoice = data.recommendation.recommendations[0];
  console.log('Recommended table:', topChoice.table.tableNumber, 'Score:', topChoice.score);
}
```

---

## 5. Booking Creation

### A. Single Table Reservation
```typescript
const res = await fetch('http://127.0.0.1:5000/api/v1/bookings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    date: '2026-11-14',
    startTime: '13:30',
    guests: 4,
    tableId: '60c72b2f9b1d8b2bad5e0001',
    notes: 'Near the cider barrels if possible',
  }),
});
const { data } = await res.json();
console.log('Confirmed Booking Reference:', data.booking.bookingReference);
```

### B. Multi-Table Group Reservation
For large groups (e.g. 12+ guests) combining adjacent tables:
```typescript
const res = await fetch('http://127.0.0.1:5000/api/v1/bookings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    date: '2026-11-14',
    startTime: '14:00',
    guests: 14,
    tableIds: ['60c72b2f9b1d8b2bad5e0001', '60c72b2f9b1d8b2bad5e0002'],
    notes: 'Company celebration dinner',
  }),
});
```

### C. Booking Reschedule & Cancellation
```typescript
// Reschedule:
await fetch(`http://127.0.0.1:5000/api/v1/bookings/${bookingRef}/reschedule`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    date: '2026-11-15',
    startTime: '14:00',
    tableId: '60c72b2f9b1d8b2bad5e0001',
  }),
});

// Cancel:
await fetch(`http://127.0.0.1:5000/api/v1/bookings/${bookingRef}/cancel`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ reason: 'Family emergency' }),
});
```

---

## 6. Waitlist Management

When no tables are available for the desired slot:
```typescript
// Join waitlist:
const res = await fetch('http://127.0.0.1:5000/api/v1/waitlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    date: '2026-11-14',
    requestedStartTime: '14:00',
    guests: 4,
    notes: 'Willing to take terrace or main room',
  }),
});
const { data } = await res.json();
console.log('Waitlist Ref:', data.waitlist.waitlistReference);
```

---

## 7. Notifications

In-app notifications are automatically emitted on reservation events (Created, Rescheduled, Cancelled, Arrived, Seated, Completed).

```typescript
// Fetch customer notifications:
const res = await fetch('http://127.0.0.1:5000/api/v1/notifications', {
  headers: { Authorization: `Bearer ${token}` },
});
const { data } = await res.json();
console.log('Unread:', data.notifications.filter(n => n.status === 'UNREAD').length);

// Mark single notification read:
await fetch(`http://127.0.0.1:5000/api/v1/notifications/${notificationId}/read`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}` },
});

// Mark all read:
await fetch('http://127.0.0.1:5000/api/v1/notifications/read-all', {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## 8. Real-Time Floor & Socket.io Integration

TXOTX OS includes real-time synchronization over Socket.io.

### Connecting with Authentication
```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://127.0.0.1:5000', {
  auth: { token: localStorage.getItem('txotx_token') },
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('Connected to TXOTX OS Realtime server, id:', socket.id);
});

// Real-time table status updates (for floor plan)
socket.on('table:status', (event) => {
  console.log(`Table ${event.tableNumber} is now ${event.status}`);
  // Update state in React/Vue
});

// Real-time booking updates
socket.on('booking:created', (booking) => {
  console.log('New booking created:', booking.bookingReference);
});

// Personal customer notifications channel
socket.on('notification:created', (notification) => {
  console.log('New notification received:', notification.title);
  // Show toast or trigger audio chime
});
```

---

## 9. Admin & Staff Operations Dashboard

The dashboard endpoints provide aggregated, read-only analytics:

```typescript
// Executive overview:
GET /api/v1/admin/dashboard?date=2026-11-14

// Booking analytics breakdown:
GET /api/v1/admin/dashboard/bookings?date=2026-11-14

// Hourly dining distribution:
GET /api/v1/admin/dashboard/hourly?date=2026-11-14

// Table utilization:
GET /api/v1/admin/dashboard/tables?date=2026-11-14

// Operational audit activity feed:
GET /api/v1/admin/dashboard/activity
```

---

---

## 10. Deposit & Payment System (Phase 17)

When deposits are enabled, eligible bookings are created in `PENDING` state and require cryptographic payment verification before confirmation.

### Endpoints
- `GET /api/v1/deposit/config`: Public policy endpoint returning current deposit settings (`enabled`, `type`, `amount`, `currency`, `minGuests`, `refundCutoffHours`).
- `PUT /api/v1/payments/admin/config`: Admin configuration update.
- `POST /api/v1/payments/verify`: Cryptographic verification of payment intent.
- `GET /api/v1/payments/booking/:reference`: Retrieve payment details for a specific booking.
- `POST /api/v1/payments/:reference/refund`: Admin manual refund trigger.
- `GET /api/v1/payments`: Admin payment transaction listing.

### Verification Payload:
```typescript
interface VerifyPaymentPayload {
  paymentReference: string;
  providerPaymentId: string;
  providerOrderId: string;
  signature: string;
}

// POST /api/v1/payments/verify
const response = await fetch('http://127.0.0.1:5000/api/v1/payments/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(payload)
});
```

---

## 11. Summary Checklist for Frontend Developers

- [x] All requests use `application/json`.
- [x] JWT token is sent in `Authorization: Bearer <token>` for protected routes.
- [x] Server-generated fields (`bookingReference`, `status`, `endTime`, `serviceName`, `createdBy`, `cancelledAt`, `paymentReference`, `depositStatus`) are **never** manually passed in create/update payloads.
- [x] Handled 409 Conflict status specifically for double-booking prevention.
- [x] Handled 201 response with `PENDING` booking status by invoking the payment checkout modal.
- [x] Listened to Socket.io events for live floor rendering (`payment:paid`, `floor:update`).
