const crypto = require('crypto');
const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../constants/roles');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizePhone(phone) {
  const digits = phoneDigits(phone);
  return digits ? `+${digits}` : '';
}

function samePhone(left, right) {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  return Boolean(a) && a === b;
}

function assertCustomer(user) {
  if (!user || user.role !== ROLES.CUSTOMER || !user.isActive) {
    throw ApiError.forbidden('A customer account is required');
  }

  if (user.isBlacklisted) {
    throw ApiError.forbidden('This customer cannot receive a booking');
  }

  return user;
}

async function findCustomerByPhone(phone) {
  const digits = phoneDigits(phone);
  if (!digits) {
    return null;
  }

  const exact = await User.findOne({
    role: ROLES.CUSTOMER,
    phone: { $in: [...new Set([String(phone).trim(), normalizePhone(phone)].filter(Boolean))] },
  });
  if (exact) {
    return exact;
  }

  const pattern = digits.split('').join('\\D*');
  const loose = await User.find({
    role: ROLES.CUSTOMER,
    phone: { $regex: `^\\+?${pattern}$` },
  }).limit(3);

  if (loose.length > 1) {
    throw ApiError.forbidden('Phone matches more than one customer');
  }

  return loose[0] || null;
}

async function findByEmailOrPhone({ email, phone }) {
  const matches = [];

  if (email) {
    const byEmail = await User.findOne({ email: normalizeEmail(email) });
    if (byEmail) matches.push(byEmail);
  }

  if (phone) {
    const byPhone = await findCustomerByPhone(phone);
    if (byPhone && !matches.some((user) => String(user.id) === String(byPhone.id))) {
      matches.push(byPhone);
    }
  }

  if (matches.length > 1) {
    throw ApiError.forbidden('Email and phone belong to different customers');
  }

  return matches[0] || null;
}

async function resolveExternalCustomer(customer) {
  const email = customer.email ? normalizeEmail(customer.email) : '';
  const phone = customer.phone ? normalizePhone(customer.phone) : '';
  const customerId = customer.customerId ? String(customer.customerId) : '';

  if (!customerId && !email && !phone) {
    throw ApiError.validation([{ field: 'customer', message: 'A customer id, email, or phone is required' }]);
  }

  if (customerId) {
    const named = assertCustomer(await User.findById(customerId));
    if (email && named.email !== email) {
      throw ApiError.forbidden('The customer id does not match the supplied email');
    }
    if (phone && named.phone && !samePhone(named.phone, phone)) {
      throw ApiError.forbidden('The customer id does not match the supplied phone');
    }
    return named;
  }

  const existing = await findByEmailOrPhone({ email, phone });
  if (existing) {
    return assertCustomer(existing);
  }

  const name = String(customer.name || '').trim();
  if (name.length < 2) {
    throw ApiError.validation([{ field: 'name', message: 'Name is required for a new customer' }]);
  }
  if (!email) {
    throw ApiError.validation([{ field: 'email', message: 'Email is required for a new customer' }]);
  }

  try {
    return await User.create({
      name,
      email,
      phone: normalizePhone(phone) || undefined,
      password: crypto.randomBytes(24).toString('hex'),
      role: ROLES.CUSTOMER,
    });
  } catch (error) {
    if (error.code === 11000) {
      const raced = await User.findOne({ email });
      if (raced) return assertCustomer(raced);
    }
    throw error;
  }
}

module.exports = {
  resolveExternalCustomer,
};
