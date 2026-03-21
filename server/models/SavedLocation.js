const mongoose = require('mongoose');

const SavedLocationSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true // e.g. "Peters Chiropractic", "Home"
  },
  address: {
    type: String,
    required: true
  },
  lat: {
    type: Number,
    required: true
  },
  lng: {
    type: Number,
    required: true
  },
  isHomeBase: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// One home base per provider
SavedLocationSchema.index(
  { provider: 1, isHomeBase: 1 },
  { unique: true, partialFilterExpression: { isHomeBase: true } }
);

module.exports = mongoose.model('SavedLocation', SavedLocationSchema);
