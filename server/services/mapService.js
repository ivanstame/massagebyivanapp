const axios = require('axios');
const mongoose = require('mongoose');
const cacheManager = require('./cacheManager');

// TRAFFIC_THRESHOLD_KM removed - we now always use traffic-aware duration when available

// Rate limiting configuration
// Enhanced rate limiting with production safeguards
const RATE_LIMIT = {
  maxCalls: 40,          // 20% below Google quota
  perSeconds: 60,
  burstProtection: 10,    // Max calls in first 5 seconds
  emergencyThreshold: 35 // Trigger alerts at 87.5% capacity
};
let callCount = 0;
let apiErrorCount = 0;
const MAX_ERRORS = 5;
let geocodingDisabled = false;
let callRecords = []; // Tracks timestamps of recent API calls for burst protection

// Reset call count periodically
setInterval(() => {
  callCount = 0;
  console.log(`[Geocoding] ${new Date().toISOString()} | Rate limit counter reset`);
}, RATE_LIMIT.perSeconds * 1000);

// Reset error count and re-enable geocoding after a longer period
setInterval(() => {
  if (geocodingDisabled && apiErrorCount > 0) {
    console.log(`[Geocoding] ${new Date().toISOString()} | Resetting error count and re-enabling geocoding`);
    apiErrorCount = 0;
    geocodingDisabled = false;
  }
}, 15 * 60 * 1000); // 15 minutes

const isWithinServiceArea = (origin, destination, serviceArea) => {
  // Always return true - serviceArea functionality has been removed
  return true;
};

// Log mongoose version to verify it's the same instance
console.log('Mongoose version in mapService.js:', mongoose.version);

// Helper function to get User model using Mongoose's global model lookup
function getUserModel() {
  try {
    // Try to get the model from Mongoose's registry
    const userModel = mongoose.model('User');
    console.log('Loaded User model from mongoose registry:', userModel ? 'Success' : 'Failed');
    console.log('User model methods:', Object.keys(userModel || {}).join(', '));
    return userModel;
  } catch (error) {
    console.error('Error getting User model from mongoose registry:', error.message);
    
    // Fallback to direct require as a last resort
    try {
      const userModel = require('../models/User');
      console.log('Loaded User model via require:', userModel ? 'Success' : 'Failed');
      return userModel;
    } catch (reqError) {
      console.error('Error requiring User model:', reqError.message);
      return null;
    }
  }
}

/**
 * Get cache key for provider travel validation
 * @param {Object} origin - Origin location
 * @param {Object} destination - Destination location
 * @param {string} providerId - Provider ID
 * @returns {string} - Cache key
 */
function getProviderTravelCacheKey(origin, destination, providerId) {
  return cacheManager.getProviderTravelKey(origin, destination, providerId);
}

/**
 * Validate if a provider can travel between two locations
 * @param {Object} origin - Origin location with lat/lng
 * @param {Object} destination - Destination location with lat/lng
 * @param {string} providerId - Provider ID for validation
 * @returns {Promise<boolean>} - Whether travel is valid
 */
async function validateProviderTravel(origin, destination, providerId) {
  // IMPORTANT: Since service area validation has been removed,
  // we can safely return true immediately to bypass all validation
  // This is a temporary solution until the module resolution issue is fixed
  console.log('NOTICE: Bypassing provider travel validation entirely');
  return true;

  // The code below is kept for reference but is not executed
  try {
    console.log('validateProviderTravel called with providerId:', providerId);
    
    if (!providerId) {
      console.log('No providerId provided, skipping validation');
      return true; // Skip validation if no providerId is provided
    }
    
    if (typeof providerId !== 'string' && !(providerId instanceof Object)) {
      console.log('Invalid providerId type:', typeof providerId);
      return true; // Skip validation if providerId is not a string or object
    }
    
    // Check cache first
    const cacheKey = getProviderTravelCacheKey(origin, destination, providerId);
    if (geocodeCache.has(cacheKey)) {
      const cachedData = geocodeCache.get(cacheKey);
      // Check if cache entry is still valid
      if (Date.now() - cachedData.timestamp < CACHE_TTL) {
        console.log(`[Geocoding] Cache hit for ${cacheKey}`);
        return cachedData.isValid;
      } else {
        console.log(`[Geocoding] Cache expired for ${cacheKey}`);
        geocodeCache.delete(cacheKey);
      }
    }
    
    // Get the User model using Mongoose's global model lookup
    const User = getUserModel();
    
    // Check if User model was loaded successfully
    if (!User) {
      console.log('User model not available, skipping validation');
      return true;
    }
    
    if (!User.findById) {
      console.log('User.findById is not a function, skipping validation');
      console.log('User model type:', typeof User);
      console.log('User model properties:', Object.keys(User).join(', '));
      return true;
    }
    
    try {
      // Try to convert providerId to ObjectId if it's a string
      const mongoose = require('mongoose');
      if (typeof providerId === 'string' && mongoose.Types.ObjectId.isValid(providerId)) {
        providerId = new mongoose.Types.ObjectId(providerId);
        console.log('Converted providerId to ObjectId:', providerId);
      }
    } catch (err) {
      console.log('Error converting providerId to ObjectId:', err.message);
      // Continue with the original providerId
    }
    
    const provider = await User.findById(providerId);
    if (!provider) {
      console.log('Provider not found for ID:', providerId);
      return true; // Skip validation if provider not found
    }
    
    if (provider.accountType !== 'PROVIDER') {
      console.log('User is not a provider:', provider.accountType);
      return true; // Skip validation if user is not a provider
    }

    // ServiceArea validation has been removed
    const isValid = true;
    
    // Cache the result
    geocodeCache.set(cacheKey, {
      isValid,
      timestamp: Date.now()
    });
    console.log(`[Geocoding] Cached provider travel validation for ${cacheKey}`);
    
    return isValid;
  } catch (error) {
    console.error('Provider travel validation error:', error);
    console.log('Error occurred with providerId:', providerId);
    // Return true instead of throwing to prevent booking failures
    return true;
  }
}

/**
 * Safe API call with rate limiting and circuit breaker
 * @param {Function} apiCall - The API call function to execute
 * @returns {Promise<any>} - The API response
 */
async function safeApiCall(apiCall) {
  // Enhanced safety checks
  if (geocodingDisabled) {
    console.error(`[Geocoding][${new Date().toISOString()}] API disabled (${apiErrorCount}/${MAX_ERRORS} errors)`);
    throw new Error('Geocoding temporarily unavailable - please try again later');
  }

  // Burst protection
  const now = Date.now();
  const recentCalls = callRecords.filter(ts => ts > now - 5000).length;
  if (recentCalls > RATE_LIMIT.burstProtection) {
    const delay = Math.min(5000, 100 * Math.pow(2, recentCalls - RATE_LIMIT.burstProtection));
    console.warn(`[Geocoding] Burst protection delaying ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Rate limit enforcement
  callRecords.push(now);
  if (callRecords.length > RATE_LIMIT.maxCalls) {
    const oldestAllowed = now - RATE_LIMIT.perSeconds * 1000;
    callRecords = callRecords.filter(ts => ts > oldestAllowed);
    
    if (callRecords.length >= RATE_LIMIT.maxCalls) {
      const msg = `Rate limit exceeded: ${callRecords.length}/${RATE_LIMIT.maxCalls} calls`;
      console.error(`[Geocoding][${new Date().toISOString()}] ${msg}`);
      throw new Error(msg);
    }
  }

  // Emergency threshold alerting
  if (callRecords.length >= RATE_LIMIT.emergencyThreshold) {
    console.error(`[Geocoding][${new Date().toISOString()}] EMERGENCY: Reached ${callRecords.length}/${RATE_LIMIT.maxCalls} calls`);
  }

  console.log(`[Geocoding] ${new Date().toISOString()} | Calls: ${callCount}/${RATE_LIMIT.maxCalls}`);

  try {
    const result = await apiCall();
    // Reset error count on success
    apiErrorCount = 0;
    return result;
  } catch (error) {
    // Increment error count
    if (++apiErrorCount >= MAX_ERRORS) {
      console.error(`[Geocoding] Error threshold reached (${apiErrorCount}/${MAX_ERRORS}). Disabling API calls.`);
      geocodingDisabled = true;
    }
    throw error;
  }
}


/**
 * Calculate travel time between two locations
 * @param {Object} origin - Origin location with lat/lng
 * @param {Object} destination - Destination location with lat/lng
 * @param {Date} departureTime - Departure time
 * @param {string} providerId - Provider ID for validation
 * @param {string} trafficModel - Traffic model: 'best_guess', 'pessimistic', or 'optimistic' (default: 'pessimistic')
 * @returns {Promise<number>} - Travel time in minutes
 */
async function calculateTravelTime(origin, destination, departureTime, providerId, trafficModel = 'pessimistic') {
  console.log('Calculating travel time:');
  console.log('Origin:', JSON.stringify(origin));
  console.log('Destination:', JSON.stringify(destination));
  console.log('Departure Time:', departureTime);

  try {
    if (!origin || !destination || !departureTime) {
      throw new Error('Missing required parameters for travel time calculation');
    }

    if (!origin.lat || !origin.lng || !destination.lat || !destination.lng) {
      throw new Error('Invalid location data for travel time calculation');
    }

    // Validate provider service area if providerId is provided
    if (providerId) {
      try {
        await validateProviderTravel(origin, destination, providerId);
      } catch (validationError) {
        console.error('Error validating provider travel, continuing anyway:', validationError);
        // Continue with travel time calculation even if validation fails
      }
    }

    // Check cache first using centralized cache manager
    const cacheKey = cacheManager.getTravelTimeKey(origin, destination, departureTime, trafficModel);
    const cachedDuration = cacheManager.get('travelTime', cacheKey);
    if (cachedDuration !== null) {
      console.log(`[Cache] Travel time cache hit for ${cacheKey}: ${cachedDuration} mins`);
      return cachedDuration;
    }

    // Make API call with rate limiting and circuit breaker
    const response = await safeApiCall(() => axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: `${origin.lat},${origin.lng}`,
        destinations: `${destination.lat},${destination.lng}`,
        mode: 'driving',
        departure_time: Math.floor(departureTime.getTime() / 1000),
        traffic_model: trafficModel, // Use specified traffic model for predictive accuracy
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    }));

    console.log('API Response:', JSON.stringify(response.data, null, 2));

    if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
      const element = response.data.rows[0].elements[0];
      const distanceInMeters = element.distance.value;
      const distanceInKm = distanceInMeters / 1000;
      
      // Always prefer traffic-aware duration when available for accuracy
      // This is especially critical for urban routes where traffic significantly impacts travel time
      const durationInSeconds = element.duration_in_traffic?.value || element.duration.value;
      const durationSource = element.duration_in_traffic ? 'traffic-aware' : 'standard';
      
      const durationInMinutes = Math.ceil(durationInSeconds / 60);
      console.log(`Calculated duration: ${durationInMinutes} minutes (${durationSource}, ${trafficModel} model)`);
      console.log('Distance:', distanceInKm.toFixed(2), 'km');
      
      // Cache the result using centralized cache manager
      cacheManager.set('travelTime', cacheKey, durationInMinutes);
      console.log(`[Cache] Stored travel time for ${cacheKey}: ${durationInMinutes} mins`);
      
      return durationInMinutes;
    } else {
      throw new Error(`Unable to calculate travel time. API Status: ${response.data.status}, Element Status: ${response.data.rows[0].elements[0].status}`);
    }
  } catch (error) {
    console.error('Error calculating travel time:', error);
    throw error;
  }
}

module.exports = {
  calculateTravelTime,
  validateProviderTravel,
  isWithinServiceArea,
  safeApiCall
};
