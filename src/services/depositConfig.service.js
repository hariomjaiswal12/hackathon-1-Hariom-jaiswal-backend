const DepositConfig = require('../models/DepositConfig');
const { DEPOSIT_TYPE } = require('../constants/payments');

let cachedConfig = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5000;

function presentDepositConfig(config) {
  const plain = config && config.toObject ? config.toObject() : config;

  return {
    id: String(plain.id || plain._id),
    enabled: Boolean(plain.enabled),
    type: plain.type || DEPOSIT_TYPE.PER_GUEST,
    amount: Number(plain.amount) || 0,
    currency: plain.currency || 'EUR',
    minGuests: Number(plain.minGuests) || 1,
    refundCutoffHours: Number(plain.refundCutoffHours) !== undefined ? Number(plain.refundCutoffHours) : 24,
    updatedAt: plain.updatedAt || new Date(),
  };
}

async function getOrCreateDepositConfig() {
  const now = Date.now();
  if (cachedConfig && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  let config = await DepositConfig.findOne();

  if (!config) {
    config = await DepositConfig.create({
      enabled: process.env.DEPOSIT_ENABLED === 'true',
      type: process.env.DEPOSIT_TYPE || DEPOSIT_TYPE.PER_GUEST,
      amount: process.env.DEPOSIT_AMOUNT ? Number(process.env.DEPOSIT_AMOUNT) : 10,
      currency: process.env.DEPOSIT_CURRENCY || 'EUR',
      minGuests: process.env.DEPOSIT_MIN_GUESTS ? Number(process.env.DEPOSIT_MIN_GUESTS) : 1,
      refundCutoffHours: process.env.DEPOSIT_REFUND_CUTOFF_HOURS ? Number(process.env.DEPOSIT_REFUND_CUTOFF_HOURS) : 24,
    });
  }

  cachedConfig = config;
  lastCacheTime = now;
  return config;
}

async function getDepositConfig() {
  const config = await getOrCreateDepositConfig();
  return presentDepositConfig(config);
}

async function updateDepositConfig({ enabled, type, amount, currency, minGuests, refundCutoffHours, actor }) {
  let config = await DepositConfig.findOne();

  const updates = {};
  if (typeof enabled === 'boolean') updates.enabled = enabled;
  if (type) updates.type = type;
  if (amount !== undefined && amount !== null) updates.amount = Math.max(0, Number(amount));
  if (currency) updates.currency = String(currency).trim().toUpperCase();
  if (minGuests !== undefined && minGuests !== null) updates.minGuests = Math.max(1, Number(minGuests));
  if (refundCutoffHours !== undefined && refundCutoffHours !== null) {
    updates.refundCutoffHours = Math.max(0, Number(refundCutoffHours));
  }
  if (actor && actor.id) updates.updatedBy = actor.id;

  if (!config) {
    config = await DepositConfig.create(updates);
  } else {
    Object.assign(config, updates);
    await config.save();
  }

  cachedConfig = config;
  lastCacheTime = Date.now();
  return presentDepositConfig(config);
}

async function calculateDepositRequirement(guests) {
  const config = await getOrCreateDepositConfig();

  if (!config.enabled) {
    return {
      required: false,
      amount: 0,
      currency: config.currency,
      type: config.type,
      refundCutoffHours: config.refundCutoffHours,
    };
  }

  const guestCount = Number(guests) || 1;
  if (guestCount < config.minGuests) {
    return {
      required: false,
      amount: 0,
      currency: config.currency,
      type: config.type,
      refundCutoffHours: config.refundCutoffHours,
    };
  }

  const amount = config.type === DEPOSIT_TYPE.FLAT
    ? config.amount
    : config.amount * guestCount;

  return {
    required: true,
    amount,
    currency: config.currency,
    type: config.type,
    refundCutoffHours: config.refundCutoffHours,
  };
}

module.exports = {
  presentDepositConfig,
  getDepositConfig,
  updateDepositConfig,
  calculateDepositRequirement,
};
