const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('./ApiError');

function assertJwtConfigured() {
  if (!env.jwtSecret) {
    throw ApiError.internal('JWT_SECRET is not configured');
  }
}

function generateAccessToken(user) {
  assertJwtConfigured();

  return jwt.sign(
    {
      userId: String(user._id),
      role: user.role,
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
      issuer: 'txotx-os-backend',
    }
  );
}

function verifyAccessToken(token) {
  assertJwtConfigured();

  return jwt.verify(token, env.jwtSecret, {
    issuer: 'txotx-os-backend',
  });
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
};
