const axios = require('axios');

// Configuration
const BASE_URL = 'https://massagebyivan-9420304df681.herokuapp.com';
const PROVIDER_EMAIL = 'ivan@massagebyivan.com';
const PROVIDER_PASSWORD = 'nsync022';

// Store session cookie
let sessionCookie = '';

async function testProviderAppointments() {
  console.log('=== TESTING PROVIDER APPOINTMENTS API ===');
  console.log('Base URL:', BASE_URL);
  console.log('Provider Email:', PROVIDER_EMAIL);
  console.log('');

  try {
    // Step 1: Login as provider
    console.log('1. Logging in as provider...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: PROVIDER_EMAIL,
      password: PROVIDER_PASSWORD
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    console.log('Login successful!');
    console.log('User data:', JSON.stringify(loginResponse.data.user, null, 2));
    console.log('User ID:', loginResponse.data.user._id);
    console.log('Account Type:', loginResponse.data.user.accountType);
    
    // Get session cookie
    const cookies = loginResponse.headers['set-cookie'];
    if (cookies) {
      sessionCookie = cookies[0];
      console.log('Session cookie obtained:', sessionCookie.split(';')[0]);
    }
    console.log('');

    // Step 2: Fetch bookings
    console.log('2. Fetching bookings...');
    const bookingsResponse = await axios.get(`${BASE_URL}/api/bookings`, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': 'application/json'
      }
    });
    
    console.log('Bookings API Response:');
    console.log('Status:', bookingsResponse.status);
    console.log('Data type:', typeof bookingsResponse.data);
    console.log('Is array?', Array.isArray(bookingsResponse.data));
    console.log('Total bookings:', bookingsResponse.data.length);
    console.log('');

    // Step 3: Analyze bookings structure
    if (bookingsResponse.data.length > 0) {
      console.log('3. Analyzing booking structure...');
      console.log('First booking:');
      console.log(JSON.stringify(bookingsResponse.data[0], null, 2));
      console.log('');
      
      // Check provider field
      const firstBooking = bookingsResponse.data[0];
      console.log('Provider field analysis:');
      console.log('- provider value:', firstBooking.provider);
      console.log('- provider type:', typeof firstBooking.provider);
      console.log('- provider._id:', firstBooking.provider?._id);
      console.log('- client field:', firstBooking.client);
      console.log('- client type:', typeof firstBooking.client);
      console.log('');
      
      // Count provider's bookings
      const userId = loginResponse.data.user._id;
      const providerBookings = bookingsResponse.data.filter(booking => {
        const bookingProviderId = booking.provider?._id || booking.provider;
        const match = String(bookingProviderId) === String(userId);
        console.log(`Comparing "${bookingProviderId}" with "${userId}": ${match}`);
        return match;
      });
      
      console.log('4. Filtering results:');
      console.log(`Found ${providerBookings.length} bookings for provider ${userId}`);
      
      if (providerBookings.length > 0) {
        console.log('Sample provider booking:');
        console.log(JSON.stringify(providerBookings[0], null, 2));
      }
      
      // Also show all unique provider IDs
      console.log('');
      console.log('5. All unique provider IDs in bookings:');
      const uniqueProviders = [...new Set(bookingsResponse.data.map(b => b.provider?._id || b.provider))];
      uniqueProviders.forEach(id => {
        const count = bookingsResponse.data.filter(b => (b.provider?._id || b.provider) === id).length;
        console.log(`- ${id}: ${count} bookings`);
      });
      
    } else {
      console.log('No bookings found in the database');
    }

    // Step 4: Test stats endpoint
    console.log('');
    console.log('6. Testing stats endpoint...');
    const statsResponse = await axios.get(`${BASE_URL}/api/bookings?stats=today`, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': 'application/json'
      }
    });
    console.log('Today\'s stats:', JSON.stringify(statsResponse.data, null, 2));

  } catch (error) {
    console.error('');
    console.error('=== ERROR OCCURRED ===');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received');
    } else {
      console.error('Error details:', error);
    }
  }
}

// Run the test
testProviderAppointments();
