const HTTP_STATUS = require('../constants/httpStatus');
const ERROR_CODES = require('../constants/errorCodes');

class ApiError extends Error {
  constructor(statusCode, message, code, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static invalidDate(message = 'Date must be a real calendar date in YYYY-MM-DD format') {
    return new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      message,
      ERROR_CODES.INVALID_DATE
    );
  }

  static validation(errors, message = 'Validation failed') {
    return new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      message,
      ERROR_CODES.VALIDATION_ERROR,
      errors
    );
  }

  static unauthorized(message = 'Authentication failed') {
    return new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      message,
      ERROR_CODES.AUTHENTICATION_ERROR
    );
  }

  static customerBlacklisted(
    message = 'Your account is currently restricted from making new reservations. Please contact the restaurant.'
  ) {
    return new ApiError(
      HTTP_STATUS.FORBIDDEN,
      message,
      ERROR_CODES.CUSTOMER_BLACKLISTED
    );
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(
      HTTP_STATUS.FORBIDDEN,
      message,
      ERROR_CODES.AUTHORIZATION_ERROR
    );
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(HTTP_STATUS.NOT_FOUND, message, ERROR_CODES.NOT_FOUND);
  }

  static duplicate(message = 'Duplicate data') {
    return new ApiError(HTTP_STATUS.CONFLICT, message, ERROR_CODES.DUPLICATE_DATA);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message,
      ERROR_CODES.INTERNAL_ERROR
    );
  }
}

module.exports = ApiError;
