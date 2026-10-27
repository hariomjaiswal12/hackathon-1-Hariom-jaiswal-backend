const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  optionalDate,
  requiredDate,
  bookingFilters,
} = require('../validators/dashboard.validator');

const router = express.Router();
const admins = authorize(ROLES.ADMIN);
const operators = authorize(ROLES.ADMIN, ROLES.STAFF);

router.get('/', authenticate, admins, optionalDate, dashboardController.getOverview);
router.get(
  '/bookings',
  authenticate,
  operators,
  requiredDate,
  bookingFilters,
  validate,
  dashboardController.getBookingAnalytics
);
router.get(
  '/hourly',
  authenticate,
  operators,
  requiredDate,
  dashboardController.getHourlyDistribution
);
router.get(
  '/services',
  authenticate,
  operators,
  requiredDate,
  dashboardController.getServiceAnalytics
);
router.get(
  '/tables',
  authenticate,
  operators,
  requiredDate,
  dashboardController.getTableUtilization
);
router.get(
  '/waitlist',
  authenticate,
  operators,
  optionalDate,
  dashboardController.getWaitlistAnalytics
);
router.get('/live', authenticate, operators, dashboardController.getLiveSummary);
router.get('/activity', authenticate, operators, dashboardController.getRecentActivity);

module.exports = router;
