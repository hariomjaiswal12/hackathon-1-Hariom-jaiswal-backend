/**
 * Abstract PaymentProvider base class.
 * Ensures that booking logic does not tightly couple to any specific payment gateway.
 */
class PaymentProvider {
  constructor(name) {
    if (!name) {
      throw new Error('PaymentProvider requires a provider name');
    }
    this.name = name;
  }

  /**
   * Create a payment intent or order with the provider.
   * @param {Object} options
   * @param {string} options.paymentReference - Internal TXOTX payment reference
   * @param {number} options.amount - Payment amount
   * @param {string} options.currency - Currency code (e.g. 'EUR')
   * @param {Object} [options.metadata] - Safe metadata
   * @returns {Promise<Object>} Provider order details (e.g. providerOrderId, clientSecret, etc.)
   */
  async createPaymentOrder(_options) {
    throw new Error(`createPaymentOrder not implemented for provider ${this.name}`);
  }

  /**
   * Authoritatively verify a payment against provider records or signatures.
   * @param {Object} options
   * @param {string} options.providerPaymentId - Provider payment ID from client
   * @param {string} [options.providerOrderId] - Order/Intent ID
   * @param {string} [options.providerSignature] - Signature/token
   * @param {number} options.amount - Expected amount
   * @param {string} options.currency - Expected currency
   * @returns {Promise<Object>} Verification result with status, providerPaymentId, paidAt
   */
  async verifyPayment(_options) {
    throw new Error(`verifyPayment not implemented for provider ${this.name}`);
  }

  /**
   * Request a refund with the provider.
   * @param {Object} options
   * @param {string} options.providerPaymentId - Provider payment ID
   * @param {number} options.amount - Refund amount
   * @param {string} options.currency - Currency code
   * @param {string} [options.reason] - Refund reason
   * @returns {Promise<Object>} Refund result with status, providerRefundId, refundedAt
   */
  async refundPayment(_options) {
    throw new Error(`refundPayment not implemented for provider ${this.name}`);
  }
}

module.exports = PaymentProvider;
