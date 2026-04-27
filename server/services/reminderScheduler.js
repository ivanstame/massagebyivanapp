const Booking = require('../models/Booking');
const User = require('../models/User');
const smsService = require('./smsService');
const { formatPhoneNumber } = require('../../src/utils/phoneUtils');
const { DateTime } = require('luxon');
const logger = require('../utils/logger');

// Hourly check for bookings that need 24h or 1h reminders.
//
// Earlier version queried `startTime: twentyFourHoursLater.toFormat('HH:mm')`
// — an exact HH:mm match against a value the cron computes on each tick.
// Since `setInterval(60m)` drifts off the clock face (the first tick is
// 60min after server start, not on :00), the computed HH:mm rarely matched
// any booking's :00/:30 start time and reminders silently went unsent.
//
// New approach: pull every confirmed booking with an outstanding reminder
// in roughly the next 25 hours, then per-booking compute hours-until-start
// and fire the 24h or 1h reminder if it's within window. The 25-hour
// query horizon is wider than the 60-min cron cycle so drift can't miss
// anything; the per-booking `reminders.sent*h` flags keep it idempotent
// across overlapping runs.
const startReminderScheduler = () => {
  setInterval(async () => {
    try {
      const now = DateTime.now().setZone('America/Los_Angeles');
      logger.info(`Running reminder scheduler at ${now.toISO()}`);

      const cutoff = now.plus({ hours: 25 });
      const bookings = await Booking.find({
        status: 'confirmed',
        $or: [{ 'reminders.sent24h': false }, { 'reminders.sent1h': false }],
        localDate: {
          $gte: now.toFormat('yyyy-MM-dd'),
          $lte: cutoff.toFormat('yyyy-MM-dd'),
        },
      }).populate('provider client');

      let sent24h = 0;
      let sent1h = 0;

      for (const booking of bookings) {
        const startLA = DateTime.fromFormat(
          `${booking.localDate} ${booking.startTime}`,
          'yyyy-MM-dd HH:mm',
          { zone: 'America/Los_Angeles' }
        );
        const hoursUntil = startLA.diff(now, 'hours').hours;
        if (hoursUntil <= 0) continue; // already started/past — skip

        // Fire 24h first so a booking that crossed both thresholds since
        // the last run still gets both reminders in the right order.
        if (!booking.reminders.sent24h && hoursUntil <= 24) {
          await sendReminder(booking, '24-hour');
          booking.reminders.sent24h = true;
          await booking.save();
          sent24h += 1;
        }

        if (!booking.reminders.sent1h && hoursUntil <= 1) {
          await sendReminder(booking, '1-hour');
          booking.reminders.sent1h = true;
          await booking.save();
          sent1h += 1;
        }
      }

      logger.info(`Sent ${sent24h} 24h reminders and ${sent1h} 1h reminders`);
    } catch (error) {
      logger.error(`Error in reminder scheduler: ${error.message}`);
    }
  }, 60 * 60 * 1000); // Run every hour
};

const sendReminder = async (booking, reminderType) => {
  try {
    // Determine recipient details
    let recipientPhone, recipientName;
    if (booking.recipientType === 'self') {
      recipientPhone = booking.client.profile.phoneNumber;
      recipientName = booking.client.profile.fullName || booking.client.email;
    } else {
      recipientPhone = booking.recipientInfo.phone;
      recipientName = booking.recipientInfo.name;
    }
    
    // Format phone numbers
    const formattedRecipientPhone = formatPhoneNumber(recipientPhone);
    const formattedProviderPhone = formatPhoneNumber(booking.provider.profile.phoneNumber);
    
    // Construct messages
    const recipientMessage = `Reminder: Your massage with ${booking.provider.profile.fullName} is in ${reminderType} (${booking.localDate} at ${booking.startTime}).`;
    const providerMessage = `Reminder: ${recipientName}'s appointment is in ${reminderType} (${booking.localDate} at ${booking.startTime}).`;
    
    // Send SMS with consent checks
    await smsService.sendSms(formattedRecipientPhone, recipientMessage, booking.client);
    await smsService.sendSms(formattedProviderPhone, providerMessage, booking.provider);
    
    logger.info(`Sent ${reminderType} reminder for booking ${booking._id}`);
  } catch (error) {
    logger.error(`Error sending ${reminderType} reminder for booking ${booking._id}: ${error.message}`);
  }
};

module.exports = { startReminderScheduler };
