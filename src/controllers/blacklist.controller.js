const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const blacklistService = require('../services/blacklist.service');

const listBlacklist = asyncHandler(async (req, res) => {
  const customers = await blacklistService.listBlacklist({
    blacklistStatus: req.query.blacklistStatus,
    minNoShowCount: req.query.minNoShowCount === undefined
      ? undefined
      : Number(req.query.minNoShowCount),
  });

  return ApiResponse.ok(res, 'Blacklist retrieved', { customers });
});

const getBlacklistCustomer = asyncHandler(async (req, res) => {
  const customer = await blacklistService.getBlacklistCustomer(req.params.userId);
  return ApiResponse.ok(res, 'Customer blacklist retrieved', { customer });
});

const blacklistCustomer = asyncHandler(async (req, res) => {
  const customer = await blacklistService.blacklistCustomer({
    userId: req.params.userId,
    reason: req.body.reason,
  });

  return ApiResponse.ok(res, 'Customer blacklisted', { customer });
});

const unblockCustomer = asyncHandler(async (req, res) => {
  const customer = await blacklistService.unblockCustomer(req.params.userId);
  return ApiResponse.ok(res, 'Customer unblocked', { customer });
});

module.exports = {
  listBlacklist,
  getBlacklistCustomer,
  blacklistCustomer,
  unblockCustomer,
};
