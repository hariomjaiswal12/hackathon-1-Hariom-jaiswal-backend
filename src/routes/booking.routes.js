const express = require('express');
const bookingController = require('../controllers/booking.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  createBookingValidator,
  listBookingsValidator,
  bookingReferenceValidator,
  cancelBookingValidator,
  rescheduleBookingValidator,
} = require('../validators/booking.validator');

const router = express.Router();
const operators = authorize(ROLES.STAFF, ROLES.ADMIN);

router.post('/', authenticate, createBookingValidator, validate, bookingController.createBooking);
router.get('/', authenticate, listBookingsValidator, validate, bookingController.listBookings);
router.patch(
  '/:reference/cancel',
  authenticate,
  cancelBookingValidator,
  validate,
  bookingController.cancelBooking
);
router.patch(
  '/:reference/reschedule',
  authenticate,
  rescheduleBookingValidator,
  validate,
  bookingController.rescheduleBooking
);
router.patch(
  '/:reference/arrive',
  authenticate,
  operators,
  bookingReferenceValidator,
  validate,
  bookingController.arriveBooking
);
router.patch(
  '/:reference/seat',
  authenticate,
  operators,
  bookingReferenceValidator,
  validate,
  bookingController.seatBooking
);
router.patch(
  '/:reference/complete',
  authenticate,
  operators,
  bookingReferenceValidator,
  validate,
  bookingController.completeBooking
);
router.patch(
  '/:reference/no-show',
  authenticate,
  operators,
  bookingReferenceValidator,
  validate,
  bookingController.markNoShow
);
router.get(
  '/:reference',
  authenticate,
  bookingReferenceValidator,
  validate,
  bookingController.getBooking
);

module.exports = router;
