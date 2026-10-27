const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { ROLE_LIST, ROLES } = require('../constants/roles');
const { BCRYPT_SALT_ROUNDS } = require('../constants/security');
const { BLACKLIST_STATUS, BLACKLIST_STATUSES } = require('../constants/blacklist');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'Email must be at most 254 characters'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone must be at most 20 characters'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ROLE_LIST,
      default: ROLES.CUSTOMER,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isBlacklisted: {
      type: Boolean,
      default: false,
    },
    noShowCount: {
      type: Number,
      default: 0,
      min: [0, 'No-show count cannot be negative'],
    },
    blacklistStatus: {
      type: String,
      enum: BLACKLIST_STATUSES,
      default: BLACKLIST_STATUS.ACTIVE,
    },
    blacklistedAt: {
      type: Date,
      default: null,
    },
    blacklistReason: {
      type: String,
      trim: true,
      maxlength: [200, 'Blacklist reason must be at most 200 characters'],
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1, blacklistStatus: 1, noShowCount: 1 });

function removeSensitiveFields(_doc, ret) {
  delete ret.password;
  delete ret.__v;
  return ret;
}

userSchema.set('toJSON', {
  virtuals: true,
  transform: removeSensitiveFields,
});

userSchema.set('toObject', {
  virtuals: true,
  transform: removeSensitiveFields,
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) {
    return;
  }

  this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return this.toObject();
};

module.exports = mongoose.model('User', userSchema);
