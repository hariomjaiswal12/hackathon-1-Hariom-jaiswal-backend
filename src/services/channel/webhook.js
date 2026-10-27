const crypto = require('crypto');
const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');

function integrationSignature(secret, rawBody) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function verifyIntegrationRequest(req, _res, next) {
  const secret = env.integrationWebhookSecret;
  const provided = String(req.get('X-Integration-Signature') || '');
  const rawBody = req.rawBody;

  if (!secret || !provided || !rawBody) {
    next(ApiError.unauthorized('Invalid integration signature'));
    return;
  }

  const expected = integrationSignature(secret, rawBody);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    next(ApiError.unauthorized('Invalid integration signature'));
    return;
  }

  next();
}

module.exports = {
  integrationSignature,
  verifyIntegrationRequest,
};
