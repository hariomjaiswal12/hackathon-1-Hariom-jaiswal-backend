const express = require('express');
const customerAdminController = require('../controllers/customerAdmin.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  listCustomersValidator,
  customerIdValidator,
  updateCustomerValidator,
} = require('../validators/customerAdmin.validator');

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', listCustomersValidator, validate, customerAdminController.listCustomers);
router.get('/:id', customerIdValidator, validate, customerAdminController.getCustomer);
router.patch('/:id', updateCustomerValidator, validate, customerAdminController.updateCustomer);

module.exports = router;
