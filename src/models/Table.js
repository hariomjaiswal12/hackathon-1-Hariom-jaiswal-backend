const mongoose = require('mongoose');
const {
  TABLE_STATUS,
  TABLE_STATUSES,
  TABLE_SHAPES,
  TABLE_LOCATIONS,
} = require('../constants/tables');

const positionSchema = new mongoose.Schema(
  {
    x: {
      type: Number,
      required: [true, 'Position x is required'],
    },
    y: {
      type: Number,
      required: [true, 'Position y is required'],
    },
    rotation: {
      type: Number,
      required: [true, 'Rotation is required'],
      min: [0, 'Rotation must be between 0 and 360'],
      max: [360, 'Rotation must be between 0 and 360'],
      default: 0,
    },
  },
  { _id: false }
);

const tableSchema = new mongoose.Schema(
  {
    tableNumber: {
      type: String,
      required: [true, 'Table number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: [1, 'Table number is required'],
      maxlength: [12, 'Table number must be at most 12 characters'],
    },
    name: {
      type: String,
      trim: true,
      maxlength: [80, 'Table name must be at most 80 characters'],
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1'],
      max: [50, 'Capacity must be at most 50'],
    },
    status: {
      type: String,
      enum: TABLE_STATUSES,
      default: TABLE_STATUS.AVAILABLE,
    },
    shape: {
      type: String,
      required: [true, 'Shape is required'],
      enum: TABLE_SHAPES,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      enum: TABLE_LOCATIONS,
    },
    tags: {
      type: [String],
      default: [],
    },
    position: {
      type: positionSchema,
      required: [true, 'Position is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes must be at most 500 characters'],
    },
  },
  {
    timestamps: true,
  }
);

tableSchema.index({ isActive: 1, status: 1 });
tableSchema.index({ location: 1 });
tableSchema.index({ tags: 1 });

function removeInternalFields(_doc, ret) {
  delete ret.__v;
  return ret;
}

tableSchema.set('toJSON', {
  virtuals: true,
  transform: removeInternalFields,
});

tableSchema.set('toObject', {
  virtuals: true,
  transform: removeInternalFields,
});

tableSchema.methods.toFloorObject = function toFloorObject() {
  const table = this.toObject();

  return {
    id: table.id,
    tableNumber: table.tableNumber,
    capacity: table.capacity,
    status: table.status,
    shape: table.shape,
    location: table.location,
    tags: table.tags,
    position: {
      x: table.position.x,
      y: table.position.y,
      rotation: table.position.rotation,
    },
  };
};

module.exports = mongoose.model('Table', tableSchema);
