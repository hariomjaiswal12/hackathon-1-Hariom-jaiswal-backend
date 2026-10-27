const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');
const { PAYMENT_PROVIDER, PAYMENT_STATUS } = require('../../constants/payments');
const env = require('../../config/env');

class DevPaymentProvider extends PaymentProvider {
  constructor() {
    super(PAYMENT_PROVIDER.DEV_SIMULATED);
    this.signingSecret = env.jwtSecret || 'txotx_dev_payment_secret_key';
  }

  _generateSignature({ paymentReference, providerOrderId, amount, currency }) {
    const payload = `${paymentReference}:${providerOrderId}:${Number(amount).toFixed(2)}:${currency}`;
    return crypto.createHmac('sha256', this.signingSecret).update(payload).digest('hex');
  }

  async createPaymentOrder({ paymentReference, amount, currency, metadata }) {
    const providerOrderId = `dev_ord_${crypto.randomBytes(8).toString('hex')}`;
    const providerSignature = this._generateSignature({
      paymentReference,
      providerOrderId,
      amount,
      currency,
    });

    return {
      provider: this.name,
      providerOrderId,
      providerSignature,
      clientSecret: providerSignature,
      amount: Number(amount),
      currency: currency || 'EUR',
      instructions: 'Development simulation provider: use the generated providerSignature for authoritative backend verification.',
      metadata: metadata || {},
    };
  }

  async verifyPayment({
    paymentReference,
    providerPaymentId,
    providerOrderId,
    providerSignature,
    amount,
    currency,
  }) {
    if (!paymentReference || !providerOrderId || !providerSignature) {
      return {
        verified: false,
        reason: 'Missing payment verification credentials',
      };
    }

    const expectedSignature = this._generateSignature({
      paymentReference,
      providerOrderId,
      amount,
      currency,
    });

    const sigBuffer = Buffer.from(providerSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return {
        verified: false,
        reason: 'Provider payment signature mismatch',
      };
    }

    const generatedPaymentId = providerPaymentId && providerPaymentId.startsWith('dev_pay_')
      ? providerPaymentId
      : `dev_pay_${crypto.randomBytes(8).toString('hex')}`;

    return {
      verified: true,
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: generatedPaymentId,
      paidAt: new Date(),
    };
  }

  async refundPayment({ providerPaymentId, amount, currency, reason }) {
    return {
      verified: true,
      status: PAYMENT_STATUS.REFUNDED,
      providerRefundId: `dev_ref_${crypto.randomBytes(8).toString('hex')}`,
      refundedAt: new Date(),
      amount,
      currency,
      reason: reason || 'Customer requested cancellation before refund cutoff',
    };
  }
}

module.exports = DevPaymentProvider;
