const { body, param, query } = require('express-validator');
const {
  TABLE_STATUSES,
  TABLE_SHAPES,
  TABLE_LOCATIONS,
} = require('../constants/tables');

const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function finiteNumber(value) {
  return Number.isFinite(Number(value));
}

const tableIdValidator = [
  param('id').isMongoId().withMessage('Table id must be valid'),
];

const positionRules = (required) => {
  const position = required
    ? body('position').exists().withMessage('Position is required')
    : body('position').optional();

  const coordinate = (field, message) => {
    const rule = body(field);

    if (required) {
      return rule.exists().withMessage(message);
    }

    return rule.if(body('position').exists()).exists().withMessage(message);
  };

  return [
    position.isObject().withMessage('Position must be an object'),
    coordinate('position.x', 'Position x is required')
      .custom(finiteNumber)
      .withMessage('Position x must be a valid number')
      .toFloat(),
    coordinate('position.y', 'Position y is required')
      .custom(finiteNumber)
      .withMessage('Position y must be a valid number')
      .toFloat(),
    coordinate('position.rotation', 'Rotation is required')
      .custom((value) => {
        const rotation = Number(value);
        return Number.isFinite(rotation) && rotation >= 0 && rotation <= 360;
      })
      .withMessage('Rotation must be between 0 and 360')
      .toFloat(),
  ];
};

const tagRules = [
  body('tags')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Tags must be an array of at most 20 items'),
  body('tags.*')
    .if(body('tags').exists())
    .trim()
    .toLowerCase()
    .matches(TAG_PATTERN)
    .withMessage('Tags must be lowercase words separated by hyphens'),
];

const createTableValidator = [
  body('tableNumber')
    .trim()
    .notEmpty()
    .withMessage('Table number is required')
    .isLength({ max: 12 })
    .withMessage('Table number must be at most 12 characters')
    .toUpperCase()
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('Table number may contain only letters, numbers, and hyphens'),
  body('name')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage('Table name must be between 1 and 80 characters'),
  body('capacity')
    .isInt({ min: 1, max: 50 })
    .withMessage('Capacity must be a whole number from 1 to 50')
    .toInt(),
  body('shape').isIn(TABLE_SHAPES).withMessage('Shape is not valid'),
  body('location').isIn(TABLE_LOCATIONS).withMessage('Location is not valid'),
  ...tagRules,
  ...positionRules(true),
  body('notes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be at most 500 characters'),
];

const updateTableValidator = [
  body().custom((value) => {
    const fields = [
      'tableNumber',
      'name',
      'capacity',
      'shape',
      'location',
      'tags',
      'position',
      'notes',
      'isActive',
      'status',
    ];
    const hasUpdate = fields.some((field) => value[field] !== undefined);

    if (!hasUpdate) {
      throw new Error('At least one field is required');
    }

    return true;
  }),
  body('tableNumber')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Table number cannot be empty')
    .isLength({ max: 12 })
    .withMessage('Table number must be at most 12 characters')
    .toUpperCase()
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('Table number may contain only letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage('Table name must be between 1 and 80 characters'),
  body('capacity')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Capacity must be a whole number from 1 to 50')
    .toInt(),
  body('shape').optional().isIn(TABLE_SHAPES).withMessage('Shape is not valid'),
  body('location').optional().isIn(TABLE_LOCATIONS).withMessage('Location is not valid'),
  body('status').optional().isIn(TABLE_STATUSES).withMessage('Status is not valid'),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false'),
  ...tagRules,
  ...positionRules(false),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be at most 500 characters'),
];

const updateStatusValidator = [
  body('status').isIn(TABLE_STATUSES).withMessage('Status is not valid'),
];

const updatePositionValidator = [
  body('x')
    .exists()
    .withMessage('Position x is required')
    .custom(finiteNumber)
    .withMessage('Position x must be a valid number')
    .toFloat(),
  body('y')
    .exists()
    .withMessage('Position y is required')
    .custom(finiteNumber)
    .withMessage('Position y must be a valid number')
    .toFloat(),
  body('rotation')
    .exists()
    .withMessage('Rotation is required')
    .custom((value) => {
      const rotation = Number(value);
      return Number.isFinite(rotation) && rotation >= 0 && rotation <= 360;
    })
    .withMessage('Rotation must be between 0 and 360')
    .toFloat(),
];

const listTablesValidator = [
  query('status').optional().isIn(TABLE_STATUSES).withMessage('Status is not valid'),
  query('capacity')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Capacity must be a whole number from 1 to 50'),
  query('location').optional().isIn(TABLE_LOCATIONS).withMessage('Location is not valid'),
  query('tag')
    .optional()
    .custom((value) => TAG_PATTERN.test(String(value).trim().toLowerCase()))
    .withMessage('Tag is not valid'),
  query('isActive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isActive must be true or false'),
];

module.exports = {
  tableIdValidator,
  createTableValidator,
  updateTableValidator,
  updateStatusValidator,
  updatePositionValidator,
  listTablesValidator,
};
