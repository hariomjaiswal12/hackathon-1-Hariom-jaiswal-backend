const env = require('../../../config/env');
const ApiError = require('../../../utils/ApiError');

const RETELL_API_BASE = 'https://api.retellai.com';

function isConfigured() {
  return Boolean(env.retellApiKey);
}

async function getCall(callId) {
  if (!isConfigured()) {
    throw ApiError.unauthorized('Retell is not configured');
  }

  const response = await fetch(`${RETELL_API_BASE}/v2/get-call/${encodeURIComponent(callId)}`, {
    headers: {
      Authorization: `Bearer ${env.retellApiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'Retell could not return the call', 'BAD_REQUEST');
  }

  return response.json();
}

module.exports = {
  isConfigured,
  getCall,
};
