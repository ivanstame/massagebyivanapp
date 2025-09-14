const axios = require('axios');

// Configuration - Use Heroku production environment with actual provider credentials
const BASE_URL = 'https://massagebyivan-9420304df681.herokuapp.com';
const PROVIDER_EMAIL = 'ivan@massagebyivan.com';
const PROVIDER_PASSWORD = 'nsync022';
const TEST_DATE = '2025-09-15'; // Tomorrow's date for testing

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
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

async function testAvailabilityPosting() {
  log(colors.cyan, '=== Testing Availability Posting ===');
  log(colors.blue, `Base URL: ${BASE_URL}`);
  log(colors.blue, `Provider Email: ${PROVIDER_EMAIL}`);

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

    // Step 2: Test availability posting
    log(colors.yellow, '\n2. Testing availability posting...');
    const availabilityData = {
      date: TEST_DATE,
      start: '09:00',
      end: '17:00'
    };

    log(colors.blue, 'Sending availability data:', JSON.stringify(availabilityData, null, 2));

    const postResponse = await axios.post(`${BASE_URL}/api/availability`, availabilityData, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: getCookieHeader()
      },
      withCredentials: true
    });

    log(colors.green, '✓ Availability posted successfully');
    log(colors.blue, 'Response:', JSON.stringify(postResponse.data, null, 2));

    // Step 3: Verify the availability was saved
    log(colors.yellow, '\n3. Verifying availability was saved...');
    const getResponse = await axios.get(`${BASE_URL}/api/availability/blocks/${TEST_DATE}`, {
      headers: {
        Cookie: getCookieHeader()
      },
      withCredentials: true
    });

    log(colors.green, '✓ Availability blocks retrieved');
    log(colors.blue, 'Saved availability:', JSON.stringify(getResponse.data, null, 2));

    // Step 4: Check if our posted availability is in the list
    const postedBlock = getResponse.data.find(block => 
      block.localDate === TEST_DATE
    );

    if (postedBlock) {
      log(colors.green, '\n=== TEST COMPLETED SUCCESSFULLY ===');
      log(colors.green, 'Availability posting and retrieval is working correctly!');
    } else {
      log(colors.red, '\n=== TEST FAILED ===');
      log(colors.red, 'Posted availability was not found in the database');
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
testAvailabilityPosting().catch(error => {
  log(colors.red, 'Unhandled error:', error);
  process.exit(1);
});
