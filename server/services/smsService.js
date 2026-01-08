const twilio = require('twilio');
const logger = require('../utils/logger');
const User = require('../models/User');

// Initialize Twilio client with credentials from environment variables
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send SMS message using Twilio only if recipient has given consent
 * @param {string} to - Recipient phone number in E.164 format
 * @param {string} body - Message content
 * @param {Object} [user] - Optional user object to check SMS consent
 * @returns {Promise<Object|null>} Twilio message object or null if not sent
 */
const sendSms = async (to, body, user = null) => {
  try {
    // Check if we have a user reference and if they've given consent
    if (user && !user.smsConsent) {
      logger.info(`Skipping SMS to ${to}: user has not consented to SMS messages`);
      return null;
    }
    
    // If no user reference, try to find user by phone number
    if (!user) {
      const userByPhone = await User.findOne({ 'profile.phoneNumber': to });
      if (userByPhone && !userByPhone.smsConsent) {
        logger.info(`Skipping SMS to ${to}: user found in DB has not consented to SMS messages`);
        return null;
      }
    }
    
    const message = await twilioClient.messages.create({
      body: body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });
    
    logger.info(`SMS sent to ${to}: ${message.sid}`);
    return message;
  } catch (error) {
    logger.error(`Failed to send SMS to ${to}: ${error.message}`);
    throw error;
  }
};

module.exports = {
  sendSms
};
