const express = require('express');
const blacklistController = require('../controllers/blacklist.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  listBlacklistValidator,
  getBlacklistValidator,
  blacklistCustomerValidator,
  unblockBlacklistValidator,
} = require('../validators/blacklist.validator');

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', listBlacklistValidator, validate, blacklistController.listBlacklist);
router.get('/:userId', getBlacklistValidator, validate, blacklistController.getBlacklistCustomer);
router.patch(
  '/:userId/unblock',
  unblockBlacklistValidator,
  validate,
  blacklistController.unblockCustomer
);
router.patch(
  '/:userId',
  blacklistCustomerValidator,
  validate,
  blacklistController.blacklistCustomer
);

module.exports = router;
