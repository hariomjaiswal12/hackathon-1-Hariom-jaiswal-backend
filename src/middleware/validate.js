const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

function validate(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    next();
    return;
  }

  const errors = result.array().map((item) => ({
    field: item.path || item.param,
    message: item.msg,
  }));

  next(ApiError.validation(errors));
}

module.exports = validate;
