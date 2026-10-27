const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { verifyWhatsAppRequest, subscriptionChallenge } = require('../services/integrations/whatsapp/whatsapp.webhook');
const whatsappAdapter = require('../services/integrations/whatsapp/whatsapp.adapter');

const MAX_BODY = 256 * 1024;

const verify = asyncHandler(async (req, res) => {
  const challenge = subscriptionChallenge(req.query);
  if (challenge === null) {
    return res.status(401).json({
      success: false,
      code: 'AUTHENTICATION_ERROR',
      message: 'Invalid integration signature',
    });
  }
  if (challenge === false) {
    return res.status(403).json({
      success: false,
      code: 'AUTHORIZATION_ERROR',
      message: 'Invalid verification token',
    });
  }

  return res.status(200).type('text/plain').send(challenge);
});

const receive = asyncHandler(async (req, res) => {
  if (!req.rawBody || req.rawBody.length > MAX_BODY) {
    logger.warn('integration whatsapp payload rejected');
    return res.status(413).json({ success: false, message: 'The request could not be processed.' });
  }

  if (!verifyWhatsAppRequest(req)) {
    logger.warn('integration whatsapp signature rejected');
    return res.status(401).json({
      success: false,
      code: 'AUTHENTICATION_ERROR',
      message: 'Invalid integration signature',
    });
  }

  let body = {};
  try {
    body = JSON.parse(req.rawBody.toString('utf8') || '{}');
  } catch (error) {
    logger.warn('integration whatsapp payload rejected');
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid JSON',
    });
  }

  try {
    const outcome = await whatsappAdapter.handle(body);
    logger.info('integration whatsapp processed');
    return res.status(200).json({
      success: true,
      results: outcome.results,
    });
  } catch (error) {
    logger.error(`integration whatsapp failed ${error.code || 'INTERNAL'}`);
    return res.status(500).json({ success: false, message: 'The request could not be processed.' });
  }
});

module.exports = {
  verify,
  receive,
};
