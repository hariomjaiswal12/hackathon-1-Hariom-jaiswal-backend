const env = require('./env');
const ApiError = require('../utils/ApiError');

function getClientOrigins() {
  return (env.clientUrl || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  const configuredOrigins = getClientOrigins();
  if (configuredOrigins.includes(origin)) {
    return true;
  }

  if (env.isProduction) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    const isOriginLocal = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';

    if (isOriginLocal) {
      for (const configured of configuredOrigins) {
        try {
          const clientUrl = new URL(configured);
          if (clientUrl.hostname === 'localhost' || clientUrl.hostname === '127.0.0.1') {
            return true;
          }
        } catch (_e) {
          // ignore invalid configured URL
        }
      }
    }
  } catch (_error) {
    // ignore invalid URL
  }

  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(ApiError.forbidden('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = corsOptions;
module.exports.isAllowedOrigin = isAllowedOrigin;
