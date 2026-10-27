const rateLimit = require('express-rate-limit');
const ERROR_CODES = require('../constants/errorCodes');
const HTTP_STATUS = require('../constants/httpStatus');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip(req) {
    return req.path === '/health' || req.originalUrl.endsWith('/health');
  },
  handler(req, res) {
    const message = 'Too many requests. Please try again later.';
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      code: ERROR_CODES.RATE_LIMITED,
      message,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message,
      },
      errors: [],
    });
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    const message = 'Too many authentication attempts. Please try again later.';
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      code: ERROR_CODES.RATE_LIMITED,
      message,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message,
      },
      errors: [],
    });
  },
});

module.exports = apiLimiter;
module.exports.authLimiter = authLimiter;
