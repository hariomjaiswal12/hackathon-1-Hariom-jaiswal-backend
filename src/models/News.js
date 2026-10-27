const mongoose = require('mongoose');
const { NEWS_STATUSES, NEWS_STATUS } = require('../constants/content');

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 8000,
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: NEWS_STATUSES,
      default: NEWS_STATUS.DRAFT,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

newsSchema.index({ status: 1, publishedAt: -1 });
newsSchema.index({ isPublished: 1, publishedAt: -1 });

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

newsSchema.set('toJSON', { virtuals: true, transform: removeInternalFields });
newsSchema.set('toObject', { virtuals: true, transform: removeInternalFields });

module.exports = mongoose.model('News', newsSchema);
