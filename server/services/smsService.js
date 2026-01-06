const twilio = require('twilio');
const logger = require('../utils/logger');

// Initialize Twilio client with credentials from environment variables
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send SMS message using Twilio
 * @param {string} to - Recipient phone number in E.164 format
 * @param {string} body - Message content
 * @returns {Promise<Object>} Twilio message object
 */
const sendSms = async (to, body) => {
  try {
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
