const bcrypt = require('bcrypt');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { generateAccessToken } = require('../utils/jwt');
const { ROLES } = require('../constants/roles');
const { BCRYPT_SALT_ROUNDS } = require('../constants/security');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

let dummyPasswordHashPromise;

function getDummyPasswordHash() {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = bcrypt.hash(
      'invalid-credentials-placeholder',
      BCRYPT_SALT_ROUNDS
    );
  }

  return dummyPasswordHashPromise;
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function normalizePhone(phone) {
  if (phone === undefined || phone === null) {
    return undefined;
  }

  const trimmed = String(phone).trim();
  return trimmed || undefined;
}

async function register({ name, email, phone, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    throw ApiError.duplicate('An account with this email already exists');
  }

  let user;

  try {
    user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      phone: normalizePhone(phone),
      password,
      role: ROLES.CUSTOMER,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw ApiError.duplicate('An account with this email already exists');
    }

    throw error;
  }

  const token = generateAccessToken(user);

  return {
    user: user.toSafeObject(),
    token,
  };
}

async function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  const passwordMatches = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, await getDummyPasswordHash());

  if (!user || !passwordMatches) {
    throw ApiError.unauthorized(INVALID_CREDENTIALS_MESSAGE);
  }

  if (!user.isActive) {
    throw ApiError.forbidden('This account is inactive');
  }

  if (user.isBlacklisted) {
    throw ApiError.forbidden('This account is not allowed to sign in');
  }

  const lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt } });
  user.lastLoginAt = lastLoginAt;

  const token = generateAccessToken(user);

  return {
    user: user.toSafeObject(),
    token,
  };
}

module.exports = {
  register,
  login,
};
