const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const ERROR_CODES = require('../constants/errorCodes');
const HTTP_STATUS = require('../constants/httpStatus');

function sendError(res, statusCode, code, message, errors = [], stack) {
  const body = {
    success: false,
    code,
    message,
    error: {
      code,
      message,
    },
    errors,
  };

  if (!env.isProduction && stack) {
    body.stack = stack;
  }

  return res.status(statusCode).json(body);
}

function isProviderWebhook(req) {
  const url = String(req.originalUrl || '');
  return url.includes('/integrations/retell/webhook') || url.includes('/integrations/whatsapp/webhook');
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (isProviderWebhook(req) && !(err instanceof ApiError)) {
    const invalidJson = err.type === 'entity.parse.failed';
    logger.warn(invalidJson ? 'integration webhook payload rejected' : 'integration webhook failed');
    return res.status(invalidJson ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: invalidJson ? 'Invalid JSON' : 'The request could not be processed.',
    });
  }

  if (err instanceof ApiError && err.isOperational) {
    logger.warn(`${err.code} ${err.message}`);
  } else if (!env.isProduction && err.stack) {
    logger.error(err.stack);
  } else {
    logger.error(err.message || 'Unhandled error');
  }

  if (err instanceof ApiError) {
    sendError(res, err.statusCode, err.code, err.message, err.errors, err.stack);
    return;
  }

  if (err.name === 'ValidationError' && err.errors) {
    const errors = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));

    sendError(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR,
      'Validation failed',
      errors,
      err.stack
    );
    return;
  }

  if (err.name === 'CastError') {
    sendError(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR,
      `Invalid value for ${err.path}`,
      [],
      err.stack
    );
    return;
  }

  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    const message = fields.length
      ? `Duplicate value for ${fields.join(', ')}`
      : 'Duplicate data';

    sendError(
      res,
      HTTP_STATUS.CONFLICT,
      ERROR_CODES.DUPLICATE_DATA,
      message,
      [],
      err.stack
    );
    return;
  }

  if (
    err.name === 'JsonWebTokenError' ||
    err.name === 'TokenExpiredError' ||
    err.name === 'NotBeforeError'
  ) {
    sendError(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.AUTHENTICATION_ERROR,
      'Authentication failed',
      [],
      err.stack
    );
    return;
  }

  if (err.type === 'entity.parse.failed') {
    sendError(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid JSON body',
      [],
      err.stack
    );
    return;
  }

  if (
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError'
  ) {
    sendError(
      res,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      'Database is unavailable',
      [],
      err.stack
    );
    return;
  }

  const statusCode = Number.isInteger(err.statusCode)
    ? err.statusCode
    : HTTP_STATUS.INTERNAL_SERVER_ERROR;

  sendError(
    res,
    statusCode,
    ERROR_CODES.INTERNAL_ERROR,
    env.isProduction ? 'Internal server error' : err.message || 'Internal server error',
    [],
    err.stack
  );
}

module.exports = errorHandler;
