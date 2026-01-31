const axios = require('axios');
const logger = require('../utils/logger');
const User = require('../models/User');

/**
 * Send SMS message using Android SMS Gateway (Cloud Server Mode)
 * Only sends if recipient has given consent
 * @param {string} to - Recipient phone number in E.164 format
 * @param {string} body - Message content
 * @param {Object} [user] - Optional user object to check SMS consent
 * @returns {Promise<Object|null>} Gateway response object or null if not sent
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
    
    // Cloud Server API endpoint
    const endpoint = 'https://api.sms-gate.app/3rdparty/v1/messages';
    
    // Create Basic Auth header with cloud credentials
    const username = process.env.SMS_GATEWAY_USERNAME;
    const password = process.env.SMS_GATEWAY_PASSWORD;
    const authString = Buffer.from(`${username}:${password}`).toString('base64');
    
    // Prepare request payload according to SMS Gateway Cloud API spec
    const payload = {
      phoneNumbers: [to],
      textMessage: {
        text: body
      }
    };
    
    // Add device ID for cloud server mode
    if (process.env.SMS_GATEWAY_DEVICE_ID) {
      payload.deviceId = process.env.SMS_GATEWAY_DEVICE_ID;
    }
    
    // Add optional SIM number if configured
    if (process.env.SMS_GATEWAY_SIM_NUMBER) {
      payload.simNumber = parseInt(process.env.SMS_GATEWAY_SIM_NUMBER, 10);
    }
    
    // Make HTTPS POST request to Android SMS Gateway Cloud API
    const response = await axios.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`
      },
      timeout: 15000 // 15 second timeout for cloud requests
    });
    
    logger.info(`SMS sent to ${to} via SMS Gateway Cloud: ${response.data.id || 'success'}`);
    
    // Return response in a format similar to Twilio for compatibility
    return {
      id: response.data.id,
      to: to,
      body: body,
      status: response.data.state || 'sent',
      gatewayResponse: response.data
    };
    
  } catch (error) {
    // Enhanced error logging
    if (error.response) {
      // The request was made and the server responded with an error status
      logger.error(`SMS Gateway Cloud error for ${to}: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`);
    } else if (error.request) {
      // The request was made but no response was received
      logger.error(`Failed to reach SMS Gateway Cloud for ${to}: ${error.message}`);
    } else {
      // Something else happened
      logger.error(`Failed to send SMS to ${to}: ${error.message}`);
    }
    throw error;
  }
};

module.exports = {
  sendSms
};
