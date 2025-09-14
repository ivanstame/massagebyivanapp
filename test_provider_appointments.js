const axios = require('axios');
const tough = require('tough-cookie');
const axiosCookieJarSupport = require('axios-cookiejar-support').wrapper;

// Enable cookie support
axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

// Configuration
const BASE_URL = 'https://massagebyivan-9420304df681.herokuapp.com';
const PROVIDER_EMAIL = 'ivan@massagebyivan.com';
const PROVIDER_PASSWORD = process.env.PROVIDER_PASSWORD || 'your_password_here';

// Create axios instance with cookie support
const api = axios.create({
  baseURL: BASE_URL,
  jar: cookieJar,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

async function testProviderAppointments() {
  console.log('=== TESTING PROVIDER APPOINTMENTS API ===');
  console.log('Base URL:', BASE_URL);
  console.log('Provider Email:', PROVIDER_EMAIL);
  console.log('');

  try {
    // Step 1: Login as provider
    console.log('1. Logging in as provider...');
    const loginResponse = await api.post('/api/auth/login', {
      email: PROVIDER_EMAIL,
      password: PROVIDER_PASSWORD
    });

    console.log('Login successful!');
    console.log('User data:', JSON.stringify(loginResponse.data.user, null, 2));
    console.log('User ID:', loginResponse.data.user._id);
    console.log('Account Type:', loginResponse.data.user.accountType);
    console.log('');

    // Step 2: Fetch bookings
    console.log('2. Fetching bookings...');
    const bookingsResponse = await api.get('/api/bookings');
    
    console.log('Bookings API Response:');
    console.log('Status:', bookingsResponse.status);
    console.log('Headers:', bookingsResponse.headers);
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
        return String(bookingProviderId) === String(userId);
      });
      
      console.log('4. Filtering results:');
      console.log(`Found ${providerBookings.length} bookings for provider ${userId}`);
      
      if (providerBookings.length > 0) {
        console.log('Sample provider booking:');
        console.log(JSON.stringify(providerBookings[0], null, 2));
      }
    } else {
      console.log('No bookings found in the database');
    }

    // Step 4: Test stats endpoint
    console.log('');
    console.log('5. Testing stats endpoint...');
    const statsResponse = await api.get('/api/bookings?stats=today');
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
      console.error('Request:', error.request);
    } else {
      console.error('Error details:', error);
    }
  }
}

// Run the test
testProviderAppointments();
