const express = require('express');
const router = express.Router();
const axios = require('axios');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { safeApiCall } = require('../services/mapService');

// Geocoding cache to prevent redundant API calls
const geocodeCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Get coordinates from address using Google Maps Geocoding API
router.get('/', (req, res, next) => {
  // Skip authentication check in development mode for address validation during registration
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  ensureAuthenticated(req, res, next);
}, async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ message: 'Address is required' });
    }

    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your-google-maps-api-key-here') {
      console.error('Google Maps API key not configured or using placeholder');
      return res.status(500).json({ 
        message: 'Address verification service is not configured. Please contact support.' 
      });
    }

    // Check cache first
    const cacheKey = `geocode_${address}`;
    if (geocodeCache.has(cacheKey)) {
      const cachedData = geocodeCache.get(cacheKey);
      // Check if cache entry is still valid
      if (Date.now() - cachedData.timestamp < CACHE_TTL) {
        console.log(`[Geocoding] ${new Date().toISOString()} | Cache hit for ${cacheKey}`);
        return res.json(cachedData.data);
      } else {
        console.log(`[Geocoding] ${new Date().toISOString()} | Cache expired for ${cacheKey}`);
        geocodeCache.delete(cacheKey);
      }
    }

    // Make API call with rate limiting and circuit breaker
    const response = await safeApiCall(() => axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json`,
      {
        params: {
          address,
          key: GOOGLE_MAPS_API_KEY
        }
      }
    ));
    
    console.log(`[Geocoding] ${new Date().toISOString()} | Geocoding request for address: ${address}`);

    // Log the complete Google Maps API response for debugging
    console.log(`[Geocoding] ${new Date().toISOString()} | Google Maps API Response:`, JSON.stringify(response.data, null, 2));

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const { lat, lng } = response.data.results[0].geometry.location;
      const result = { lat, lng };
      
      // Cache the result
      geocodeCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      console.log(`[Geocoding] ${new Date().toISOString()} | Cached result for ${cacheKey}`);
      
      res.json(result);
    } else {
      // Handle specific Google Maps API error status codes
      switch (response.data.status) {
        case 'ZERO_RESULTS':
          res.status(404).json({ message: 'No results found for this address. Please check the address and try again.' });
          break;
        case 'OVER_QUERY_LIMIT':
          console.error('Google Maps API quota exceeded');
          res.status(429).json({ message: 'Service temporarily unavailable. Please try again later.' });
          break;
        case 'REQUEST_DENIED':
          console.error('Google Maps API request denied - likely an API key issue');
          res.status(403).json({ message: 'Address verification service is currently unavailable.' });
          break;
        case 'INVALID_REQUEST':
          res.status(400).json({ message: 'Invalid address format. Please check all address fields.' });
          break;
        default:
          res.status(404).json({ 
            message: 'Could not verify address',
            status: response.data.status
          });
      }
    }
  } catch (error) {
    console.error('Geocoding error:', error.response?.data || error.message);
    
    // Handle network errors and API errors differently
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      res.status(error.response.status).json({
        message: 'Error verifying address',
        error: error.response.data.error_message || error.message
      });
    } else if (error.request) {
      // The request was made but no response was received
      res.status(503).json({
        message: 'Unable to reach address verification service. Please try again later.',
        error: 'NETWORK_ERROR'
      });
    } else {
      // Something happened in setting up the request
      res.status(500).json({
        message: 'Internal server error while verifying address',
        error: error.message
      });
    }
  }
});

module.exports = router;
