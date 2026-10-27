const ApiError = require('../utils/ApiError');

function authorize(...allowedRoles) {
  const roles = allowedRoles.flat();

  return function authorizeRequest(req, res, next) {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden());
      return;
    }

    next();
  };
}

module.exports = authorize;
