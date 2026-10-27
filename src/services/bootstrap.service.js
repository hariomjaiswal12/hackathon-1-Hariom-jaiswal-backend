const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const logger = require('../utils/logger');

const DEMO_USERS = [
  {
    name: 'Admin Txotx',
    email: 'admin@iturrieta.eus',
    password: 'Admin12345!',
    role: ROLES.ADMIN,
    phone: '+34 685 72 15 90',
  },
  {
    name: 'Staff Iturrieta',
    email: 'staff@iturrieta.eus',
    password: 'Staff12345!',
    role: ROLES.STAFF,
    phone: '+34 685 72 15 91',
  },
  {
    name: 'Amaia Agirre',
    email: 'amaia@iturrieta.eus',
    password: 'Customer12345!',
    role: ROLES.CUSTOMER,
    phone: '+34 685 72 15 92',
  },
];

async function ensureDemoUsers() {
  for (const u of DEMO_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      await User.create(u);
      logger.info(`[BOOTSTRAP] Created demo user: ${u.email} (${u.role})`);
    }
  }
}

async function ensureEssentialData() {
  try {
    await ensureDemoUsers();
  } catch (err) {
    logger.error(`[BOOTSTRAP] Failed to ensure demo users: ${err.message}`);
  }
}

module.exports = {
  DEMO_USERS,
  ensureEssentialData,
  ensureDemoUsers,
};
