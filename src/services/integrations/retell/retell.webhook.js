const crypto = require('crypto');
const env = require('../../../config/env');

const MAX_AGE_MS = 5 * 60 * 1000;

function signRetellBody(rawBody, apiKey, timestamp = Date.now()) {
  const stamp = String(timestamp);
  const digest = crypto.createHmac('sha256', apiKey).update(`${rawBody}${stamp}`).digest('hex');
  return `v=${stamp},d=${digest}`;
}

function signaturesMatch(provided, expected) {
  const providedBuffer = Buffer.from(String(provided).toLowerCase());
  const expectedBuffer = Buffer.from(String(expected).toLowerCase());
  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function verifyRetellSignature(rawBody, signature, apiKey = (env.retellWebhookSecret || env.retellApiKey), now = Date.now()) {
  if (!apiKey || !signature || rawBody === undefined || rawBody === null) {
    return false;
  }

  const match = /^v=(\d+),d=([0-9a-f]+)$/i.exec(String(signature).trim());
  if (!match) {
    return false;
  }

  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > MAX_AGE_MS) {
    return false;
  }

  const expected = crypto.createHmac('sha256', apiKey).update(`${rawBody}${match[1]}`).digest('hex');
  return signaturesMatch(match[2], expected);
}

function verifyRetellRequest(req) {
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
  return verifyRetellSignature(rawBody, req.get('X-Retell-Signature'));
}

module.exports = {
  signRetellBody,
  verifyRetellSignature,
  verifyRetellRequest,
};
