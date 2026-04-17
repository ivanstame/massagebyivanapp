const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');

const BlockedTimeSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: { type: Date, required: true },
  localDate: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true }
}, { timestamps: true });

BlockedTimeSchema.pre('save', function(next) {
  try {
    const startDT = DateTime.fromJSDate(this.start, { zone: 'UTC' }).setZone(DEFAULT_TZ);
    const endDT = DateTime.fromJSDate(this.end, { zone: 'UTC' }).setZone(DEFAULT_TZ);

    if (!startDT.hasSame(endDT, 'day')) {
      throw new Error('Start and end times must be within the same day');
    }

    this.localDate = startDT.toFormat(TIME_FORMATS.ISO_DATE);
    this.date = startDT.startOf('day').toUTC().toJSDate();

    next();
  } catch (error) {
    next(error);
  }
});

BlockedTimeSchema.index({ provider: 1, localDate: 1 });

module.exports = mongoose.model('BlockedTime', BlockedTimeSchema);
