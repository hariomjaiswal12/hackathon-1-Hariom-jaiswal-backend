const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');

const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await notificationService.listNotifications({
    actor: req.user,
    query: req.query,
  });

  return ApiResponse.ok(res, 'Notifications retrieved', { notifications });
});

const getNotification = asyncHandler(async (req, res) => {
  const notification = await notificationService.getNotification({
    actor: req.user,
    id: req.params.id,
  });

  return ApiResponse.ok(res, 'Notification retrieved', { notification });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markNotificationRead({
    actor: req.user,
    id: req.params.id,
  });

  return ApiResponse.ok(res, 'Notification marked as read', { notification });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllNotificationsRead({
    actor: req.user,
  });

  return ApiResponse.ok(res, 'Notifications marked as read', result);
});

module.exports = {
  listNotifications,
  getNotification,
  markNotificationRead,
  markAllNotificationsRead,
};
