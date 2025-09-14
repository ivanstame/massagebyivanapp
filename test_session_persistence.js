const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');

// Configuration
const BASE_URL = 'http://localhost:5000';
const TEST_EMAIL = `test_provider_${Date.now()}@test.com`;
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

async function testSessionPersistence() {
  log(colors.cyan, '=== Starting Session Persistence Test ===');
  log(colors.blue, `Test Email: ${TEST_EMAIL}`);
  log(colors.blue, `Base URL: ${BASE_URL}`);

  let cookies = null;

  try {
    // Step 1: Register a new provider
    log(colors.yellow, '\n1. Registering provider...');
    const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      accountType: 'PROVIDER',
      providerPassword: PROVIDER_PASSWORD,
      businessName: 'Test Business'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      withCredentials: true
    });

    log(colors.green, '✓ Registration successful');
    console.log('Response:', registerResponse.data);

    // Extract cookies from response
    if (registerResponse.headers['set-cookie']) {
      cookies = registerResponse.headers['set-cookie'];
      log(colors.blue, 'Cookies received:', cookies);
    }

    // Step 2: Check session immediately after registration
    log(colors.yellow, '\n2. Checking session after registration...');
    const sessionCheck = await axios.get(`${BASE_URL}/api/debug/session`, {
      headers: {
        Cookie: cookies ? cookies.join('; ') : ''
      },
      withCredentials: true
    });

    log(colors.green, '✓ Session check successful');
    console.log('Session debug:', JSON.stringify(sessionCheck.data, null, 2));

    // Step 3: Try to update profile (this should fail if session is lost)
    log(colors.yellow, '\n3. Attempting profile update...');
    const profileUpdate = await axios.put(`${BASE_URL}/api/users/profile`, {
      firstName: 'Test',
      lastName: 'Provider',
      phone: '555-123-4567'
    }, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies ? cookies.join('; ') : ''
      },
      withCredentials: true
    });

    log(colors.green, '✓ Profile update successful');
    console.log('Profile update response:', profileUpdate.data);

    // Step 4: Final session check
    log(colors.yellow, '\n4. Final session check...');
    const finalSessionCheck = await axios.get(`${BASE_URL}/api/debug/session`, {
      headers: {
        Cookie: cookies ? cookies.join('; ') : ''
      },
      withCredentials: true
    });

    log(colors.green, '✓ Final session check successful');
    console.log('Final session:', JSON.stringify(finalSessionCheck.data, null, 2));

    log(colors.green, '\n=== TEST COMPLETED SUCCESSFULLY ===');
    log(colors.green, 'Session persistence is working correctly!');

  } catch (error) {
    log(colors.red, '\n=== TEST FAILED ===');
    
    if (error.response) {
      log(colors.red, `Status: ${error.response.status}`);
      log(colors.red, `Response: ${JSON.stringify(error.response.data, null, 2)}`);
      log(colors.red, `Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
    } else if (error.request) {
      log(colors.red, 'No response received:', error.request);
    } else {
      log(colors.red, 'Error:', error.message);
    }

    // Additional debug info
    log(colors.yellow, '\n=== DEBUG INFO ===');
    log(colors.yellow, `Current cookies: ${cookies ? cookies.join('; ') : 'None'}`);
    
    // Try to access the debug endpoint without cookies to see server state
    try {
      const debugResponse = await axios.get(`${BASE_URL}/api/debug/session`);
      log(colors.yellow, 'Debug endpoint response:', JSON.stringify(debugResponse.data, null, 2));
    } catch (debugError) {
      log(colors.red, 'Debug endpoint failed:', debugError.message);
    }
  }
}

// Check if server is running
function checkServer() {
  try {
    execSync('curl -s http://localhost:5000/api/test', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  log(colors.blue, 'Checking if server is running...');
  
  if (!checkServer()) {
    log(colors.red, 'Server is not running on http://localhost:5000');
    log(colors.yellow, 'Please start the server with: npm run server');
    process.exit(1);
  }

  log(colors.green, 'Server is running! Starting test...');
  
  await testSessionPersistence();
}

// Run the test
main().catch(error => {
  log(colors.red, 'Unhandled error:', error);
  process.exit(1);
});
