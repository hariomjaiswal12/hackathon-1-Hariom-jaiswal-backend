const express = require('express');
const jobController = require('../controllers/job.controller');
const dashboardRoutes = require('./dashboard.routes');
const blacklistRoutes = require('./blacklist.routes');
const customerAdminRoutes = require('./customerAdmin.routes');
const { adminRouter: eventAdminRoutes } = require('./event.routes');
const { adminRouter: newsAdminRoutes } = require('./news.routes');
const integrationController = require('../controllers/integration.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.use('/dashboard', dashboardRoutes);
router.use('/blacklist', blacklistRoutes);
router.use('/customers', customerAdminRoutes);
router.use('/events', eventAdminRoutes);
router.use('/news', newsAdminRoutes);

router.get(
  '/integrations/status',
  authenticate,
  authorize(ROLES.ADMIN),
  integrationController.getStatus
);

router.get(
  '/jobs/status',
  authenticate,
  authorize(ROLES.ADMIN),
  jobController.getAdminJobStatus
);

module.exports = router;
