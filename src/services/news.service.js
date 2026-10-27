const News = require('../models/News');
const ApiError = require('../utils/ApiError');
const { NEWS_STATUS } = require('../constants/content');
const { slugify, normalizeImageUrl } = require('../utils/content');

function presentArticle(article, { includeAdmin = false } = {}) {
  const plain = article.toObject ? article.toObject() : article;
  const publicArticle = {
    id: String(plain.id || plain._id),
    title: plain.title,
    slug: plain.slug,
    excerpt: plain.excerpt,
    content: plain.content,
    imageUrl: plain.imageUrl || null,
    status: plain.status,
    isPublished: Boolean(plain.isPublished),
    publishedAt: plain.publishedAt || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };

  if (!includeAdmin) {
    return publicArticle;
  }

  return {
    ...publicArticle,
    createdBy: plain.createdBy ? String(plain.createdBy) : null,
    archivedAt: plain.archivedAt || null,
  };
}

async function reserveSlug(requested, title, ignoreId) {
  const base = slugify(requested || title);

  if (!base) {
    throw ApiError.validation([{ field: 'slug', message: 'Slug must contain letters or numbers' }]);
  }

  const filter = { slug: base };
  if (ignoreId) filter._id = { $ne: ignoreId };
  const existing = await News.exists(filter);

  if (existing) {
    throw ApiError.duplicate('A news article with this slug already exists');
  }

  return base;
}

function applyStatus(article, status) {
  const publishing = status === NEWS_STATUS.PUBLISHED;
  article.status = status;
  article.isPublished = publishing;
  if (publishing && !article.publishedAt) {
    article.publishedAt = new Date();
  }
  article.archivedAt = status === NEWS_STATUS.ARCHIVED ? article.archivedAt || new Date() : null;
}

async function createArticle({ actor, input }) {
  const status = input.status || NEWS_STATUS.DRAFT;
  const article = new News({
    title: String(input.title).trim(),
    slug: await reserveSlug(input.slug, input.title),
    excerpt: String(input.excerpt).trim(),
    content: String(input.content).trim(),
    imageUrl: normalizeImageUrl(input.imageUrl) || null,
    createdBy: actor.id,
  });
  applyStatus(article, status);
  await article.save();
  return presentArticle(article, { includeAdmin: true });
}

async function listAdminArticles({ status }) {
  const filter = {};
  if (status) filter.status = status;
  const articles = await News.find(filter).sort({ updatedAt: -1 });
  return articles.map((article) => presentArticle(article, { includeAdmin: true }));
}

async function getAdminArticle(id) {
  const article = await News.findById(id);
  if (!article) throw ApiError.notFound('News article not found');
  return presentArticle(article, { includeAdmin: true });
}

async function updateArticle({ id, input }) {
  const article = await News.findById(id);
  if (!article) throw ApiError.notFound('News article not found');

  if (input.title !== undefined) article.title = String(input.title).trim();
  if (input.excerpt !== undefined) article.excerpt = String(input.excerpt).trim();
  if (input.content !== undefined) article.content = String(input.content).trim();
  if (input.imageUrl !== undefined) article.imageUrl = normalizeImageUrl(input.imageUrl);
  if (input.slug !== undefined) article.slug = await reserveSlug(input.slug, article.title, article._id);
  if (input.status !== undefined) applyStatus(article, input.status);

  await article.save();
  return presentArticle(article, { includeAdmin: true });
}

async function archiveArticle(id) {
  const article = await News.findById(id);
  if (!article) throw ApiError.notFound('News article not found');
  applyStatus(article, NEWS_STATUS.ARCHIVED);
  await article.save();
  return presentArticle(article, { includeAdmin: true });
}

async function listPublicArticles() {
  const articles = await News.find({ status: NEWS_STATUS.PUBLISHED, isPublished: true })
    .sort({ publishedAt: -1, createdAt: -1 });
  return articles.map((article) => presentArticle(article));
}

async function getPublicArticle(slug) {
  const article = await News.findOne({
    slug: slugify(slug),
    status: NEWS_STATUS.PUBLISHED,
    isPublished: true,
  });

  if (!article) throw ApiError.notFound('News article not found');
  return presentArticle(article);
}

module.exports = {
  presentArticle,
  createArticle,
  listAdminArticles,
  getAdminArticle,
  updateArticle,
  archiveArticle,
  listPublicArticles,
  getPublicArticle,
};
