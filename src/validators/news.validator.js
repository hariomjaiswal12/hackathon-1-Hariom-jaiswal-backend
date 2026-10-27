const { body, param, query } = require('express-validator');
const { NEWS_STATUSES } = require('../constants/content');

const NEWS_FIELDS = ['title', 'slug', 'excerpt', 'content', 'imageUrl', 'status'];

function rejectUnknownFields(value) {
  const unknown = Object.keys(value || {}).filter((key) => !NEWS_FIELDS.includes(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown field: ${unknown.join(', ')}`);
  }
  return true;
}

const newsBody = [
  body().custom(rejectUnknownFields),
  body('title')
    .optional()
    .isString()
    .bail()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Title must be between 2 and 120 characters'),
  body('slug')
    .optional({ values: 'null' })
    .isString()
    .bail()
    .trim()
    .isLength({ max: 80 })
    .withMessage('Slug must be at most 80 characters'),
  body('excerpt')
    .optional()
    .isString()
    .bail()
    .trim()
    .isLength({ min: 2, max: 300 })
    .withMessage('Excerpt must be between 2 and 300 characters'),
  body('content')
    .optional()
    .isString()
    .bail()
    .trim()
    .isLength({ min: 2, max: 8000 })
    .withMessage('Content must be between 2 and 8000 characters'),
  body('imageUrl')
    .optional({ values: 'null' })
    .isString()
    .bail()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Image URL must be at most 500 characters'),
  body('status').optional().isIn(NEWS_STATUSES).withMessage('News status is not valid'),
];

const createNewsValidator = [
  ...newsBody,
  body('title').exists().withMessage('Title is required'),
  body('excerpt').exists().withMessage('Excerpt is required'),
  body('content').exists().withMessage('Content is required'),
];

const updateNewsValidator = [
  param('id').isMongoId().withMessage('News id must be valid'),
  ...newsBody,
  body().custom((value) => {
    if (!value || Object.keys(value).length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

const newsIdValidator = [
  param('id').isMongoId().withMessage('News id must be valid'),
];

const listAdminNewsValidator = [
  query('status').optional().isIn(NEWS_STATUSES).withMessage('News status is not valid'),
];

const publicSlugValidator = [
  param('slug')
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage('Slug is not valid'),
];

module.exports = {
  createNewsValidator,
  updateNewsValidator,
  newsIdValidator,
  listAdminNewsValidator,
  publicSlugValidator,
};
