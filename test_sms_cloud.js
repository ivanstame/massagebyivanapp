#!/usr/bin/env node

/**
 * SMS Gateway Cloud Test Script
 * Tests the SMS sending functionality using the cloud server mode
 */

require('dotenv').config();
const smsService = require('./server/services/smsService');

// Configuration
const TEST_PHONE_NUMBER = process.argv[2] || '+16579448295'; // Use command line arg or default
const TEST_MESSAGE = 'Hello! This is a test message from SMS Gateway Cloud. If you receive this, the integration is working! 🎉';

console.log('='.repeat(60));
console.log('SMS Gateway Cloud Test');
console.log('='.repeat(60));
console.log('\nConfiguration:');
console.log(`  Endpoint: https://api.sms-gate.app`);
console.log(`  Username: ${process.env.SMS_GATEWAY_USERNAME}`);
console.log(`  Device ID: ${process.env.SMS_GATEWAY_DEVICE_ID}`);
console.log(`  Test Phone: ${TEST_PHONE_NUMBER}`);
console.log('\n' + '-'.repeat(60));

async function testSMS() {
  try {
    console.log('\n📤 Sending test SMS...');
    console.log(`   To: ${TEST_PHONE_NUMBER}`);
    console.log(`   Message: "${TEST_MESSAGE}"`);
    
    // Send SMS without user object (will skip consent check)
    const result = await smsService.sendSms(TEST_PHONE_NUMBER, TEST_MESSAGE);
    
    if (result) {
      console.log('\n✅ SUCCESS! SMS sent to gateway!');
      console.log('\nResponse Details:');
      console.log(`   Message ID: ${result.id}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Recipient: ${result.to}`);
      console.log('\n📱 Check your Android SMS Gateway app Messages tab');
      console.log('   The message should appear there and be sent to your phone.');
      console.log('\n' + '='.repeat(60));
      console.log('✅ Test completed successfully!');
      console.log('='.repeat(60));
      process.exit(0);
    } else {
      console.log('\n⚠️  SMS was not sent (likely due to consent check)');
      process.exit(0);
    }
    
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
    console.log('3. Check Android app Messages tab for error details');
    console.log('4. Ensure phone number is in E.164 format (+1234567890)');
    
    process.exit(1);
  }
}

console.log('\nStarting test in 2 seconds...');
setTimeout(testSMS, 2000);
