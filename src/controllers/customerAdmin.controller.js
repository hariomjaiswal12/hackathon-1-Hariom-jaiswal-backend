const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const customerAdminService = require('../services/customerAdmin.service');

const listCustomers = asyncHandler(async (req, res) => {
  const result = await customerAdminService.listCustomers({
    q: req.query.q,
    blacklistStatus: req.query.blacklistStatus,
    page: req.query.page,
    limit: req.query.limit,
  });

  return ApiResponse.ok(res, 'Customers retrieved', result);
});

const getCustomer = asyncHandler(async (req, res) => {
  const customer = await customerAdminService.getCustomer(req.params.id);
  return ApiResponse.ok(res, 'Customer retrieved', { customer });
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerAdminService.updateCustomer(req.params.id, {
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
  });

  return ApiResponse.ok(res, 'Customer updated', { customer });
});

module.exports = {
  listCustomers,
  getCustomer,
  updateCustomer,
};
