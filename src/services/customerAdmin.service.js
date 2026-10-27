const User = require('../models/User');
const Booking = require('../models/Booking');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { BLACKLIST_STATUS } = require('../constants/blacklist');

const EDITABLE_FIELDS = ['name', 'email', 'phone'];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function presentCustomer(user, bookings) {
  const plain = user.toObject ? user.toObject() : user;

  return {
    id: String(plain.id || plain._id),
    name: plain.name,
    email: plain.email,
    phone: plain.phone || null,
    role: plain.role,
    isActive: plain.isActive !== false,
    noShowCount: plain.noShowCount || 0,
    blacklistStatus: plain.blacklistStatus || BLACKLIST_STATUS.ACTIVE,
    blacklistReason: plain.blacklistReason || null,
    blacklistedAt: plain.blacklistedAt || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    bookings: {
      total: bookings || 0,
    },
  };
}

function customerFilter({ q, blacklistStatus }) {
  const filter = { role: ROLES.CUSTOMER };

  if (blacklistStatus === BLACKLIST_STATUS.ACTIVE) {
    filter.$and = [{
      $or: [
        { blacklistStatus: BLACKLIST_STATUS.ACTIVE },
        { blacklistStatus: { $exists: false } },
        { blacklistStatus: null },
      ],
    }];
  } else if (blacklistStatus) {
    filter.blacklistStatus = blacklistStatus;
  }

  const term = String(q || '').trim();
  if (term) {
    const pattern = new RegExp(escapeRegex(term), 'i');
    const search = {
      $or: [
        { name: pattern },
        { email: pattern },
        { phone: pattern },
      ],
    };
    if (filter.$and) {
      filter.$and.push(search);
    } else {
      filter.$and = [search];
    }
  }

  return filter;
}

async function bookingCount(customerId) {
  return Booking.countDocuments({ customerId });
}

function buildPagination(query, total) {
  const pageGiven = query.page !== undefined && query.page !== '';
  const limitGiven = query.limit !== undefined && query.limit !== '';

  if (!pageGiven && !limitGiven) {
    return {
      page: 1,
      limit: total,
      total,
      totalPages: 1,
      applied: false,
    };
  }

  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const page = Math.min(Math.max(1, Number(query.page) || 1), totalPages);

  return {
    page,
    limit,
    total,
    totalPages,
    applied: true,
  };
}

async function listCustomers(query) {
  const filter = customerFilter(query);
  const total = await User.countDocuments(filter);
  const pagination = buildPagination(query, total);
  let finder = User.find(filter).sort({ name: 1, createdAt: 1 });

  if (pagination.applied) {
    finder = finder.skip((pagination.page - 1) * pagination.limit).limit(pagination.limit);
  }

  const customers = await finder;
  const ids = customers.map((customer) => customer._id);
  const counts = ids.length === 0
    ? []
    : await Booking.aggregate([
      { $match: { customerId: { $in: ids } } },
      { $group: { _id: '$customerId', total: { $sum: 1 } } },
    ]);
  const totals = new Map(counts.map((row) => [String(row._id), row.total]));

  return {
    customers: customers.map((customer) => presentCustomer(customer, totals.get(String(customer._id)) || 0)),
    pagination: {
      total: pagination.total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: pagination.totalPages,
    },
  };
}

async function getCustomer(id) {
  const customer = await User.findOne({ _id: id, role: ROLES.CUSTOMER });
  if (!customer) {
    throw ApiError.notFound('Customer not found');
  }

  return presentCustomer(customer, await bookingCount(customer._id));
}

async function updateCustomer(id, input) {
  const customer = await User.findOne({ _id: id, role: ROLES.CUSTOMER });
  if (!customer) {
    throw ApiError.notFound('Customer not found');
  }

  if (input.email && input.email !== customer.email) {
    const taken = await User.findOne({ email: input.email, _id: { $ne: customer._id } });
    if (taken) {
      throw ApiError.duplicate('A customer with this email already exists');
    }
    customer.email = input.email;
  }

  if (input.name !== undefined) {
    customer.name = input.name;
  }

  if (input.phone !== undefined) {
    customer.phone = input.phone || undefined;
  }

  await customer.save();
  return presentCustomer(customer, await bookingCount(customer._id));
}

module.exports = {
  EDITABLE_FIELDS,
  listCustomers,
  getCustomer,
  updateCustomer,
};
