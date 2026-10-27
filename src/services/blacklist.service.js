const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { ROLES } = require('../constants/roles');
const {
  BLACKLIST_STATUS,
  AUTOMATIC_BLACKLIST_REASON,
} = require('../constants/blacklist');
const { notifyCustomerBlacklisted } = require('./notification.service');

function presentBlacklistCustomer(user) {
  const plain = user && user.toObject ? user.toObject() : user;

  return {
    id: String(plain.id || plain._id),
    name: plain.name,
    email: plain.email,
    phone: plain.phone || null,
    role: plain.role,
    noShowCount: plain.noShowCount || 0,
    blacklistStatus: plain.blacklistStatus || BLACKLIST_STATUS.ACTIVE,
    blacklistedAt: plain.blacklistedAt || null,
    blacklistReason: plain.blacklistReason || null,
  };
}

async function findCustomer(userId) {
  if (!userId || !String(userId).match(/^[a-f\d]{24}$/i)) {
    throw ApiError.notFound('Customer not found');
  }

  const customer = await User.findOne({ _id: userId, role: ROLES.CUSTOMER });

  if (!customer) {
    throw ApiError.notFound('Customer not found');
  }

  return customer;
}

async function assertCustomerCanOriginateBooking(customerId) {
  const customer = await User.findById(customerId);

  if (customer && customer.blacklistStatus === BLACKLIST_STATUS.BLACKLISTED) {
    throw ApiError.customerBlacklisted();
  }
}

async function recordNoShow(customerId) {
  const customer = await User.findOneAndUpdate(
    { _id: customerId, role: ROLES.CUSTOMER },
    { $inc: { noShowCount: 1 } },
    { returnDocument: 'after' }
  );

  if (!customer) {
    return null;
  }

  if (
    customer.noShowCount < env.noShowBlacklistThreshold
    || customer.blacklistStatus === BLACKLIST_STATUS.BLACKLISTED
  ) {
    return presentBlacklistCustomer(customer);
  }

  const blacklisted = await User.findOneAndUpdate(
    {
      _id: customerId,
      blacklistStatus: { $ne: BLACKLIST_STATUS.BLACKLISTED },
    },
    {
      $set: {
        blacklistStatus: BLACKLIST_STATUS.BLACKLISTED,
        blacklistedAt: new Date(),
        blacklistReason: AUTOMATIC_BLACKLIST_REASON,
      },
    },
    { returnDocument: 'after' }
  );

  if (!blacklisted) {
    return presentBlacklistCustomer(customer);
  }

  await notifyCustomerBlacklisted(blacklisted);
  return presentBlacklistCustomer(blacklisted);
}

async function listBlacklist({ blacklistStatus, minNoShowCount }) {
  const filter = { role: ROLES.CUSTOMER };

  if (blacklistStatus === BLACKLIST_STATUS.ACTIVE) {
    filter.$or = [
      { blacklistStatus: BLACKLIST_STATUS.ACTIVE },
      { blacklistStatus: { $exists: false } },
      { blacklistStatus: null },
    ];
  } else if (blacklistStatus) {
    filter.blacklistStatus = blacklistStatus;
  }

  if (minNoShowCount !== undefined) {
    filter.noShowCount = { $gte: minNoShowCount };
  }

  const customers = await User.find(filter).sort({ noShowCount: -1, name: 1 });
  return customers.map(presentBlacklistCustomer);
}

async function getBlacklistCustomer(userId) {
  const customer = await findCustomer(userId);
  return presentBlacklistCustomer(customer);
}

async function blacklistCustomer({ userId, reason }) {
  await findCustomer(userId);
  const updated = await User.findOneAndUpdate(
    { _id: userId, role: ROLES.CUSTOMER },
    {
      $set: {
        blacklistStatus: BLACKLIST_STATUS.BLACKLISTED,
        blacklistedAt: new Date(),
        blacklistReason: reason,
      },
    },
    { returnDocument: 'after' }
  );

  return presentBlacklistCustomer(updated);
}

async function unblockCustomer(userId) {
  await findCustomer(userId);
  const updated = await User.findOneAndUpdate(
    { _id: userId, role: ROLES.CUSTOMER },
    {
      $set: {
        blacklistStatus: BLACKLIST_STATUS.ACTIVE,
        blacklistedAt: null,
        blacklistReason: null,
      },
    },
    { returnDocument: 'after' }
  );

  return presentBlacklistCustomer(updated);
}

module.exports = {
  presentBlacklistCustomer,
  assertCustomerCanOriginateBooking,
  recordNoShow,
  listBlacklist,
  getBlacklistCustomer,
  blacklistCustomer,
  unblockCustomer,
};
