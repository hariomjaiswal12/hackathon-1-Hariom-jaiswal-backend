const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(\S+)$/.exec(header);

  if (!match) {
    next(ApiError.unauthorized('Authentication required'));
    return;
  }

  try {
    const payload = verifyAccessToken(match[1]);
    const user = await User.findById(payload.userId);

    if (!user || !user.isActive || user.isBlacklisted) {
      next(ApiError.unauthorized('Authentication failed'));
      return;
    }

    req.user = user.toSafeObject();
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      next(ApiError.unauthorized('Token has expired'));
      return;
    }

    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      next(ApiError.unauthorized('Invalid token'));
      return;
    }

    next(error);
  }
}

module.exports = authenticate;
