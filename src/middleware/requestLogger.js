const logger = require('../utils/logger');

function safeUrl(url) {
  return String(url || '').replace(
    /([?&](?:hub\.verify_token|access_token|api_key|token|secret|signature)=)[^&]*/gi,
    '$1[redacted]'
  );
}

function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info(
      `${req.method} ${safeUrl(req.originalUrl)} ${res.statusCode} ${durationMs.toFixed(1)}ms`
    );
  });

  next();
}

module.exports = requestLogger;
