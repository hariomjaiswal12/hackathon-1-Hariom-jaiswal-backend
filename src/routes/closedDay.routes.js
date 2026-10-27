const express = require('express');
const closedDayController = require('../controllers/closedDay.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  createClosedDayValidator,
  closedDayDateValidator,
  updateClosedDayValidator,
  listClosedDaysValidator,
} = require('../validators/closedDay.validator');

const router = express.Router();

router.get('/', listClosedDaysValidator, validate, closedDayController.listClosedDays);
router.get('/:date', closedDayDateValidator, validate, closedDayController.getClosedDay);
router.post(
  '/',
  authenticate,
  authorize(ROLES.ADMIN),
  createClosedDayValidator,
  validate,
  closedDayController.createClosedDay
);
router.patch(
  '/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  updateClosedDayValidator,
  validate,
  closedDayController.updateClosedDay
);

module.exports = router;
