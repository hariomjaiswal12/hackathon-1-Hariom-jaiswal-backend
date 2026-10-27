# TXOTX OS Backend

Backend API for **TXOTX OS**, the smart table booking and restaurant operations platform for **Sidería Iturrieta**.

This repository is **backend only**. It exposes a versioned HTTP API that the separate frontend application consumes. It does not contain a user interface.

## Backend responsibilities

This service will own:

- Authentication, users, and role-based access
- Tables, floor plan, schedules, and closed days
- Availability and smart table allocation
- Bookings, waitlist, group booking, and in-app notifications
- Experiences, events, and notifications
- Analytics and audit logs

Phase 1 is the application foundation: Express, configuration, MongoDB connection handling, shared middleware, centralized errors, and a health check. Phase 2 adds customers, staff, and admin identity: registration, login, JWT access tokens, and role checks. Phase 3 adds the table catalog and floor-plan positions. Phase 4 adds the weekly service schedule and closed days. Phase 5 answers whether a date, time, and party size can be seated. Phase 6 confirms a reservation on one selected table, rejects overlapping bookings, and moves that reservation through arrival, seating, completion, cancellation, no-show, and reschedule. Phase 7 ranks the bookable tables for a request. It does not create a booking. Phase 8 adds a staff live floor that derives each table's operational state from the saved table status and today's bookings, and pushes a short Socket.io event after a booking or table change is saved. Phase 9A records a waitlist request. It does not create a booking. Phase 9B lets one booking reserve up to three tables. Phase 10 records an in-app notification after a successful booking or waitlist change. Notifications are non-authoritative. Booking, waitlist, and table state remain the source of truth. Phase 11 adds an in-process scheduler. Scheduled jobs are disabled by default. No booking is automatically cancelled or marked NO_SHOW by Phase 11. Phase 12 adds a read-only admin dashboard. It aggregates bookings, guests, tables, waitlist entries, and recent history. It does not create or change operational records.

## Tech stack

- Node.js
- Express.js
- JavaScript (CommonJS)
- MongoDB and Mongoose
- JWT and bcrypt
- dotenv
- cors
- express-rate-limit
- express-validator
- node-cron

## Frontend repository

The frontend is a separate project and must not be added to this repository:

`hackathon-1-Hariom-jaiswal-frontend`

The browser app is expected to run at `CLIENT_URL` (default `http://localhost:5173`) and call this API.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB, once `MONGODB_URI` is set (local instance or Atlas)

## Installation

From the backend repository root:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `MONGODB_URI` and `JWT_SECRET` before using features that need them. Do not commit `.env`.

If `MONGODB_URI` is empty, the API still starts and the health check reports the database as not configured. If `MONGODB_URI` is set and MongoDB cannot be reached, the process exits instead of serving a silently broken API.

## Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port. Defaults to `5000`. |
| `MONGODB_URI` | MongoDB connection string. Leave empty until a database is available. |
| `JWT_SECRET` | Secret used to sign access tokens. Required before register or login. |
| `JWT_EXPIRES_IN` | Access token lifetime understood by `jsonwebtoken`. Defaults to `7d`. |
| `CLIENT_URL` | Allowed browser origin. Defaults to `http://localhost:5173`. |
| `JOBS_ENABLED` | Turns the in-process scheduler on. Defaults to `false`. |
| `BOOKING_REMINDER_ENABLED` | Sends booking reminders when jobs are enabled. Defaults to `false`. |
| `BOOKING_REMINDER_MINUTES` | How far ahead a confirmed booking is reminded. Defaults to `120`. |
| `WAITLIST_EXPIRY_ENABLED` | Expires stale `WAITING` entries when jobs are enabled. Defaults to `false`. |
| `WAITLIST_EXPIRY_HOURS` | Hours after the requested time before a `WAITING` entry can expire. Defaults to `24`. |
| `BOOKING_CLEANUP_ENABLED` | Counts old operational bookings when jobs are enabled. Defaults to `false`. It does not change them. |

`NODE_ENV` is optional. It defaults to `development`. Set it to `production` in production so unexpected errors do not include stack traces.

## Development command

```powershell
npm run dev
```

Nodemon restarts the process when files in `src/` change.

## Production command

```powershell
$env:NODE_ENV = "production"
npm start
```

## API base URL

```text
http://localhost:5000/api/v1
```

All versioned routes live under `/api/v1`.

## Health endpoint

```http
GET /api/v1/health
```

Example:

```json
{
  "success": true,
  "message": "TXOTX OS API is running",
  "data": {
    "status": "ok",
    "service": "txotx-os-backend",
    "version": "v1",
    "environment": "development",
    "timestamp": "2026-10-26T00:00:00.000Z",
    "uptimeSeconds": 3,
    "database": {
      "configured": false,
      "status": "disconnected"
    }
  }
}
```

`data.status` is `ok` when the process is up and the database is either connected or not configured yet. It is `degraded` when a database URI is configured but the connection is down.

## Authentication

Public registration always creates a `CUSTOMER`. A request cannot choose `STAFF` or `ADMIN`.

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
GET /api/v1/auth/me
```

Register and login accept JSON and return a safe user plus an access token. `GET /api/v1/auth/me` requires:

```http
Authorization: Bearer <token>
```

The token payload contains `userId` and `role` only. Password hashes are never returned.

Later routes can require a signed-in user and a role:

```javascript
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');

router.get('/example', authenticate, authorize(ROLES.ADMIN, ROLES.STAFF), handler);
```

### Table APIs

Reading the floor is public. Management uses the Phase 2 `authenticate` and `authorize` middleware.

| Action | Who |
| --- | --- |
| `GET /api/v1/tables`, `GET /api/v1/tables/floor`, `GET /api/v1/tables/:id` | Public |
| Create a table, change its identity or layout, deactivate or reactivate it | `ADMIN` |
| Change notes, status, or floor position | `ADMIN` and `STAFF` |
| Every management route | `CUSTOMER` receives `403` |

`STAFF` cannot create tables, change `tableNumber`, name, capacity, shape, location, tags, or `isActive`, and cannot deactivate a table. New tables are always `AVAILABLE` and active. A status sent at creation is ignored. Status changes are explicit later.

`DELETE /api/v1/tables/:id` does not remove the document. It sets `isActive` to `false` so a future booking can still refer to the table. Deleting an inactive table returns `400`. An admin can set `isActive` back to `true`. The floor endpoint and the default table list return active tables only. Pass `isActive=false` to list deactivated tables.

```http
GET    /api/v1/tables
GET    /api/v1/tables/floor
GET    /api/v1/tables/:id
POST   /api/v1/tables
PATCH  /api/v1/tables/:id
DELETE /api/v1/tables/:id
PATCH  /api/v1/tables/:id/status
PATCH  /api/v1/tables/:id/position
```

List filters can be combined: `status`, `capacity`, `location`, `tag`, and `isActive`.

```http
GET /api/v1/tables?status=AVAILABLE&capacity=4&location=WINDOW&tag=quiet&isActive=true
```

Status: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `CLEANING`, `OUT_OF_SERVICE`.

Shape: `ROUND`, `SQUARE`, `RECTANGLE`.

Location: `WINDOW`, `BAR`, `CENTER`, `PRIVATE`, `OUTDOOR`, `OTHER`.

Create example:

```json
{
  "tableNumber": "T01",
  "name": "Window four",
  "capacity": 4,
  "shape": "ROUND",
  "location": "WINDOW",
  "tags": ["quiet", "window"],
  "notes": "Beside the front windows",
  "position": { "x": 120, "y": 200, "rotation": 0 }
}
```

Status example: `{ "status": "OCCUPIED" }`.

Position example: `{ "x": 420, "y": 220, "rotation": 90 }`.

`rotation` is from 0 through 360. `x` and `y` are plain numbers. The API stores that logical position and does not store drawing code.

### Live floor

`GET /api/v1/tables/floor/live` is for `STAFF` and `ADMIN`. A customer receives `403`. A missing token receives `401`. The public `GET /api/v1/tables/floor` layout is unchanged.

The live view does not replace `Table.status`. `tableStatus` is the saved physical status. `operationalState` is derived for the current business date:

1. `OUT_OF_SERVICE` when the table is out of service
2. `CLEANING` when the table is cleaning, even if a booking overlaps that time
3. `SEATED` for a current seated booking
4. `ARRIVED` for a current arrived booking
5. `BOOKED` for a current confirmed booking
6. `UPCOMING` when a later booking exists today
7. `AVAILABLE`

A booking is current when its date is the business date, `startTime` is at or before `currentTime`, `endTime` is after `currentTime`, and its status is `CONFIRMED`, `ARRIVED`, or `SEATED`. `PENDING`, `COMPLETED`, `CANCELLED`, and `NO_SHOW` are not shown. `nextBooking` is the earliest later booking on that table in those same three statuses. Booking payloads include the reference, times, guests, and status only.

There is no restaurant timezone setting. Stored dates stay timezone-free `YYYY-MM-DD` strings, and stored times stay `HH:mm`. The live floor reads the server's local clock once and formats that same pair. It does not convert between timezones.

Socket.io is attached to the same HTTP server. A client sends the existing JWT in the handshake `auth.token` or `Authorization: Bearer` header. The handshake uses the same token check as the REST API. Missing or invalid tokens are rejected. `STAFF` and `ADMIN` join `floor:live`. Every authenticated socket also joins `user:<their own userId>`. A socket cannot join `user:<another userId>`. Customers are not placed in `floor:live`. The server emits `booking:created`, `booking:updated`, `booking:cancelled`, `booking:arrived`, `booking:seated`, `booking:completed`, `booking:no_show`, `table:updated`, `waitlist:created`, `waitlist:updated`, and `waitlist:cancelled` to `floor:live` only after the database write succeeds. The payload identifies the booking, table, or waitlist entry. It does not include the calculated live floor, passwords, tokens, or customer notes. The client should call `GET /api/v1/tables/floor/live` for the current floor. Socket.io uses the same allowed frontend origin as the REST API. If the emit fails, the REST request still succeeds and the error is logged.

Floor example:

```json
{
  "success": true,
  "message": "Floor plan retrieved",
  "data": {
    "tables": [
      {
        "id": "…",
        "tableNumber": "T01",
        "capacity": 4,
        "status": "AVAILABLE",
        "shape": "ROUND",
        "location": "WINDOW",
        "tags": ["quiet", "window"],
        "position": { "x": 120, "y": 200, "rotation": 0 }
      }
    ]
  }
}
```

### Schedule and closed days

Weekly hours are configuration. The API does not invent opening times. A day with no saved schedule returns `isConfigured: false`. Service times are restaurant-local `HH:mm` strings, not timestamps.

`LUNCH` and `DINNER` are the current service names. The schema accepts other names, such as `BRUNCH`, without a code change.

Each service stores its booking rules: `bookingDurationMinutes`, `maxGuestsPerBooking`, and `lastBookingTime`. A booking that starts at the last booking time must finish by the service end. Service windows on the same day cannot overlap. Touching windows, such as `16:00` to `16:00`, are allowed.

| Action | Who |
| --- | --- |
| `GET /api/v1/schedules`, `GET /api/v1/schedules/:day`, `GET /api/v1/schedules/effective/:date` | Public |
| `PUT /api/v1/schedules/:day` | `ADMIN` |
| `GET /api/v1/closed-days`, `GET /api/v1/closed-days/:date` | Public |
| `POST /api/v1/closed-days`, `PATCH /api/v1/closed-days/:id` | `ADMIN` |

`CUSTOMER` and `STAFF` receive `403` on configuration changes.

`GET /schedules/effective/:date` resolves one calendar date. An active closed day overrides the weekly schedule and returns `isClosed: true` with no services. A closed weekday is also `isClosed: true`, with the reason that the restaurant is closed that day of the week. This endpoint does not look at bookings or tables.

Closed days are stored as `YYYY-MM-DD` and are not deleted. `PATCH` sets `isActive` to `false`. The default list returns active closed days. Pass `isActive=false` to see deactivated ones.

Saturday example:

```json
{
  "isOpen": true,
  "services": [
    {
      "name": "LUNCH",
      "startTime": "13:00",
      "endTime": "16:00",
      "lastBookingTime": "14:30",
      "bookingDurationMinutes": 90,
      "maxGuestsPerBooking": 8
    },
    {
      "name": "DINNER",
      "startTime": "20:00",
      "endTime": "22:00",
      "lastBookingTime": "20:30",
      "bookingDurationMinutes": 90,
      "maxGuestsPerBooking": 8
    }
  ]
}
```

Closed weekday: `{ "isOpen": false, "services": [] }`.

Closed day: `{ "date": "2026-12-25", "reason": "Christmas Holiday" }`.

Effective closed day:

```json
{
  "success": true,
  "message": "Effective schedule retrieved",
  "data": {
    "schedule": {
      "date": "2026-12-25",
      "dayOfWeek": "FRIDAY",
      "isConfigured": true,
      "isClosed": true,
      "reason": "Christmas Holiday",
      "services": []
    }
  }
}
```

To load the example weekly hours into MongoDB, edit `scripts/schedule.example.json`, then run:

```powershell
$env:SEED_SCHEDULE = "yes"
npm run seed:schedule
```

The API never runs that script on startup. If schedules already exist, also set `SEED_SCHEDULE_OVERWRITE=yes`.

### Availability

`GET /api/v1/availability` is public. It does not create a booking and it does not score or assign a single best table.

```http
GET /api/v1/availability?date=2026-11-14&time=13:30&guests=6
```

`date` is a calendar date (`YYYY-MM-DD`). `time` is `HH:mm`. `guests` is a positive whole number. The duration always comes from the matching service, not from the query.

The check reuses the effective schedule. A closed day or a closed weekday returns `available: false` and `reason: "RESTAURANT_CLOSED"`. A weekday with no saved schedule returns `SCHEDULE_NOT_CONFIGURED`.

A start time belongs to a service when it is greater than or equal to the service start and earlier than the service end. A request at `16:00` uses the service that starts at `16:00`, not the one that ends then.

The booking must start at or before `lastBookingTime`, and `time + bookingDurationMinutes` must not pass the service end. A party larger than `maxGuestsPerBooking` is rejected.

Eligible tables are active, have `capacity` greater than or equal to the party size, and are not `OUT_OF_SERVICE`. Current floor states such as `OCCUPIED`, `RESERVED`, and `CLEANING` are not treated as booking conflicts. A table with an overlapping active booking is removed. Results are ordered by capacity, then table number.

```json
{
  "success": true,
  "message": "Availability retrieved",
  "data": {
    "availability": {
      "available": true,
      "date": "2026-11-14",
      "startTime": "13:30",
      "endTime": "15:30",
      "guests": 6,
      "service": {
        "name": "LUNCH",
        "startTime": "13:00",
        "endTime": "16:00",
        "lastBookingTime": "15:00",
        "bookingDurationMinutes": 120,
        "maxGuestsPerBooking": 8
      },
      "tables": []
    }
  }
}
```

Other `reason` values are `OUTSIDE_SERVICE_HOURS`, `AFTER_LAST_BOOKING_TIME`, `BOOKING_ENDS_AFTER_SERVICE`, `PARTY_TOO_LARGE`, and `NO_SUITABLE_TABLE`.

### Table recommendation

`GET /api/v1/tables/recommendation` is public. It asks the availability engine which tables can take the party, then ranks those tables. It does not create a booking and it does not run a second conflict check.

```http
GET /api/v1/tables/recommendation?date=2026-11-14&time=13:30&guests=4
```

Optional preferences are `location`, `shape`, and `tag`. They never remove a bookable table. `tableId`, `bookingReference`, `customerId`, and `status` are rejected.

When nothing is bookable, the response is `available: false`, `recommendations: []`, and the availability `reason` (for example `NO_SUITABLE_TABLE` or `RESTAURANT_CLOSED`).

Each recommendation has a rank, the table, a total `score`, and a `breakdown`. The score is deterministic:

| Factor | Points |
| --- | --- |
| Base | 100 |
| Each unused seat (`capacity - guests`) | -15 |
| Requested location matches | +20 |
| Requested shape matches | +10 |
| Requested tag is on the table | +10 |

A location match can outweigh one unused seat (20 is greater than 15). It cannot outweigh three unused seats. A 4-seat table for 2 guests therefore stays ahead of a 10-seat table, even when the larger table matches `location=WINDOW`. Equal scores use the smaller capacity, then `tableNumber`.

### Bookings

`POST /api/v1/bookings` confirms the tables the client selects. Send `tableId` for one table, or `tableIds` for one to three tables. Sending both or neither returns `400 INVALID_TABLE_SELECTION`. Duplicate ids return the same code. More than `MAX_TABLES_PER_BOOKING` (3) returns `400 TOO_MANY_TABLES`. The combined capacity must cover the party, or the response is `400 TABLE_CAPACITY_INSUFFICIENT`. One booking document stores every selected table. `tableId` remains the first selected table so older records still resolve to a one-item `tableIds` list. All selected tables are locked in id order, then checked together. If any table overlaps an active booking, nothing is saved and the response is `409 BOOKING_CONFLICT`.

```json
{
  "date": "2026-11-14",
  "startTime": "13:30",
  "guests": 4,
  "tableId": "…",
  "notes": "Family lunch"
}
```

`CUSTOMER`, `STAFF`, and `ADMIN` can create a booking. A customer booking is always `source: "WEBSITE"` and always belongs to the signed-in customer. Staff may book for a customer with `PHONE`, `WHATSAPP`, or `STAFF`. Admin may also use `ADMIN`. `customerId` is required for staff and admin.

`endTime`, `bookingReference`, `serviceName`, `status`, and cancellation fields are rejected if the client sends them. A new booking is `CONFIRMED`. The reference looks like `TX-20261114-AB12CD`.

Creation calls the availability engine again, checks that the selected table can seat the party, then rejects an overlap on that table. Active blocking statuses are `PENDING`, `CONFIRMED`, `ARRIVED`, and `SEATED`. `COMPLETED`, `CANCELLED`, and `NO_SHOW` do not block. A booking that starts when another ends is allowed. Two requests for the same table and date are serialized with a short lock so they cannot both succeed.

```http
GET /api/v1/bookings
GET /api/v1/bookings/:reference
```

Customers see only their own bookings. A `customerId` query from a customer is ignored and the list stays scoped to that customer. Staff and admin can list every booking and filter by `date`, `status`, `tableId`, `customerId`, and `source`.

A response includes the public booking fields and the selected table (`id`, `tableNumber`, `capacity`). Passwords and tokens are not included. The booking document is kept. Each create, status change, and reschedule is appended to `history`.

```http
PATCH /api/v1/bookings/:reference/cancel
PATCH /api/v1/bookings/:reference/reschedule
PATCH /api/v1/bookings/:reference/arrive
PATCH /api/v1/bookings/:reference/seat
PATCH /api/v1/bookings/:reference/complete
PATCH /api/v1/bookings/:reference/no-show
```

Cancellation accepts an optional `reason` of at most 200 characters. It sets `CANCELLED`, `cancellationReason`, and `cancelledAt`. Customers cancel only their own bookings. Staff and admin can cancel operational bookings. `COMPLETED`, `CANCELLED`, and `NO_SHOW` cannot be cancelled. The error code is `INVALID_BOOKING_STATE`.

Reschedule accepts `date`, `startTime`, and `tableId`. The server recalculates `endTime` and `serviceName`. The current booking is excluded from its own overlap check, then the same table-date lock used at creation protects the old and new slots. Guests, customer, and reference stay the same.

Arrival, seating, completion, and no-show are staff and admin actions. Customers receive `403`. Allowed moves are `CONFIRMED → ARRIVED`, `ARRIVED → SEATED`, `SEATED → COMPLETED`, `CONFIRMED → NO_SHOW`, and `ARRIVED → NO_SHOW`. `SEATED` cannot become `NO_SHOW`. `COMPLETED`, `CANCELLED`, and `NO_SHOW` do not move again. `PENDING` has no transition.

### Waitlist

`POST /api/v1/waitlist` stores a request. It never creates a booking, including when `PATCH /api/v1/waitlist/:reference/convert` marks the entry `CONVERTED`.

```json
{
  "date": "2026-11-14",
  "requestedStartTime": "13:30",
  "guests": 6,
  "notes": "Window preferred"
}
```

A customer entry belongs to that customer and uses `source: "WEBSITE"`. Staff must name the customer and may use `PHONE`, `WHATSAPP`, or `STAFF`. Admin may also use `ADMIN`. The server sets `serviceName` from the effective schedule. `waitlistReference`, `status`, `serviceName`, and `createdBy` are rejected if the client sends them. The public reference looks like `WL-20261114-AB12CD`.

A closed date, a missing schedule, a time outside every service, or a party above the service maximum is rejected and nothing is stored. A full slot can still be waitlisted. A duplicate active `WAITING` or `NOTIFIED` entry for the same customer, date, time, and party returns `409 WAITLIST_DUPLICATE`. `CANCELLED`, `CONVERTED`, and `EXPIRED` do not block a new request.

```http
GET   /api/v1/waitlist
GET   /api/v1/waitlist/:reference
PATCH /api/v1/waitlist/:reference/cancel
PATCH /api/v1/waitlist/:reference/notify
PATCH /api/v1/waitlist/:reference/convert
PATCH /api/v1/waitlist/:reference/expire
```

Customers see and cancel only their own `WAITING` or `NOTIFIED` entries. A `customerId` query does not widen that list. Staff and admin can list by `status`, `date`, and `source`. Notify, convert, and expire are staff and admin actions. Allowed moves are `WAITING → NOTIFIED`, `NOTIFIED → CONVERTED`, `WAITING` or `NOTIFIED → CANCELLED`, and `WAITING` or `NOTIFIED → EXPIRED`. Anything else returns `409 INVALID_WAITLIST_STATE`. Lists are ordered by date, requested time, creation time, then reference.

Saved entries emit `waitlist:created`, `waitlist:updated`, or `waitlist:cancelled` to `floor:live`. The payload is the reference, date, time, guests, and status.

### Notifications

Notifications are non-authoritative. Booking, waitlist, and table state remain the source of truth.

A notification belongs to one user. The server creates it after a booking or waitlist write succeeds. Clients cannot create notification records or assign them to another user. There is no email or WhatsApp delivery in this phase. `EMAIL` and `WHATSAPP` are stored channel values for later use. Every notification created now uses `IN_APP`.

Types are `BOOKING_CREATED`, `BOOKING_UPDATED`, `BOOKING_CANCELLED`, `BOOKING_ARRIVED`, `BOOKING_SEATED`, `BOOKING_COMPLETED`, `BOOKING_NO_SHOW`, `WAITLIST_CREATED`, `WAITLIST_NOTIFIED`, `WAITLIST_CONVERTED`, and `WAITLIST_CANCELLED`. Status is `UNREAD` or `READ`. Marking a notification read keeps the document and sets `readAt`.

One booking produces one notification, including a group booking that reserves several tables. The customer on that booking is the recipient. Staff and admin keep receiving operational events on `floor:live` and are not copied on each customer notification. A waitlist conversion updates the waitlist and notifies the customer. It still does not create a booking. An expired waitlist stays on `floor:live` and does not add a persistent notification.

The same operation does not insert a second notification. The idempotency key is the booking or waitlist reference plus the event. A reschedule also includes how many times that booking has been rescheduled. A duplicate key is ignored.

If saving or emitting the notification fails, the error is logged. The booking or waitlist response still succeeds.

```http
GET   /api/v1/notifications
GET   /api/v1/notifications/:id
PATCH /api/v1/notifications/:id/read
PATCH /api/v1/notifications/read-all
```

The list requires a signed-in user and returns only that user's notifications, newest first. Optional filters are `status` and `type`. A `recipientUserId` query is rejected. Another user's notification returns `404` for read and detail. Marking an already-read notification returns the same record. Mark-all updates only the current user's unread rows.

A saved notification emits `notification:new` to `user:<recipientUserId>`. The payload is the reference, type, title, message, and `createdAt`. It does not include passwords, tokens, email, phone, or notes. A client may subscribe only to `user:<their own userId>`. Staff and admin may also subscribe to `floor:live`. Reminder notifications use the type `BOOKING_REMINDER`.

### Scheduled jobs

Scheduled jobs are disabled by default. No booking is automatically cancelled or marked NO_SHOW by Phase 11.

The scheduler lives in the API process and uses `node-cron`. It starts from `src/server.js` after the HTTP server is listening. Importing `src/app.js` does not start it, and a second call does not register the same jobs again. Each enabled job runs every five minutes. A job that is already running logs `[JOB] skipped because previous execution is still running` and waits for the next interval. A thrown error is logged and the API keeps serving. One job failing does not stop the others.

`JOBS_ENABLED=true` is required before any job is scheduled. Each job also has its own flag: `BOOKING_REMINDER_ENABLED`, `WAITLIST_EXPIRY_ENABLED`, and `BOOKING_CLEANUP_ENABLED`. Those default to `false`.

The reminder job looks for `CONFIRMED` bookings whose start is about `BOOKING_REMINDER_MINUTES` ahead of the server's local clock. The default is 120 minutes, and the check covers a five-minute window so a restart does not need an exact minute. The customer on the booking receives one in-app notification, including when the booking reserves several tables. The idempotency key is `<bookingReference>:REMINDER:<date>T<startTime>`. Running the job twice does not insert a second reminder. `CANCELLED`, `COMPLETED`, `NO_SHOW`, `ARRIVED`, and `SEATED` bookings are not reminded. If creating the notification fails, the booking stays as it was and the error is logged once for that pass.

The waitlist job expires a `WAITING` entry only after its requested date and time are at least `WAITLIST_EXPIRY_HOURS` in the past. The default is 24 hours. It reads the entry again before writing, and the update matches `WAITING` only. `NOTIFIED`, `CONVERTED`, `CANCELLED`, and `EXPIRED` entries are left alone, so a staff change made after the query wins. A successful expiry emits `waitlist:updated` to `floor:live` and does not create a customer notification.

The cleanup job counts `CONFIRMED`, `ARRIVED`, and `SEATED` bookings whose end time has passed. It logs that count and does not change status, cancel a booking, or mark a no-show.

Dates stay `YYYY-MM-DD` and times stay `HH:mm`. The jobs use the same server-local clock as the live floor. There is no restaurant timezone setting.

```http
GET /api/v1/admin/jobs/status
```

This is read-only and limited to `ADMIN`. Staff and customers receive `403`. The payload reports `jobsEnabled`, the scheduler flag as `ENABLED`, `DISABLED`, or `NOT_CONFIGURED`, the five-minute schedule, the reminder window, and the waitlist expiry window. Each job also reports `configuration`, `enabled`, `running`, `lastRunAt`, `lastSuccessAt`, and `lastFailureAt`. `enabled` is true only when the master switch and that job's flag are both `true`. It does not include stack traces or secret values. There is no endpoint for a customer or a staff member to run a job.

### Customer directory

Administrators can read and update customer profile fields. The directory uses the existing user records with role `CUSTOMER`. It does not create a second customer collection, and it does not change passwords, roles, blacklist state, or no-show counts. Blacklist and unblock stay on `/api/v1/admin/blacklist`.

```http
GET /api/v1/admin/customers?q=&blacklistStatus=
GET /api/v1/admin/customers/:id
PATCH /api/v1/admin/customers/:id
```

`q` matches name, email, or phone. `blacklistStatus` is `ACTIVE` or `BLACKLISTED`. Optional `page` and `limit` paginate the list. `limit` is at most 100. When both are omitted, the response still contains every matching customer, plus `pagination.total`, `page`, `limit`, and `totalPages`. `PATCH` accepts `name`, `email`, and `phone` only. Staff and customers receive `403`. Responses omit passwords and tokens. A booking total is a count of existing reservations, not a second booking record.

### Dashboard

Dashboard analytics are read-only.

These endpoints only read existing bookings, tables, waitlist entries, and history. They do not create bookings, update bookings, cancel bookings, change table status, change waitlist status, create notifications, or execute scheduler jobs. There is no dashboard Socket.io server and no dashboard-specific Socket.io event. REST is the source for dashboard numbers. A client can still listen to the existing `floor:live`, booking, table, waitlist, and `notification:new` events.

```http
GET /api/v1/admin/dashboard
GET /api/v1/admin/dashboard/bookings
GET /api/v1/admin/dashboard/hourly
GET /api/v1/admin/dashboard/services
GET /api/v1/admin/dashboard/tables
GET /api/v1/admin/dashboard/waitlist
GET /api/v1/admin/dashboard/live
GET /api/v1/admin/dashboard/activity
```

`GET /api/v1/admin/dashboard` is `ADMIN` only. Staff and customers receive `403`. Every other dashboard route allows `ADMIN` and `STAFF`. Customers receive `403`. A missing or invalid token receives `401`.

Dates use the existing calendar check and must be exactly `YYYY-MM-DD`. A malformed date, including an impossible day such as `2026-02-31`, returns `400` with code `INVALID_DATE`. The server does not rewrite it into another date. A missing date on bookings, hourly, services, or tables returns `400` with code `VALIDATION_ERROR`. The overview date is optional and defaults to the server-local business date from the same clock as the live floor. The waitlist date is optional. When it is omitted, the waitlist metrics cover every stored entry and `date` is `null`. Times stay `HH:mm`. There is no timezone conversion.

Overview metrics for one date:

- `bookings` counts each booking document once. `total` includes every status. The named fields are `confirmed`, `arrived`, `seated`, `completed`, `cancelled`, and `noShow`.
- `guests` sums `guests` once per booking. `total` includes every status. The named fields are `confirmed`, `arrived`, `seated`, and `completed`.
- `tables` is the current saved table status for every table document: `total`, `available`, `reserved`, `occupied`, `cleaning`, and `outOfService`. It is not the live operational state.
- `waitlist` counts entries for that date: `waiting`, `notified`, `converted`, `cancelled`, and `expired`.

Booking analytics require `date`. Optional filters are `status`, `source`, and `tableId`. A `tableId` filter keeps a group booking that includes that table, and still counts that booking once. The payload returns `total`, `byStatus`, `bySource`, `totalGuests`, `averageGuestsPerBooking`, `groupBookingCount`, and `singleTableBookingCount`. Averages are rounded to two decimal places. An empty set uses `0` and does not divide by zero.

A group booking is one Booking document whose resolved table list has more than one table. `tableIds` is that list when it is present. A legacy booking that only has `tableId` is a single-table booking. Group bookings count once in booking totals, guest totals, hourly buckets, service totals, and the activity feed. They are not multiplied by the number of tables.

Hourly distribution groups by the hour of `startTime`. `12:30` belongs to `12:00`. Each hour reports `time`, `bookings`, and `guests`. Hours with no bookings are omitted. The list is ordered by time.

Service analytics groups by `serviceName` and returns `bookings`, `guests`, `averageGuests`, `cancelled`, `completed`, and `noShow`, ordered by service name.

Table analytics returns every table, including tables with no bookings that day. Each row has `tableId`, `tableNumber`, `capacity`, `bookingCount`, `guestCount`, `completedCount`, `cancelledCount`, and `utilizationMinutes`. `utilizationMinutes` is the scheduled length of each booking, `endTime` minus `startTime`, in minutes. Cancelled and no-show bookings still contribute their scheduled length because the row also reports those outcomes separately. A group booking adds one booking, its full guest count, and its full duration to every selected table. It does not create extra Booking documents, and the global booking total remains one. Rows are ordered by `utilizationMinutes` descending, then `bookingCount` descending, then `tableNumber` ascending.

Waitlist analytics returns `total`, `waiting`, `notified`, `converted`, `cancelled`, `expired`, and `conversionRate`. The eligible set is every entry that has left `WAITING`: `notified + converted + cancelled + expired`. `conversionRate` is `converted / eligibleEntries`. When that denominator is `0`, the rate is `0`.

The live summary calls the existing live-floor service and does not recalculate `operationalState`. It returns `businessDate`, `currentTime`, a count of each operational state, and the same `tables` array the live floor returns.

Activity returns at most 50 events, newest first. Booking events come from booking history. Each one has `type` (`BOOKING_CREATED`, `BOOKING_STATUS_CHANGED`, or `BOOKING_RESCHEDULED`), `reference` (the booking reference), `timestamp`, and `status`. Waitlist documents have no history array, so each entry contributes its current status and `updatedAt` as one `WAITLIST` event. The payload does not include passwords, password hashes, tokens, customer email, customer phone, or other private customer fields.

Aggregations use `$match`, `$group`, `$facet`, `$unwind`, and `$project` so a booking is not loaded and then queried table by table. Table rows are loaded once and merged with the per-table totals. Booking indexes added for these reads are `{ date, status }`, `{ date, serviceName }`, `{ date, tableId }`, and `{ date, tableIds }`. The existing `{ tableId, date, status }`, `{ tableIds, date, status }`, and `{ customerId, date }` booking indexes stay in place. The waitlist unique index already begins with `customerId` and `date`, so that pair was not indexed again. `{ date, status }` was added for the dashboard status counts.

## Events and news

Admins publish restaurant events and news. The API is the source of truth. Draft, cancelled, completed, and archived records do not appear on the public website.

Public events return only `PUBLISHED` records. `GET /api/v1/events` accepts `scope=upcoming` (the default; the event has not ended), `scope=past`, `scope=all`, and `date=YYYY-MM-DD`. Upcoming events are ordered by start date and start time. `GET /api/v1/events/:slug` returns one published event. Cancelling an event sets `CANCELLED` and removes it from the public site. The admin record remains. `DELETE /api/v1/admin/events/:id` archives the event instead of deleting it.

Public news returns only `PUBLISHED` articles, newest `publishedAt` first. `GET /api/v1/news/:slug` returns one published article. `DELETE /api/v1/admin/news/:id` archives it.

Admin routes require an admin token. Staff and customers receive `403`. `createdBy` is taken from the authenticated admin. Clients cannot send `createdBy`, `isPublished`, `publishedAt`, or `archivedAt`. A supplied slug is normalized and must be unique; a duplicate slug returns `409 DUPLICATE_DATA`. When slug is omitted, the server builds one from the title. An image, when supplied, must be an `http` or `https` URL. Event end date cannot be before the start date, and the end time on the same day must be later than the start time.

These pages load their lists from the API. Events and news do not use Socket.io.

## Booking channels (Phase 19)

Website, phone, WhatsApp, and Retell requests reach the same authoritative booking engine.

### Endpoints
- `POST /api/v1/integrations/bookings`: Creates external reservation (phone, WhatsApp, Retell) with customer resolution and idempotency.
- `POST /api/v1/integrations/availability`: Checks service window and returns smart table recommendations.
- `POST /api/v1/integrations/bookings/:reference/reschedule`: Reschedules an existing reservation using core rescheduling logic.
- `POST /api/v1/integrations/bookings/:reference/cancel`: Cancels an existing reservation and triggers Phase 17 refund logic if applicable.
- `GET /api/v1/admin/integrations/status`: Reports integration configuration to administrators.

### Security & Idempotency
- Requests require HMAC-SHA256 digital signature in `X-Integration-Signature` signed with `INTEGRATION_WEBHOOK_SECRET`. Missing or invalid signatures return `401`.
- Mutating endpoints require `Idempotency-Key` (1–200 characters) backed by the `IntegrationEvent` collection. Retries and concurrent duplicate requests return the same booking without creating duplicates.
- External callers cannot assign roles or create staff/admin accounts (`CUSTOMER` role only).
- Server-authoritative fields (`bookingReference`, `status`, `paymentStatus`, `depositStatus`) cannot be manipulated by client request bodies.
- When deposit requirements are active, external channels receive `403 PAYMENT_REQUIRED`.

### Provider webhooks
- `POST /api/v1/integrations/retell/webhook` verifies `X-Retell-Signature` with `RETELL_WEBHOOK_SECRET` or, when that is empty, `RETELL_API_KEY`. The signature is `v={timestamp},d={hmac}` and expires after five minutes. Retell bookings are stored as `PHONE`. There is no `RETELL` source. An empty key is Not configured. A present but invalid value is Error. A well-formed key is Ready, not Connected.
- `GET` and `POST /api/v1/integrations/whatsapp/webhook` verify Meta's challenge and `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`. WhatsApp bookings are stored as `WHATSAPP`. Commands can check availability, book, cancel, reschedule, or join the waitlist. Outbound messages are sent only when the access token and phone number id are valid. A failed send does not undo the booking, and a failed booking does not send a message. Until the app secret and verify token are valid, WhatsApp is not configured.
- The admin status screen does not call Retell or Meta and does not return secrets.

For the channel design, see [`../docs/integration-architecture.md`](../docs/integration-architecture.md).

## Errors

Errors use a consistent JSON shape:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Route GET /api/v1/unknown not found",
  "errors": []
}
```

Handled cases include validation errors, invalid calendar dates (`INVALID_DATE`), authentication errors, authorization errors, not found, duplicate data, and unexpected server errors. Development responses include a `stack` field. Production responses omit it.

## Project layout

```text
src/
├── config/         Environment, MongoDB, CORS
├── controllers/    Thin HTTP handlers
├── middleware/     Logging, rate limit, auth, roles, validation, 404, errors
├── models/         Mongoose models
├── routes/         Versioned route modules
├── services/       Business logic
├── validators/     Request validation chains
├── utils/          Shared errors, responses, logging
├── constants/
├── app.js
└── server.js
```
