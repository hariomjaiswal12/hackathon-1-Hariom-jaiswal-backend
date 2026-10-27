const { body, param, query } = require('express-validator');
const { parseCalendarDate, isValidTime } = require('../utils/calendar');
const { EVENT_STATUSES, PUBLIC_EVENT_SCOPES } = require('../constants/content');

const EVENT_FIELDS = [
  'title',
  'slug',
  'description',
  'shortDescription',
  'imageUrl',
  'location',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'status',
];

function rejectUnknownFields(value) {
  const unknown = Object.keys(value || {}).filter((key) => !EVENT_FIELDS.includes(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown field: ${unknown.join(', ')}`);
  }
  return true;
}

function optionalText(field, max) {
  return body(field)
    .optional({ values: 'null' })
    .isString()
    .withMessage(`${field} must be text`)
    .bail()
    .trim()
    .isLength({ max })
    .withMessage(`${field} must be at most ${max} characters`);
}

const eventBody = [
  body().custom(rejectUnknownFields),
  body('title')
    .optional()
    .isString()
    .bail()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Title must be between 2 and 120 characters'),
  optionalText('slug', 80),
  body('description')
    .optional()
    .isString()
    .bail()
    .trim()
    .isLength({ min: 2, max: 4000 })
    .withMessage('Description must be between 2 and 4000 characters'),
  optionalText('shortDescription', 280),
  optionalText('imageUrl', 500),
  body('location')
    .optional()
    .isString()
    .bail()
    .trim()
    .isLength({ min: 2, max: 160 })
    .withMessage('Location must be between 2 and 160 characters'),
  body('startDate')
    .optional()
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Start date must be a real calendar date in YYYY-MM-DD format'),
  body('endDate')
    .optional({ values: 'falsy' })
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('End date must be a real calendar date in YYYY-MM-DD format'),
  body('startTime')
    .optional()
    .custom((value) => isValidTime(value))
    .withMessage('Start time must be HH:mm'),
  body('endTime')
    .optional({ values: 'falsy' })
    .custom((value) => isValidTime(value))
    .withMessage('End time must be HH:mm'),
  body('status')
    .optional()
    .isIn(EVENT_STATUSES)
    .withMessage('Event status is not valid'),
];

const createEventValidator = [
  ...eventBody,
  body('title').exists().withMessage('Title is required'),
  body('description').exists().withMessage('Description is required'),
  body('location').exists().withMessage('Location is required'),
  body('startDate').exists().withMessage('Start date is required'),
  body('startTime').exists().withMessage('Start time is required'),
];

const updateEventValidator = [
  param('id').isMongoId().withMessage('Event id must be valid'),
  ...eventBody,
  body().custom((value) => {
    if (!value || Object.keys(value).length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

const eventIdValidator = [
  param('id').isMongoId().withMessage('Event id must be valid'),
];

const listAdminEventsValidator = [
  query('status').optional().isIn(EVENT_STATUSES).withMessage('Event status is not valid'),
];

const listPublicEventsValidator = [
  query('scope').optional().isIn(PUBLIC_EVENT_SCOPES).withMessage('Event scope is not valid'),
  query('date')
    .optional()
    .custom((value) => Boolean(parseCalendarDate(value)))
    .withMessage('Date must be a real calendar date in YYYY-MM-DD format'),
];

const publicSlugValidator = [
  param('slug')
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage('Slug is not valid'),
];

module.exports = {
  createEventValidator,
  updateEventValidator,
  eventIdValidator,
  listAdminEventsValidator,
  listPublicEventsValidator,
  publicSlugValidator,
};
