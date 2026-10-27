const DevPaymentProvider = require('./DevPaymentProvider');
const { PAYMENT_PROVIDER } = require('../../constants/payments');

const devProviderInstance = new DevPaymentProvider();

const providers = {
  [PAYMENT_PROVIDER.DEV_SIMULATED]: devProviderInstance,
};

/**
 * Get configured payment provider.
 * If another provider (like STRIPE or RAZORPAY) is specified in config/env
 * and implemented, it can be registered here.
 */
function getPaymentProvider(providerName = PAYMENT_PROVIDER.DEV_SIMULATED) {
  const provider = providers[providerName] || devProviderInstance;
  return provider;
}

function registerPaymentProvider(name, providerInstance) {
  providers[name] = providerInstance;
}

module.exports = {
  getPaymentProvider,
  registerPaymentProvider,
};
