const crypto = require('crypto');
const env = require('../../../config/env');

function signWhatsAppBody(rawBody, appSecret) {
  return `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

function signaturesMatch(provided, expected) {
  const providedBuffer = Buffer.from(String(provided).toLowerCase());
  const expectedBuffer = Buffer.from(String(expected).toLowerCase());
  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function verifyWhatsAppSignature(rawBody, header, appSecret = env.whatsappAppSecret) {
  if (!appSecret || !header || rawBody === undefined || rawBody === null) {
    return false;
  }

  const provided = String(header).trim().replace(/^sha256=/i, '');
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return signaturesMatch(provided, expected);
}

function verifyWhatsAppRequest(req) {
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
  return verifyWhatsAppSignature(rawBody, req.get('X-Hub-Signature-256'));
}

function readHub(query) {
  const hub = query.hub && typeof query.hub === 'object' ? query.hub : {};
  return {
    mode: query['hub.mode'] || hub.mode,
    token: query['hub.verify_token'] || hub.verify_token,
    challenge: query['hub.challenge'] || hub.challenge,
  };
}

function subscriptionChallenge(query) {
  if (!env.whatsappVerifyToken) {
    return null;
  }

  const hub = readHub(query || {});
  if (hub.mode === 'subscribe' && hub.token === env.whatsappVerifyToken && hub.challenge) {
    return String(hub.challenge);
  }

  return false;
}

module.exports = {
  signWhatsAppBody,
  verifyWhatsAppSignature,
  verifyWhatsAppRequest,
  subscriptionChallenge,
};
