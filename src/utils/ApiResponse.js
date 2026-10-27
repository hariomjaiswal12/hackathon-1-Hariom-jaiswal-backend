const HTTP_STATUS = require('../constants/httpStatus');

class ApiResponse {
  static success(res, statusCode, message, data) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static ok(res, message, data) {
    return ApiResponse.success(res, HTTP_STATUS.OK, message, data);
  }

  static created(res, message, data) {
    return ApiResponse.success(res, HTTP_STATUS.CREATED, message, data);
  }
}

module.exports = ApiResponse;
