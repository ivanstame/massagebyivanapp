#!/usr/bin/env node

/**
 * Test script for availability management functionality
 * Tests delete and modify operations with and without booking conflicts
 */

const axios = require('axios');
const { DateTime } = require('luxon');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'ivan@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Test123!';

let authCookie = '';
let providerId = '';

// Helper function to make authenticated requests
const makeRequest = async (method, url, data = null) => {
  const config = {
    method,
    url: `${BASE_URL}${url}`,
    headers: {
      'Cookie': authCookie,
      'Content-Type': 'application/json'
    },
    withCredentials: true,
    validateStatus: () => true // Don't throw on any status
  };
  
  if (data) {
    config.data = data;
  }
  
  return axios(config);
};

// Test scenarios
const tests = {
  async login() {
    console.log('\n📝 Logging in as provider...');
    const response = await axios.post(
      `${BASE_URL}/api/auth/login`,
      { email: TEST_EMAIL, password: TEST_PASSWORD },
      { withCredentials: true }
    );
    
    if (response.status === 200) {
      authCookie = response.headers['set-cookie']?.[0] || '';
      providerId = response.data.user._id;
      console.log('✅ Login successful');
      console.log(`   Provider ID: ${providerId}`);
      return true;
    } else {
      console.error('❌ Login failed:', response.data);
      return false;
    }
  },

  async createAvailability() {
    console.log('\n📝 Creating test availability blocks...');
    const tomorrow = DateTime.now().plus({ days: 1 });
    const dateStr = tomorrow.toFormat('yyyy-MM-dd');
    
    // Create two availability blocks for testing
    const blocks = [
      { date: dateStr, start: '09:00', end: '12:00' },
      { date: dateStr, start: '14:00', end: '18:00' }
    ];
    
    const createdBlocks = [];
    for (const block of blocks) {
      const response = await makeRequest('POST', '/api/availability', block);
      if (response.status === 201) {
        createdBlocks.push(response.data);
        console.log(`✅ Created availability: ${block.start} - ${block.end}`);
        console.log(`   Block ID: ${response.data._id}`);
      } else {
        console.error('❌ Failed to create availability:', response.data);
      }
    }
    
    return createdBlocks;
  },

  async createBooking(availabilityBlock) {
    console.log('\n📝 Creating test booking within availability...');
    const blockStart = DateTime.fromISO(availabilityBlock.start);
    const bookingStart = blockStart.plus({ hours: 1 });
    
    const bookingData = {
      providerId: providerId,
      date: blockStart.toFormat('yyyy-MM-dd'),
      startTime: bookingStart.toFormat('HH:mm'),
      duration: 60,
      location: {
        address: '123 Test St, San Francisco, CA',
        lat: 37.7749,
        lng: -122.4194
      },
      serviceType: { id: 'test-package', name: 'Test Package' },
      recipientType: 'self'
    };
    
    const response = await makeRequest('POST', '/api/bookings', bookingData);
    if (response.status === 201) {
      console.log('✅ Created booking');
      console.log(`   Booking ID: ${response.data._id}`);
      console.log(`   Time: ${response.data.startTime} - ${response.data.endTime}`);
      return response.data;
    } else {
      console.error('❌ Failed to create booking:', response.data);
      return null;
    }
  },

  async testDeleteWithoutBookings(blockId) {
    console.log('\n🧪 TEST: Delete availability WITHOUT bookings...');
    const response = await makeRequest('DELETE', `/api/availability/${blockId}`);
    
    if (response.status === 200) {
      console.log('✅ PASS: Availability deleted successfully');
      return true;
    } else {
      console.error('❌ FAIL: Unexpected response:', response.status, response.data);
      return false;
    }
  },

  async testDeleteWithBookings(blockId) {
    console.log('\n🧪 TEST: Delete availability WITH bookings (should fail)...');
    const response = await makeRequest('DELETE', `/api/availability/${blockId}`);
    
    if (response.status === 400 && response.data.conflicts) {
      console.log('✅ PASS: Delete properly blocked due to bookings');
      console.log(`   Message: ${response.data.message}`);
      console.log(`   Conflicts: ${response.data.conflicts.length} booking(s)`);
      response.data.conflicts.forEach(conflict => {
        console.log(`     - ${conflict.time} (${conflict.client})`);
      });
      return true;
    } else if (response.status === 200) {
      console.error('❌ FAIL: Delete succeeded when it should have been blocked!');
      return false;
    } else {
      console.error('❌ FAIL: Unexpected response:', response.status, response.data);
      return false;
    }
  },

  async testModifyWithConflict(blockId) {
    console.log('\n🧪 TEST: Modify availability to conflict with booking...');
    
    // Try to modify to a time that would exclude the booking
    const modifyData = {
      start: '09:00',
      end: '10:00' // This should conflict with booking at 10:00
    };
    
    const response = await makeRequest('PUT', `/api/availability/${blockId}`, modifyData);
    
    if (response.status === 400 && response.data.conflicts) {
      console.log('✅ PASS: Modification properly blocked due to conflicts');
      console.log(`   Message: ${response.data.message}`);
      return true;
    } else if (response.status === 200) {
      console.error('❌ FAIL: Modification succeeded when it should have been blocked!');
      return false;
    } else {
      console.error('❌ FAIL: Unexpected response:', response.status, response.data);
      return false;
    }
  },

  async testModifyWithoutConflict(blockId) {
    console.log('\n🧪 TEST: Modify availability without conflicts...');
    
    // Extend the availability (should not conflict)
    const modifyData = {
      start: '09:00',
      end: '13:00' // Extended by 1 hour
    };
    
    const response = await makeRequest('PUT', `/api/availability/${blockId}`, modifyData);
    
    if (response.status === 200) {
      console.log('✅ PASS: Modification successful');
      console.log(`   New times: ${modifyData.start} - ${modifyData.end}`);
      return true;
    } else {
      console.error('❌ FAIL: Unexpected response:', response.status, response.data);
      return false;
    }
  },

  async cleanup(blocks) {
    console.log('\n🧹 Cleaning up test data...');
    for (const block of blocks) {
      if (block && block._id) {
        await makeRequest('DELETE', `/api/availability/${block._id}`);
      }
    }
    console.log('✅ Cleanup complete');
  }
};

// Main test runner
async function runTests() {
  console.log('========================================');
  console.log('   AVAILABILITY MANAGEMENT TEST SUITE   ');
  console.log('========================================');
  
  let testsPassed = 0;
  let totalTests = 0;
  let createdBlocks = [];
  
  try {
    // Login
    if (!await tests.login()) {
      console.error('\n❌ Cannot proceed without authentication');
      process.exit(1);
    }
    
    // Create test data
    createdBlocks = await tests.createAvailability();
    if (createdBlocks.length < 2) {
      console.error('\n❌ Failed to create test availability blocks');
      process.exit(1);
    }
    
    // Create a booking in the first block
    const booking = await tests.createBooking(createdBlocks[0]);
    if (!booking) {
      console.error('\n❌ Failed to create test booking');
      process.exit(1);
    }
    
    // Run tests
    const testResults = [];
    
    // Test 1: Delete without bookings (second block)
    totalTests++;
    if (await tests.testDeleteWithoutBookings(createdBlocks[1]._id)) {
      testsPassed++;
      testResults.push('✅ Delete without bookings');
      // Remove from cleanup list since it's already deleted
      createdBlocks[1] = null;
    } else {
      testResults.push('❌ Delete without bookings');
    }
    
    // Test 2: Delete with bookings (first block)
    totalTests++;
    if (await tests.testDeleteWithBookings(createdBlocks[0]._id)) {
      testsPassed++;
      testResults.push('✅ Delete with bookings blocked');
    } else {
      testResults.push('❌ Delete with bookings blocked');
    }
    
    // Test 3: Modify with conflict
    totalTests++;
    if (await tests.testModifyWithConflict(createdBlocks[0]._id)) {
      testsPassed++;
      testResults.push('✅ Modify with conflict blocked');
    } else {
      testResults.push('❌ Modify with conflict blocked');
    }
    
    // Test 4: Modify without conflict
    totalTests++;
    if (await tests.testModifyWithoutConflict(createdBlocks[0]._id)) {
      testsPassed++;
      testResults.push('✅ Modify without conflict');
    } else {
      testResults.push('❌ Modify without conflict');
    }
    
    // Summary
    console.log('\n========================================');
    console.log('            TEST SUMMARY                ');
    console.log('========================================');
    testResults.forEach(result => console.log(result));
    console.log(`\nTests Passed: ${testsPassed}/${totalTests}`);
    
    if (testsPassed === totalTests) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log(`\n⚠️ ${totalTests - testsPassed} test(s) failed`);
    }
    
  } catch (error) {
    console.error('\n❌ Test execution error:', error.message);
  } finally {
    // Cleanup
    await tests.cleanup(createdBlocks);
  }
  
  process.exit(testsPassed === totalTests ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
