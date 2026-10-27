const express = require('express');
const notificationController = require('../controllers/notification.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const {
  listNotificationsValidator,
  notificationIdValidator,
} = require('../validators/notification.validator');

const router = express.Router();

router.get(
  '/',
  authenticate,
  listNotificationsValidator,
  validate,
  notificationController.listNotifications
);
router.patch(
  '/read-all',
  authenticate,
  notificationController.markAllNotificationsRead
);
router.get(
  '/:id',
  authenticate,
  notificationIdValidator,
  validate,
  notificationController.getNotification
);
router.patch(
  '/:id/read',
  authenticate,
  notificationIdValidator,
  validate,
  notificationController.markNotificationRead
);

module.exports = router;
