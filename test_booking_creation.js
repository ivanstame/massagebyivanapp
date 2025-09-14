const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Configuration
const BASE_URL = 'https://massagebyivan-9420304df681.herokuapp.com';
const CLIENT_EMAIL = 'test.client@example.com';
const CLIENT_PASSWORD = 'TestPassword123!';

// Direct MongoDB connection test
async function testDirectMongoDB() {
  console.log('=== TESTING DIRECT MONGODB CONNECTION ===');
  console.log('MongoDB URI (masked):', process.env.MONGODB_URI ? '***URI EXISTS***' : 'NOT FOUND');
  
  try {
    // Connect directly to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB directly');
    
    // Try to access the Booking model
    const Booking = require('./server/models/Booking');
    
    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Try to count bookings
    const count = await Booking.countDocuments();
    console.log('Current booking count:', count);
    
    // Try to create a test booking directly
    console.log('\nAttempting to create test booking directly in MongoDB...');
    const testBooking = new Booking({
      provider: new mongoose.Types.ObjectId(),
      client: new mongoose.Types.ObjectId(),
      date: new Date(),
      localDate: '2025-09-16',
      startTime: '14:00',
      endTime: '15:00',
      duration: 60,
      location: {
        lat: 34.0522,
        lng: -118.2437,
        address: '123 Test Street, Los Angeles, CA'
      },
      status: 'pending'
    });
    
    console.log('Test booking object created:', testBooking._id);
    
    try {
      const saved = await testBooking.save();
      console.log('✅ TEST BOOKING SAVED!');
      console.log('Saved ID:', saved._id);
      
      // Try to find it
      const found = await Booking.findById(saved._id);
      console.log('Found in DB:', found ? 'YES' : 'NO');
      
      // Delete the test booking
      await Booking.findByIdAndDelete(saved._id);
      console.log('Test booking deleted');
    } catch (saveErr) {
      console.error('❌ FAILED TO SAVE TEST BOOKING!');
      console.error('Error:', saveErr.message);
      if (saveErr.errors) {
        console.error('Validation errors:', saveErr.errors);
      }
    }
    
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Test booking through API
async function testBookingAPI() {
  console.log('\n=== TESTING BOOKING THROUGH API ===');
  
  let sessionCookie = '';
  
  try {
    // First, create a test client account
    console.log('1. Creating test client account...');
    try {
      await axios.post(`${BASE_URL}/api/auth/register`, {
        email: CLIENT_EMAIL,
        password: CLIENT_PASSWORD,
        accountType: 'CLIENT'
      });
      console.log('Test account created');
    } catch (regErr) {
      if (regErr.response?.status === 409) {
        console.log('Test account already exists');
      } else {
        throw regErr;
      }
    }
    
    // Login
    console.log('2. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: CLIENT_EMAIL,
      password: CLIENT_PASSWORD
    });
    
    const cookies = loginResponse.headers['set-cookie'];
    if (cookies) {
      sessionCookie = cookies[0];
      console.log('Session obtained');
    }
    
    // Try to create a booking
    console.log('3. Creating booking through API...');
    const bookingData = {
      date: '2025-09-16',
      time: '14:00',
      duration: 60,
      location: {
        lat: 34.0522,
        lng: -118.2437,
        address: '123 Test Street, Los Angeles, CA'
      }
    };
    
    console.log('Sending booking data:', JSON.stringify(bookingData, null, 2));
    
    const bookingResponse = await axios.post(
      `${BASE_URL}/api/bookings`,
      bookingData,
      {
        headers: {
          'Cookie': sessionCookie,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ BOOKING API RESPONSE:');
    console.log('Status:', bookingResponse.status);
    console.log('Data:', JSON.stringify(bookingResponse.data, null, 2));
    
    // Verify it was saved
    console.log('\n4. Fetching bookings to verify...');
    const fetchResponse = await axios.get(`${BASE_URL}/api/bookings`, {
      headers: {
        'Cookie': sessionCookie
      }
    });
    
    console.log('Total bookings found:', fetchResponse.data.length);
    if (fetchResponse.data.length > 0) {
      console.log('Latest booking:', JSON.stringify(fetchResponse.data[0], null, 2));
    }
    
  } catch (error) {
    console.error('❌ API TEST FAILED!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Check Heroku logs
async function checkHerokuLogs() {
  console.log('\n=== HEROKU LOG CHECK ===');
  console.log('To see detailed server logs, run:');
  console.log('heroku logs --tail -a massagebyivan');
  console.log('\nOr check recent logs with:');
  console.log('heroku logs -n 200 -a massagebyivan | grep -i booking');
}

// Main execution
async function main() {
  console.log('Starting booking diagnostics...\n');
  
  // Test direct MongoDB connection
  await testDirectMongoDB();
  
  // Test through API
  await testBookingAPI();
  
  // Log instructions
  checkHerokuLogs();
}

main().catch(console.error);
