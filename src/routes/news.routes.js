const express = require('express');
const newsController = require('../controllers/news.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  createNewsValidator,
  updateNewsValidator,
  newsIdValidator,
  listAdminNewsValidator,
  publicSlugValidator,
} = require('../validators/news.validator');

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize(ROLES.ADMIN));
adminRouter.post('/', createNewsValidator, validate, newsController.createArticle);
adminRouter.get('/', listAdminNewsValidator, validate, newsController.listAdminArticles);
adminRouter.get('/:id', newsIdValidator, validate, newsController.getAdminArticle);
adminRouter.patch('/:id', updateNewsValidator, validate, newsController.updateArticle);
adminRouter.delete('/:id', newsIdValidator, validate, newsController.archiveArticle);

const publicRouter = express.Router();
publicRouter.get('/', newsController.listPublicArticles);
publicRouter.get('/:slug', publicSlugValidator, validate, newsController.getPublicArticle);

module.exports = {
  adminRouter,
  publicRouter,
};
