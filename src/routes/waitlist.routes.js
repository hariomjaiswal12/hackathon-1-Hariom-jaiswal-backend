const express = require('express');
const waitlistController = require('../controllers/waitlist.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  createWaitlistValidator,
  listWaitlistValidator,
  waitlistReferenceValidator,
} = require('../validators/waitlist.validator');

const router = express.Router();
const operators = authorize(ROLES.STAFF, ROLES.ADMIN);

router.post('/', authenticate, createWaitlistValidator, validate, waitlistController.createWaitlist);
router.get('/', authenticate, listWaitlistValidator, validate, waitlistController.listWaitlist);
router.patch(
  '/:reference/cancel',
  authenticate,
  waitlistReferenceValidator,
  validate,
  waitlistController.cancelWaitlist
);
router.patch(
  '/:reference/notify',
  authenticate,
  operators,
  waitlistReferenceValidator,
  validate,
  waitlistController.notifyWaitlist
);
router.patch(
  '/:reference/convert',
  authenticate,
  operators,
  waitlistReferenceValidator,
  validate,
  waitlistController.convertWaitlist
);
router.patch(
  '/:reference/expire',
  authenticate,
  operators,
  waitlistReferenceValidator,
  validate,
  waitlistController.expireWaitlist
);
router.get(
  '/:reference',
  authenticate,
  waitlistReferenceValidator,
  validate,
  waitlistController.getWaitlist
);

module.exports = router;
