const { param, query } = require('express-validator');
const { NOTIFICATION_STATUSES, NOTIFICATION_TYPES } = require('../constants/notifications');

function rejectRecipientFilter(field) {
  return query(field).custom((_value, { req }) => {
    if (Object.prototype.hasOwnProperty.call(req.query || {}, field)) {
      throw new Error('recipientUserId cannot be used to list notifications');
    }

    return true;
  });
}

const listNotificationsValidator = [
  rejectRecipientFilter('recipientUserId'),
  query('status').optional().isIn(NOTIFICATION_STATUSES).withMessage('Status is not valid'),
  query('type').optional().isIn(NOTIFICATION_TYPES).withMessage('Type is not valid'),
];

const notificationIdValidator = [
  param('id').isMongoId().withMessage('Notification id must be valid'),
];

module.exports = {
  listNotificationsValidator,
  notificationIdValidator,
};
