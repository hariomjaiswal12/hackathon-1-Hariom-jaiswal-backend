const PLACEHOLDER = /^(changeme|change-me|your[-_ ]?(key|token|secret)|secret|password|todo|xxx+|test|example|placeholder|none|null|undefined)$/i;

function inspectSecret(value, minLength) {
  const raw = value == null ? '' : String(value);
  if (!raw.trim()) {
    return 'missing';
  }
  if (raw !== raw.trim() || /\s/.test(raw) || raw.length < minLength || PLACEHOLDER.test(raw)) {
    return 'invalid';
  }
  return 'valid';
}

function retellSignatureState(config) {
  const webhook = inspectSecret(config.retellWebhookSecret, 16);
  const apiKey = inspectSecret(config.retellApiKey, 16);
  if (webhook === 'invalid' || apiKey === 'invalid') {
    return 'invalid';
  }
  if (webhook === 'valid' || apiKey === 'valid') {
    return 'valid';
  }
  return 'missing';
}

function agentState(config) {
  const state = inspectSecret(config.retellAgentId, 12);
  if (state === 'missing') {
    return 'missing';
  }
  if (state === 'invalid' || !String(config.retellAgentId).startsWith('agent_')) {
    return 'invalid';
  }
  return 'valid';
}

function whatsappInboundState(config) {
  const secret = inspectSecret(config.whatsappAppSecret, 16);
  const token = inspectSecret(config.whatsappVerifyToken, 16);
  if (secret === 'missing' && token === 'missing') {
    return 'missing';
  }
  if (secret === 'valid' && token === 'valid') {
    return 'valid';
  }
  return 'invalid';
}

function whatsappOutboundReady(config) {
  return inspectSecret(config.whatsappAccessToken, 20) === 'valid'
    && inspectSecret(config.whatsappPhoneNumberId, 8) === 'valid'
    && /^\d+$/.test(String(config.whatsappPhoneNumberId || ''));
}

function integrationView(config) {
  const phone = inspectSecret(config.integrationWebhookSecret, 16);
  const retell = retellSignatureState(config);
  const agent = agentState(config);
  const whatsapp = whatsappInboundState(config);
  const outbound = whatsappOutboundReady(config);
  const retellStatus = retell === 'missing'
    ? 'not_configured'
    : (retell === 'invalid' || agent === 'invalid' ? 'error' : 'ready');
  const whatsappStatus = whatsapp === 'missing'
    ? 'not_configured'
    : (whatsapp === 'invalid' ? 'error' : 'ready');

  return {
    checkedAt: new Date().toISOString(),
    webhookConfigured: phone === 'valid',
    retellConfigured: retellStatus === 'ready',
    whatsappConfigured: whatsappStatus === 'ready',
    channels: [
      {
        channel: 'website',
        label: 'Website',
        status: 'connected',
        outbound: false,
        operations: ['Availability', 'Booking', 'Cancellation', 'Reschedule'],
        detail: 'Website bookings use the booking API.',
      },
      {
        channel: 'phone',
        label: 'Phone',
        status: phone === 'missing' ? 'not_configured' : (phone === 'invalid' ? 'error' : 'ready'),
        outbound: false,
        operations: ['Availability', 'Booking', 'Cancellation', 'Reschedule'],
        detail: phone === 'valid'
          ? 'Signed phone requests can use the booking engine. No external phone provider is connected.'
          : (phone === 'invalid' ? 'The phone webhook secret is present but not valid.' : 'Not configured'),
      },
      {
        channel: 'whatsapp',
        label: 'WhatsApp',
        status: whatsappStatus,
        outbound,
        operations: ['Availability', 'Booking', 'Cancellation', 'Reschedule', 'Waitlist'],
        detail: whatsappStatus === 'not_configured'
          ? 'Not configured. WhatsApp is not connected.'
          : (whatsappStatus === 'error'
            ? 'WhatsApp credentials are present but not valid.'
            : (outbound
              ? 'WhatsApp webhooks can be verified and outbound replies are configured. A key alone is not a live connection.'
              : 'WhatsApp webhooks can be verified. Outbound WhatsApp messages are not configured.')),
      },
      {
        channel: 'retell',
        label: 'Retell',
        status: retellStatus,
        outbound: false,
        operations: ['Availability', 'Booking', 'Group booking', 'Cancellation', 'Reschedule', 'Get booking'],
        detail: retellStatus === 'not_configured'
          ? 'Not configured. Retell is not connected.'
          : (retellStatus === 'error'
            ? 'Retell credentials are present but not valid.'
            : (agent === 'valid'
              ? 'Retell webhook signatures can be verified and an agent id is set. Retell bookings are stored as PHONE. This is not a live connection.'
              : 'Retell webhook signatures can be verified. RETELL_AGENT_ID is not set. Retell bookings are stored as PHONE.')),
      },
    ],
  };
}

module.exports = {
  inspectSecret,
  whatsappOutboundReady,
  integrationView,
};
