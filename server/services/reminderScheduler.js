const Booking = require('../models/Booking');
const User = require('../models/User');
const smsService = require('./smsService');
const { formatPhoneNumber } = require('../../src/utils/phoneUtils');
const { DateTime } = require('luxon');
const logger = require('../utils/logger');

// Run every hour to check for upcoming appointments
const startReminderScheduler = () => {
  setInterval(async () => {
    try {
      const now = DateTime.now().setZone('America/Los_Angeles');
      logger.info(`Running reminder scheduler at ${now.toISO()}`);
      
      // Calculate time windows for reminders
      const twentyFourHoursLater = now.plus({ hours: 24 });
      const oneHourLater = now.plus({ hours: 1 });
      
      // Find bookings that need 24-hour reminders
      const bookingsFor24hReminder = await Booking.find({
        status: 'confirmed',
        'reminders.sent24h': false,
        localDate: twentyFourHoursLater.toFormat('yyyy-MM-dd'),
        startTime: twentyFourHoursLater.toFormat('HH:mm')
      }).populate('provider client');
      
      // Find bookings that need 1-hour reminders
      const bookingsFor1hReminder = await Booking.find({
        status: 'confirmed',
        'reminders.sent1h': false,
        localDate: oneHourLater.toFormat('yyyy-MM-dd'),
        startTime: oneHourLater.toFormat('HH:mm')
      }).populate('provider client');
      
    // Process 24-hour reminders
    for (const booking of bookingsFor24hReminder) {
      await sendReminder(booking, '24-hour');
      booking.reminders.sent24h = true;
      await booking.save();
    }
    
    // Process 1-hour reminders
    for (const booking of bookingsFor1hReminder) {
      await sendReminder(booking, '1-hour');
      booking.reminders.sent1h = true;
      await booking.save();
    }
      
      logger.info(`Sent ${bookingsFor24hReminder.length} 24h reminders and ${bookingsFor1hReminder.length} 1h reminders`);
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
