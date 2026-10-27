const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { verifyRetellRequest } = require('../services/integrations/retell/retell.webhook');
const retellAdapter = require('../services/integrations/retell/retell.adapter');

const MAX_BODY = 256 * 1024;

function rejected(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

const receive = asyncHandler(async (req, res) => {
  if (!req.rawBody || req.rawBody.length > MAX_BODY) {
    logger.warn('integration retell payload rejected');
    return rejected(res, 413, 'The request could not be processed.');
  }

  if (!verifyRetellRequest(req)) {
    logger.warn('integration retell signature rejected');
    return rejected(res, 401, 'Invalid integration signature');
  }

  let body;
  try {
    body = JSON.parse(req.rawBody.toString('utf8'));
  } catch (error) {
    logger.warn('integration retell payload rejected');
    return rejected(res, 400, 'Invalid JSON');
  }

  try {
    const outcome = await retellAdapter.handle(body);
    if (outcome.acknowledged) {
      return res.status(204).end();
    }
    logger.info('integration retell processed');
    return res.status(200).json({
      result: outcome.result,
      data: outcome.data,
    });
  } catch (error) {
    logger.error(`integration retell failed ${error.code || 'INTERNAL'}`);
    return rejected(res, 500, 'The request could not be processed.');
  }
});

module.exports = {
  receive,
};
