const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
  quiet: true,
});

function readNoShowBlacklistThreshold(raw = process.env.NO_SHOW_BLACKLIST_THRESHOLD) {
  if (raw === undefined || raw === '') {
    return 3;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 3;
}

function readJobConfig() {
  function enabled(name) {
    return process.env[name] === 'true';
  }

  function wholeNumber(name, fallback) {
    const raw = process.env[name];

    if (raw === undefined || raw === '') {
      return fallback;
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  }

  return {
    jobsEnabled: enabled('JOBS_ENABLED'),
    bookingReminderEnabled: enabled('BOOKING_REMINDER_ENABLED'),
    waitlistExpiryEnabled: enabled('WAITLIST_EXPIRY_ENABLED'),
    bookingCleanupEnabled: enabled('BOOKING_CLEANUP_ENABLED'),
    bookingReminderMinutes: wholeNumber('BOOKING_REMINDER_MINUTES', 120),
    waitlistExpiryHours: wholeNumber('WAITLIST_EXPIRY_HOURS', 24),
  };
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function validateEnv() {
  const errors = [];

  if (isProduction) {
    if (!process.env.MONGODB_URI || !process.env.MONGODB_URI.trim()) {
      errors.push('MONGODB_URI is required in production');
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      errors.push('JWT_SECRET must be at least 16 characters in production');
    }
    if (!process.env.CLIENT_URL || process.env.CLIENT_URL === '*') {
      errors.push('CLIENT_URL must be specified and cannot be wildcard "*" in production');
    }
  }

  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`PORT must be a valid integer between 1 and 65535 (got ${process.env.PORT})`);
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n - ${errors.join('\n - ')}`);
  }
}

function configurationState(name) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') {
    return 'NOT_CONFIGURED';
  }
  if (String(raw).trim() === 'true') {
    return 'ENABLED';
  }
  return 'DISABLED';
}

function describeStartupConfiguration() {
  return {
    scheduler: configurationState('JOBS_ENABLED'),
    bookingReminder: configurationState('BOOKING_REMINDER_ENABLED'),
    waitlistExpiry: configurationState('WAITLIST_EXPIRY_ENABLED'),
    bookingCleanup: configurationState('BOOKING_CLEANUP_ENABLED'),
    deposits: configurationState('DEPOSIT_ENABLED'),
    payments: 'development',
  };
}

const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jobs: readJobConfig(),
  noShowBlacklistThreshold: readNoShowBlacklistThreshold(),
  integrationWebhookSecret: process.env.INTEGRATION_WEBHOOK_SECRET || '',
  retellApiKey: process.env.RETELL_API_KEY || '',
  retellWebhookSecret: process.env.RETELL_WEBHOOK_SECRET || '',
  retellAgentId: process.env.RETELL_AGENT_ID || '',
  retellEnabled: process.env.RETELL_ENABLED === 'true' || Boolean(process.env.RETELL_API_KEY || process.env.RETELL_WEBHOOK_SECRET),
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || '',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappEnabled: process.env.WHATSAPP_ENABLED === 'true' || Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),
  validateEnv,
};

module.exports = env;
module.exports.readJobConfig = readJobConfig;
module.exports.readNoShowBlacklistThreshold = readNoShowBlacklistThreshold;
module.exports.validateEnv = validateEnv;
module.exports.describeStartupConfiguration = describeStartupConfiguration;
