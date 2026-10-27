const env = require('../../../config/env');
const logger = require('../../../utils/logger');
const { whatsappOutboundReady } = require('../providerConfig');

const recentSends = [];

function outboundConfigured() {
  return whatsappOutboundReady(env);
}

function allowSend() {
  const now = Date.now();
  while (recentSends.length > 0 && now - recentSends[0] > 60000) {
    recentSends.shift();
  }
  if (recentSends.length >= 30) {
    return false;
  }
  recentSends.push(now);
  return true;
}

async function sendText(to, body) {
  if (!outboundConfigured()) {
    return { sent: false };
  }

  if (!allowSend()) {
    logger.warn('whatsapp outbound skipped RATE_LIMITED');
    return { sent: false, error: 'RATE_LIMITED' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(env.whatsappPhoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.whatsappAccessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: String(body || '').slice(0, 4000) },
        }),
        signal: controller.signal,
      }
    );

    if (response.status === 429) {
      logger.warn('whatsapp outbound failed RATE_LIMITED');
      return { sent: false, error: 'RATE_LIMITED' };
    }

    if (!response.ok) {
      logger.warn(`whatsapp outbound failed PROVIDER_ERROR ${response.status}`);
      return { sent: false, error: 'PROVIDER_ERROR' };
    }

    return { sent: true };
  } catch (error) {
    const code = error && error.name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_ERROR';
    logger.warn(`whatsapp outbound failed ${code}`);
    return { sent: false, error: code };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  outboundConfigured,
  sendText,
};
