# TXOTX OS — Complete Backend Functionality Matrix

This document provides a comprehensive inventory of all backend API endpoints, controllers, services, database operations, validation rules, authentication/authorization requirements, and real-time event emissions in **TXOTX OS** (`backendtask1`).

---

## 1. Full API Inventory Matrix

| Module | Endpoint | Method | Auth | Role | Controller | Service | DB Operation | Validation | Status |
|---|---|---|---|---|---|---|---|---|---|
| **Health** | `/api/v1/health` | GET | None (Public) | All | `healthController.getHealth` | `healthService.getHealth` | `mongoose.connection.readyState` | None | Fully Functional |
| **Auth** | `/api/v1/auth/register` | POST | None (Rate Limited: `authLimiter`) | Public | `authController.register` | `authService.register` | `User.findOne`, `User.create` | `registerValidator` (name 2-80, valid email, optional phone, password 8-72, role blocked from client input) | Fully Functional |
| **Auth** | `/api/v1/auth/login` | POST | None (Rate Limited: `authLimiter`) | Public | `authController.login` | `authService.login` | `User.findOne({ email }).select('+password')`, `user.comparePassword`, `user.save` | `loginValidator` (valid email, password) | Fully Functional |
| **Auth** | `/api/v1/auth/me` | GET | JWT Bearer | All | `authController.getMe` | Direct return of `req.user` | `User.findById` (in `authenticate` middleware) | Bearer Token header | Fully Functional |
| **Tables** | `/api/v1/tables` | GET | None (Public) | All | `tableController.listTables` | `tableService.listTables` | `Table.find` | `listTablesValidator` (status, capacity, location, tag, isActive) | Fully Functional |
| **Tables** | `/api/v1/tables/floor` | GET | None (Public) | All | `tableController.getFloor` | `tableService.getFloor` | `Table.find({ isActive: true })` | None | Fully Functional |
| **Tables** | `/api/v1/tables/floor/live` | GET | JWT Bearer | `ADMIN`, `STAFF` | `liveFloorController.getLiveFloor` | `liveFloorService.getLiveFloor` | `Table.find({ isActive: true })`, `Booking.find` | Role Authorization | Fully Functional |
| **Tables** | `/api/v1/tables/recommendation` | GET | None (Public) | All | `allocationController.getRecommendation` | `allocationService.recommendTables` | `Table.find`, `Schedule`, `ClosedDay`, `Booking` | `allocationValidator` (date, time, guests) | Fully Functional |
| **Tables** | `/api/v1/tables/:id` | GET | None (Public) | All | `tableController.getTable` | `tableService.getTable` | `Table.findById` | `tableIdValidator` (isMongoId) | Fully Functional |
| **Tables** | `/api/v1/tables` | POST | JWT Bearer | `ADMIN` | `tableController.createTable` | `tableService.createTable` | `Table.create` | `createTableValidator` (tableNumber, capacity 1-50, shape, location, position, tags) | Fully Functional |
| **Tables** | `/api/v1/tables/:id/status` | PATCH | JWT Bearer | `ADMIN`, `STAFF` | `tableController.updateTableStatus` | `tableService.updateTableStatus` | `Table.findByIdAndUpdate` | `tableIdValidator`, `updateStatusValidator` (TABLE_STATUSES) | Fully Functional |
| **Tables** | `/api/v1/tables/:id/position` | PATCH | JWT Bearer | `ADMIN`, `STAFF` | `tableController.updateTablePosition` | `tableService.updateTablePosition` | `Table.findByIdAndUpdate` | `tableIdValidator`, `updatePositionValidator` (x, y, rotation 0-360) | Fully Functional |
| **Tables** | `/api/v1/tables/:id` | PATCH | JWT Bearer | `ADMIN`, `STAFF` | `tableController.updateTable` | `tableService.updateTable` | `Table.findByIdAndUpdate` | `tableIdValidator`, `updateTableValidator` (Staff allowed operational fields only: notes, status, position) | Fully Functional |
| **Tables** | `/api/v1/tables/:id` | DELETE | JWT Bearer | `ADMIN` | `tableController.deactivateTable` | `tableService.deactivateTable` | `Table.findByIdAndUpdate({ isActive: false })` | `tableIdValidator` | Fully Functional |
| **Schedules** | `/api/v1/schedules` | GET | None (Public) | All | `scheduleController.getWeeklySchedule` | `scheduleService.getWeeklySchedule` | `Schedule.find` | None | Fully Functional |
| **Schedules** | `/api/v1/schedules/effective/:date` | GET | None (Public) | All | `scheduleController.getEffectiveSchedule` | `scheduleService.getEffectiveSchedule` | `Schedule.findOne`, `ClosedDay.findOne` | `effectiveDateValidator` (YYYY-MM-DD) | Fully Functional |
| **Schedules** | `/api/v1/schedules/:day` | GET | None (Public) | All | `scheduleController.getScheduleForDay` | `scheduleService.getScheduleForDay` | `Schedule.findOne({ dayOfWeek })` | `dayParamValidator` (DAYS_OF_WEEK) | Fully Functional |
| **Schedules** | `/api/v1/schedules/:day` | PUT | JWT Bearer | `ADMIN` | `scheduleController.saveDaySchedule` | `scheduleService.saveDaySchedule` | `Schedule.findOneAndUpdate` | `dayParamValidator`, `saveDayValidator` (isOpen, services array) | Fully Functional |
| **Closed Days** | `/api/v1/closed-days` | GET | None (Public) | All | `closedDayController.listClosedDays` | `closedDayService.listClosedDays` | `ClosedDay.find` | `listClosedDaysValidator` | Fully Functional |
| **Closed Days** | `/api/v1/closed-days/:date` | GET | None (Public) | All | `closedDayController.getClosedDay` | `closedDayService.getClosedDay` | `ClosedDay.findOne({ date })` | `closedDayDateValidator` | Fully Functional |
| **Closed Days** | `/api/v1/closed-days` | POST | JWT Bearer | `ADMIN` | `closedDayController.createClosedDay` | `closedDayService.createClosedDay` | `ClosedDay.create` | `createClosedDayValidator` (date, reason) | Fully Functional |
| **Closed Days** | `/api/v1/closed-days/:id` | PATCH | JWT Bearer | `ADMIN` | `closedDayController.updateClosedDay` | `closedDayService.updateClosedDay` | `ClosedDay.findByIdAndUpdate` | `updateClosedDayValidator` (reason, isActive) | Fully Functional |
| **Availability** | `/api/v1/availability` | GET | None (Public) | All | `availabilityController.getAvailability` | `availabilityService.getAvailability` | `Schedule.findOne`, `ClosedDay.findOne`, `Table.find`, `Booking.find` | `availabilityValidator` (date YYYY-MM-DD, time HH:mm, guests 1-100) | Fully Functional |
| **Bookings** | `/api/v1/bookings` | POST | JWT Bearer | All | `bookingController.createBooking` | `bookingService.createBooking` | `BookingLock` (atomic upsert & acquire), `Booking.create`, `Table.find` | `createBookingValidator` (date, startTime, guests, tableId/tableIds, server fields rejected) | Fully Functional |
| **Bookings** | `/api/v1/bookings` | GET | JWT Bearer | All | `bookingController.listBookings` | `bookingService.listBookings` | `Booking.find`, `Table.find` | `listBookingsValidator` (Customer scoped to own; Staff/Admin can filter any) | Fully Functional |
| **Bookings** | `/api/v1/bookings/:reference` | GET | JWT Bearer | All | `bookingController.getBooking` | `bookingService.getBooking` | `Booking.findOne`, `Table.find` | `bookingReferenceValidator` (TX-YYYYMMDD-XXXXXX, customer ownership enforced) | Fully Functional |
| **Bookings** | `/api/v1/bookings/:reference/cancel` | PATCH | JWT Bearer | All | `bookingController.cancelBooking` | `bookingService.cancelBooking` | `BookingLock`, `Booking.findOneAndUpdate` | `cancelBookingValidator` (customer ownership enforced, reason optional) | Fully Functional |
| **Bookings** | `/api/v1/bookings/:reference/reschedule` | PATCH | JWT Bearer | All | `bookingController.rescheduleBooking` | `bookingService.rescheduleBooking` | `BookingLock`, `Booking.findOneAndUpdate` | `rescheduleBookingValidator` (date, startTime, tableId, server fields rejected) | Fully Functional |
| **Bookings** | `/api/v1/bookings/:reference/arrive` | PATCH | JWT Bearer | `STAFF`, `ADMIN` | `bookingController.arriveBooking` | `bookingService.changeBookingStatus` | `BookingLock`, `Booking.findOneAndUpdate({ status: 'ARRIVED' })` | `bookingReferenceValidator` | Fully Functional |
| **Bookings** | `/api/v1/bookings/:reference/seat` | PATCH | JWT Bearer | `STAFF`, `ADMIN` | `bookingController.seatBooking` | `bookingService.changeBookingStatus` | `BookingLock`, `Booking.findOneAndUpdate({ status: 'SEATED' })` | `bookingReferenceValidator` | Fully Functional |
| **Bookings** | `/api/v1/bookings/:reference/complete` | PATCH | JWT Bearer | `STAFF`, `ADMIN` | `bookingController.completeBooking` | `bookingService.changeBookingStatus` | `BookingLock`, `Booking.findOneAndUpdate({ status: 'COMPLETED' })` | `bookingReferenceValidator` | Fully Functional |
| **Bookings** | `/api/v1/bookings/:reference/no-show` | PATCH | JWT Bearer | `STAFF`, `ADMIN` | `bookingController.markNoShow` | `bookingService.changeBookingStatus` | `BookingLock`, `Booking.findOneAndUpdate({ status: 'NO_SHOW' })`, `User.findByIdAndUpdate` | `bookingReferenceValidator` | Fully Functional |
| **Waitlist** | `/api/v1/waitlist` | POST | JWT Bearer | All | `waitlistController.createWaitlist` | `waitlistService.createWaitlist` | `Waitlist.create` | `createWaitlistValidator` (date, requestedStartTime, guests, server fields rejected) | Fully Functional |
| **Waitlist** | `/api/v1/waitlist` | GET | JWT Bearer | All | `waitlistController.listWaitlist` | `waitlistService.listWaitlist` | `Waitlist.find` | `listWaitlistValidator` (Customer scoped to own; Staff/Admin can view all) | Fully Functional |
| **Waitlist** | `/api/v1/waitlist/:reference` | GET | JWT Bearer | All | `waitlistController.getWaitlist` | `waitlistService.getWaitlist` | `Waitlist.findOne` | `waitlistReferenceValidator` (WL-YYYYMMDD-XXXXXX, customer ownership enforced) | Fully Functional |
| **Waitlist** | `/api/v1/waitlist/:reference/cancel` | PATCH | JWT Bearer | All | `waitlistController.cancelWaitlist` | `waitlistService.cancelWaitlist` | `Waitlist.findOneAndUpdate({ status: 'CANCELLED' })` | `waitlistReferenceValidator` | Fully Functional |
| **Waitlist** | `/api/v1/waitlist/:reference/notify` | PATCH | JWT Bearer | `STAFF`, `ADMIN` | `waitlistController.notifyWaitlist` | `waitlistService.notifyWaitlist` | `Waitlist.findOneAndUpdate({ status: 'NOTIFIED' })` | `waitlistReferenceValidator` | Fully Functional |
| **Waitlist** | `/api/v1/waitlist/:reference/convert` | PATCH | JWT Bearer | `STAFF`, `ADMIN` | `waitlistController.convertWaitlist` | `waitlistService.convertWaitlist` | `Waitlist.findOneAndUpdate({ status: 'CONVERTED' })` | `waitlistReferenceValidator` | Fully Functional |
| **Waitlist** | `/api/v1/waitlist/:reference/expire` | PATCH | JWT Bearer | `STAFF`, `ADMIN` | `waitlistController.expireWaitlist` | `waitlistService.expireWaitlist` | `Waitlist.findOneAndUpdate({ status: 'EXPIRED' })` | `waitlistReferenceValidator` | Fully Functional |
| **Notifications** | `/api/v1/notifications` | GET | JWT Bearer | All | `notificationController.listNotifications` | `notificationService.listNotifications` | `Notification.find({ recipientUserId: actor.id })` | `listNotificationsValidator` (recipientUserId override rejected) | Fully Functional |
| **Notifications** | `/api/v1/notifications/:id` | GET | JWT Bearer | All | `notificationController.getNotification` | `notificationService.getNotification` | `Notification.findOne({ _id: id, recipientUserId: actor.id })` | `notificationIdValidator` (owner enforced) | Fully Functional |
| **Notifications** | `/api/v1/notifications/:id/read` | PATCH | JWT Bearer | All | `notificationController.markNotificationRead` | `notificationService.markNotificationRead` | `Notification.findOneAndUpdate({ _id: id, recipientUserId: actor.id, status: 'READ' })` | `notificationIdValidator` (owner enforced) | Fully Functional |
| **Notifications** | `/api/v1/notifications/read-all` | PATCH | JWT Bearer | All | `notificationController.markAllNotificationsRead` | `notificationService.markAllNotificationsRead` | `Notification.updateMany({ recipientUserId: actor.id, status: 'UNREAD' })` | None | Fully Functional |
| **Admin** | `/api/v1/admin/jobs/status` | GET | JWT Bearer | `ADMIN` | `jobController.getAdminJobStatus` | `jobService.getAdminJobStatus` | In-memory job state & config | None | Fully Functional |
| **Dashboard** | `/api/v1/admin/dashboard` | GET | JWT Bearer | `ADMIN` | `dashboardController.getOverview` | `dashboardService.getOverview` | Aggregations across `Booking`, `Table`, `Waitlist` | `optionalDate` | Fully Functional |
| **Dashboard** | `/api/v1/admin/dashboard/bookings` | GET | JWT Bearer | `STAFF`, `ADMIN` | `dashboardController.getBookingAnalytics` | `dashboardService.getBookingAnalytics` | Aggregations on `Booking` | `requiredDate`, `bookingFilters` | Fully Functional |
| **Dashboard** | `/api/v1/admin/dashboard/hourly` | GET | JWT Bearer | `STAFF`, `ADMIN` | `dashboardController.getHourlyDistribution` | `dashboardService.getHourlyDistribution` | Aggregations on `Booking` | `requiredDate` | Fully Functional |
| **Dashboard** | `/api/v1/admin/dashboard/services` | GET | JWT Bearer | `STAFF`, `ADMIN` | `dashboardController.getServiceAnalytics` | `dashboardService.getServiceAnalytics` | Aggregations on `Booking` | `requiredDate` | Fully Functional |
| **Dashboard** | `/api/v1/admin/dashboard/tables` | GET | JWT Bearer | `STAFF`, `ADMIN` | `dashboardController.getTableUtilization` | `dashboardService.getTableUtilization` | Aggregations on `Table`, `Booking` | `requiredDate` | Fully Functional |
| **Dashboard** | `/api/v1/admin/dashboard/waitlist` | GET | JWT Bearer | `STAFF`, `ADMIN` | `dashboardController.getWaitlistAnalytics` | `dashboardService.getWaitlistAnalytics` | Aggregations on `Waitlist` | `optionalDate` | Fully Functional |
| **Dashboard** | `/api/v1/admin/dashboard/live` | GET | JWT Bearer | `STAFF`, `ADMIN` | `dashboardController.getLiveSummary` | `dashboardService.getLiveSummary` | Aggregations on live floor state | None | Fully Functional |
| **Dashboard** | `/api/v1/admin/dashboard/activity` | GET | JWT Bearer | `STAFF`, `ADMIN` | `dashboardController.getRecentActivity` | `dashboardService.getRecentActivity` | `Booking.find` (sorted by history.at desc, capped at 50) | None | Fully Functional |
| **Docs** | `/api/docs` | GET | None (Public) | All | Swagger UI | Static HTML/CSS/JS | In-memory OpenAPI spec | None | Fully Functional |
| **Docs** | `/api/docs/spec.json` | GET | None (Public) | All | OpenAPI JSON handler | Serves `openApiSpec` | In-memory JSON | None | Fully Functional |

---

## 2. Background Scheduler Jobs

| Job Name | Schedule (Cron) | Enabled Flag | Purpose |
|---|---|---|---|
| **`bookingReminder`** | `* * * * *` (Every minute) | `BOOKING_REMINDER_ENABLED` | Queries confirmed bookings starting within `BOOKING_REMINDER_MINUTES`, creates idempotent notification |
| **`waitlistExpiry`** | `* * * * *` (Every minute) | `WAITLIST_EXPIRY_ENABLED` | Queries active waitlist entries older than `WAITLIST_EXPIRY_HOURS`, marks them EXPIRED, emits realtime event |
| **`bookingCleanup`** | `* * * * *` (Every minute) | `BOOKING_CLEANUP_ENABLED` | Identifies past reservations and logs operational summary counts |

---

## 3. Real-Time Socket.IO Channels & Events

- **Handshake Authentication**: Authenticates via `auth: { token: 'JWT' }` or `Authorization: Bearer <token>`. Unauthenticated clients are rejected with `401 / Authentication required`.
- **Rooms**:
  - `user:${userId}`: Personal user notifications and booking updates.
  - `floor:live`: Operational floor and table updates (restricted to `STAFF` and `ADMIN`).
- **Events**:
  - `table:status`, `table:position`: Emitted when table state or location changes.
  - `booking:created`, `booking:updated`, `booking:cancelled`, `booking:arrived`, `booking:seated`, `booking:completed`, `booking:no_show`: Emitted on booking lifecycle events.
  - `waitlist:created`, `waitlist:updated`, `waitlist:cancelled`: Emitted on waitlist events.
  - `notification:new`: Emitted to user room when a new notification is generated.
