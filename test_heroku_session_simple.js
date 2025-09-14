const axios = require('axios');

// Configuration for Heroku
const BASE_URL = 'https://massagebyivan-9420304df681.herokuapp.com';
const TEST_EMAIL = `test_provider_heroku_${Date.now()}@test.com`;
const TEST_PASSWORD = 'testpassword123';
const PROVIDER_PASSWORD = 'B@ckstreetsback0222'; // From .env.production

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

// Simple cookie storage
let cookies = [];

// Function to extract cookies from response headers and store them
function storeCookies(response) {
  if (response.headers['set-cookie']) {
    cookies = response.headers['set-cookie'];
    log(colors.blue, `Stored cookies: ${cookies.join('; ')}`);
  }
}

// Function to get cookies for request
function getCookieHeader() {
  return cookies.join('; ');
}

async function testHerokuSessionPersistence() {
  log(colors.cyan, '=== Testing Heroku Session Persistence ===');
  log(colors.blue, `Test Email: ${TEST_EMAIL}`);
  log(colors.blue, `Base URL: ${BASE_URL}`);

  try {
    // Step 1: Test if the server is reachable
    log(colors.yellow, '\n1. Testing server connection...');
    const testResponse = await axios.get(`${BASE_URL}/api/test`);
    log(colors.green, '✓ Server is reachable');
    console.log('Test response:', testResponse.data);

    // Step 2: Register a new provider
    log(colors.yellow, '\n2. Registering provider...');
    const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      accountType: 'PROVIDER',
      providerPassword: PROVIDER_PASSWORD,
      businessName: 'Test Business Heroku'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      withCredentials: true
    });

    log(colors.green, '✓ Registration successful');
    console.log('Response:', registerResponse.data);

    // Store cookies from registration response
    storeCookies(registerResponse);

    // Step 3: Check session immediately after registration
    log(colors.yellow, '\n3. Checking session after registration...');
    const sessionCheck = await axios.get(`${BASE_URL}/api/debug/session`, {
      headers: {
        Cookie: getCookieHeader()
      },
      withCredentials: true
    });

    log(colors.green, '✓ Session check successful');
    console.log('Session debug:', JSON.stringify(sessionCheck.data, null, 2));

    // Step 4: Try to update profile (this should fail if session is lost)
    log(colors.yellow, '\n4. Attempting profile update...');
    const profileUpdate = await axios.put(`${BASE_URL}/api/users/profile`, {
      firstName: 'Test',
      lastName: 'Provider',
      phone: '555-123-4567'
    }, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: getCookieHeader()
      },
      withCredentials: true
    });

    log(colors.green, '✓ Profile update successful');
    console.log('Profile update response:', profileUpdate.data);

    // Step 5: Final session check
    log(colors.yellow, '\n5. Final session check...');
    const finalSessionCheck = await axios.get(`${BASE_URL}/api/debug/session`, {
      headers: {
        Cookie: getCookieHeader()
      },
      withCredentials: true
    });

    log(colors.green, '✓ Final session check successful');
    console.log('Final session:', JSON.stringify(finalSessionCheck.data, null, 2));

    log(colors.green, '\n=== HEROKU TEST COMPLETED SUCCESSFULLY ===');
    log(colors.green, 'Session persistence is working on Heroku!');

  } catch (error) {
    log(colors.red, '\n=== HEROKU TEST FAILED ===');
    
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

    // Additional debug info
    log(colors.yellow, '\n=== DEBUG INFO ===');
    log(colors.yellow, `Current cookies: ${cookies.join('; ')}`);
    
    // Try to access the debug endpoint without cookies to see server state
    try {
      const debugResponse = await axios.get(`${BASE_URL}/api/debug/session`);
      log(colors.yellow, 'Debug endpoint response:', JSON.stringify(debugResponse.data, null, 2));
    } catch (debugError) {
      log(colors.red, 'Debug endpoint failed:', debugError.message);
    }
  }
}

// Main execution
async function main() {
  log(colors.green, 'Starting test...');
  
  await testHerokuSessionPersistence();
}

// Run the test
main().catch(error => {
  log(colors.red, 'Unhandled error:', error);
  process.exit(1);
});
