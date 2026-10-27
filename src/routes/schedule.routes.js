const express = require('express');
const scheduleController = require('../controllers/schedule.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  saveDayValidator,
  dayParamValidator,
  effectiveDateValidator,
} = require('../validators/schedule.validator');

const router = express.Router();

router.get('/', scheduleController.getWeeklySchedule);
router.get(
  '/effective/:date',
  effectiveDateValidator,
  validate,
  scheduleController.getEffectiveSchedule
);
router.get('/:day', dayParamValidator, validate, scheduleController.getScheduleForDay);
router.put(
  '/:day',
  authenticate,
  authorize(ROLES.ADMIN),
  saveDayValidator,
  validate,
  scheduleController.saveDaySchedule
);

module.exports = router;
