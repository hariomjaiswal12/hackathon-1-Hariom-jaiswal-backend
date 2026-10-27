const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const newsService = require('../services/news.service');

const createArticle = asyncHandler(async (req, res) => {
  const article = await newsService.createArticle({ actor: req.user, input: req.body });
  return ApiResponse.created(res, 'News article created', { article });
});

const listAdminArticles = asyncHandler(async (req, res) => {
  const articles = await newsService.listAdminArticles({ status: req.query.status });
  return ApiResponse.ok(res, 'News retrieved', { articles });
});

const getAdminArticle = asyncHandler(async (req, res) => {
  const article = await newsService.getAdminArticle(req.params.id);
  return ApiResponse.ok(res, 'News article retrieved', { article });
});

const updateArticle = asyncHandler(async (req, res) => {
  const article = await newsService.updateArticle({ id: req.params.id, input: req.body });
  return ApiResponse.ok(res, 'News article updated', { article });
});

const archiveArticle = asyncHandler(async (req, res) => {
  const article = await newsService.archiveArticle(req.params.id);
  return ApiResponse.ok(res, 'News article archived', { article });
});

const listPublicArticles = asyncHandler(async (req, res) => {
  const articles = await newsService.listPublicArticles();
  return ApiResponse.ok(res, 'News retrieved', { articles });
});

const getPublicArticle = asyncHandler(async (req, res) => {
  const article = await newsService.getPublicArticle(req.params.slug);
  return ApiResponse.ok(res, 'News article retrieved', { article });
});

module.exports = {
  createArticle,
  listAdminArticles,
  getAdminArticle,
  updateArticle,
  archiveArticle,
  listPublicArticles,
  getPublicArticle,
};
