const axios = require('axios');

// Configuration - Use Heroku production environment with actual provider credentials
const BASE_URL = 'https://massagebyivan-9420304df681.herokuapp.com';
const PROVIDER_EMAIL = 'ivan@massagebyivan.com';
const PROVIDER_PASSWORD = 'nsync022';
const TEST_DATE = '2025-09-16'; // Different date to avoid conflicts

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

let cookies = [];

function storeCookies(response) {
  if (response.headers['set-cookie']) {
    cookies = response.headers['set-cookie'];
    log(colors.blue, `Stored cookies: ${cookies.join('; ')}`);
  }
}

function getCookieHeader() {
  return cookies.join('; ');
}

async function testAvailabilityFinal() {
  log(colors.cyan, '=== Final Availability Testing ===');
  log(colors.blue, `Base URL: ${BASE_URL}`);
  log(colors.blue, `Provider Email: ${PROVIDER_EMAIL}`);
  log(colors.blue, `Test Date: ${TEST_DATE}`);

  try {
    // Step 1: Login as provider
    log(colors.yellow, '\n1. Logging in as provider...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: PROVIDER_EMAIL,
      password: PROVIDER_PASSWORD
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      withCredentials: true
    });

    log(colors.green, '✓ Login successful');
    storeCookies(loginResponse);

    // Step 2: Check current availability before posting (should be empty)
    log(colors.yellow, '\n2. Checking current availability...');
    const initialResponse = await axios.get(`${BASE_URL}/api/availability/blocks/${TEST_DATE}`, {
      headers: {
        Cookie: getCookieHeader()
      },
      withCredentials: true
    });

    log(colors.blue, 'Current availability blocks:', JSON.stringify(initialResponse.data, null, 2));

    // Step 3: Test availability posting
    log(colors.yellow, '\n3. Testing availability posting...');
    const availabilityData = {
      date: TEST_DATE,
      start: '10:00',
      end: '16:00'
    };

    log(colors.magenta, 'Sending availability data:', JSON.stringify(availabilityData, null, 2));

    const postResponse = await axios.post(`${BASE_URL}/api/availability`, availabilityData, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: getCookieHeader()
      },
      withCredentials: true
    });

    log(colors.green, '✓ Availability posted successfully');
    log(colors.magenta, 'Response status:', postResponse.status);
    log(colors.magenta, 'Response data:', JSON.stringify(postResponse.data, null, 2));

    // Step 4: Verify the availability was saved
    log(colors.yellow, '\n4. Verifying availability was saved...');
    const getResponse = await axios.get(`${BASE_URL}/api/availability/blocks/${TEST_DATE}`, {
      headers: {
        Cookie: getCookieHeader()
      },
      withCredentials: true
    });

    log(colors.green, '✓ Availability blocks retrieved');
    log(colors.magenta, 'Saved availability:', JSON.stringify(getResponse.data, null, 2));

    // Step 5: Check if our posted availability is in the list
    const postedBlock = getResponse.data.find(block => 
      block.localDate === TEST_DATE
    );

    if (postedBlock) {
      log(colors.green, '\n=== TEST COMPLETED SUCCESSFULLY ===');
      log(colors.green, '✅ Availability posting is WORKING!');
      log(colors.blue, 'Posted block details:', JSON.stringify(postedBlock, null, 2));
      
      // Step 6: Clean up - delete the test availability
      log(colors.yellow, '\n5. Cleaning up test data...');
      try {
        await axios.delete(`${BASE_URL}/api/availability/${postedBlock._id}`, {
          headers: {
            Cookie: getCookieHeader()
          },
          withCredentials: true
        });
        log(colors.green, '✓ Test availability deleted successfully');
      } catch (deleteError) {
        log(colors.yellow, '⚠ Could not delete test availability (not critical):', deleteError.message);
      }
    } else {
      log(colors.red, '\n=== TEST FAILED ===');
      log(colors.red, '❌ Posted availability was not found in the database');
      log(colors.yellow, 'Available blocks count:', getResponse.data.length);
    }

  } catch (error) {
    log(colors.red, '\n=== TEST FAILED ===');
    
    if (error.response) {
      log(colors.red, `Status: ${error.response.status}`);
      log(colors.red, `Response: ${JSON.stringify(error.response.data, null, 2)}`);
      if (error.response.headers) {
        log(colors.red, `Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
      }
    } else if (error.request) {
      log(colors.red, 'No response received:', error.request);
    } else {
      log(colors.red, 'Error:', error.message);
    }

    log(colors.yellow, '\n=== DEBUG INFO ===');
    log(colors.yellow, `Current cookies: ${cookies.join('; ')}`);
  }
}

// Run the test
testAvailabilityFinal().catch(error => {
  log(colors.red, 'Unhandled error:', error);
  process.exit(1);
});
