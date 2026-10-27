const env = require('./env');
const ApiError = require('../utils/ApiError');

const DEFAULT_ALLOWED_ORIGINS = [
  'https://hackathon-1-hariom-jaiswal-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().replace(/\/+$/, '');
}

function getClientOrigins() {
  const sources = [
    env.clientUrl,
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
    process.env.ALLOWED_ORIGINS,
  ];

  const origins = new Set(DEFAULT_ALLOWED_ORIGINS.map(normalizeOrigin));

  for (const src of sources) {
    if (src && typeof src === 'string') {
      src
        .split(',')
        .map(normalizeOrigin)
        .filter(Boolean)
        .forEach((item) => origins.add(item));
    }
  }

  return Array.from(origins);
}

function isVercelOrigin(origin) {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'hackathon-1-hariom-jaiswal-frontend.vercel.app') {
      return true;
    }
    if (/^hackathon-1-hariom-jaiswal-frontend(-[a-z0-9-]+)?\.vercel\.app$/i.test(parsed.hostname)) {
      return true;
    }
  } catch (_e) {
    return false;
  }
  return false;
}

function isLocalhostOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    );
  } catch (_e) {
    return false;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  const configuredOrigins = getClientOrigins();

  if (configuredOrigins.includes(normalized)) {
    return true;
  }

  if (isVercelOrigin(normalized)) {
    return true;
  }

  if (isLocalhostOrigin(normalized)) {
    return true;
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
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

module.exports = corsOptions;
module.exports.isAllowedOrigin = isAllowedOrigin;
module.exports.getClientOrigins = getClientOrigins;
