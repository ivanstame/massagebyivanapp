const mongoose = require('mongoose');

const WeeklyTemplateSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6 // 0 = Sunday, 6 = Saturday
  },
  startTime: {
    type: String,
    required: true // "HH:mm" format in LA time
  },
  endTime: {
    type: String,
    required: true // "HH:mm" format in LA time
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// One template entry per provider per day of week
WeeklyTemplateSchema.index({ provider: 1, dayOfWeek: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyTemplate', WeeklyTemplateSchema);
