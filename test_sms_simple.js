#!/usr/bin/env node

/**
 * Simple SMS Gateway Cloud Test (No Database)
 * Tests only the SMS API without database consent checks
 */

require('dotenv').config();
const axios = require('axios');

// Configuration
const TEST_PHONE_NUMBER = process.argv[2] || '+16579448295';
const TEST_MESSAGE = 'Test from SMS Gateway Cloud! Integration working! 🎉';

console.log('='.repeat(60));
console.log('SMS Gateway Cloud Test (No Database)');
console.log('='.repeat(60));
console.log('\nConfiguration:');
console.log(`  Endpoint: https://api.sms-gate.app/3rdparty/v1/messages`);
console.log(`  Username: ${process.env.SMS_GATEWAY_USERNAME}`);
console.log(`  Device ID: ${process.env.SMS_GATEWAY_DEVICE_ID}`);
console.log(`  Test Phone: ${TEST_PHONE_NUMBER}`);
console.log('\n' + '-'.repeat(60));

async function testSMS() {
  try {
    console.log('\n📤 Sending test SMS via Cloud API...');
    console.log(`   To: ${TEST_PHONE_NUMBER}`);
    console.log(`   Message: "${TEST_MESSAGE}"`);
    
    const username = process.env.SMS_GATEWAY_USERNAME;
    const password = process.env.SMS_GATEWAY_PASSWORD;
    const authString = Buffer.from(`${username}:${password}`).toString('base64');
    
    const payload = {
      phoneNumbers: [TEST_PHONE_NUMBER],
      textMessage: {
        text: TEST_MESSAGE
      },
      deviceId: process.env.SMS_GATEWAY_DEVICE_ID
    };
    
    const response = await axios.post(
      'https://api.sms-gate.app/3rdparty/v1/messages',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authString}`
        },
        timeout: 15000
      }
    );
    
    console.log('\n✅ SUCCESS! SMS sent to gateway!');
    console.log('\nResponse Details:');
    console.log(`   Message ID: ${response.data.id || 'N/A'}`);
    console.log(`   State: ${response.data.state || 'N/A'}`);
    console.log(`   Full Response: ${JSON.stringify(response.data, null, 2)}`);
    console.log('\n📱 Check your phone - SMS should arrive shortly!');
    console.log('   Also check Android SMS Gateway app Messages tab.');
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(60));
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR sending SMS:');
    console.error(`   ${error.message}`);
    
    if (error.response) {
      console.error('\n   Server Response:');
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('❌ Test failed!');
    console.log('='.repeat(60));
    
    console.log('\nTroubleshooting:');
    console.log('1. Check SMS Gateway app is in Cloud Server mode and ONLINE');
    console.log('2. Verify credentials in .env match those in the Android app');
    console.log(`3. Verify Username: ${process.env.SMS_GATEWAY_USERNAME}`);
    console.log(`4. Verify Device ID: ${process.env.SMS_GATEWAY_DEVICE_ID}`);
    console.log('5. Check Android app Messages tab for error details');
    
    process.exit(1);
  }
}

console.log('\nStarting test in 1 second...');
setTimeout(testSMS, 1000);
