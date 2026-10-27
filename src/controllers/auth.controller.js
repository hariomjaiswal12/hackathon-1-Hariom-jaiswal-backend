const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const authService = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register({
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    password: req.body.password,
  });

  return ApiResponse.created(res, 'Account created', result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
  });

  return ApiResponse.ok(res, 'Signed in', result);
});

const getMe = asyncHandler(async (req, res) => {
  return ApiResponse.ok(res, 'Authenticated user', { user: req.user });
});

module.exports = {
  register,
  login,
  getMe,
};
