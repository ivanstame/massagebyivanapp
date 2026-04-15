const axios = require('axios');
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

// Service area validation removed — no geographic restrictions for now
const isWithinServiceArea = () => true;

// Provider travel validation bypassed — service area feature not active
// TODO: Re-implement when fixed location anchors are added (Priority 3, Feature B)
async function validateProviderTravel() {
  return true;
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

/**
 * Calculate driving distance in miles between two locations.
 * Uses the Distance Matrix API (same as travel time) but returns miles.
 * Results are cached to avoid duplicate API calls.
 */
async function calculateDistanceMiles(origin, destination) {
  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
    return 0;
  }

  // Same-location check (~200m)
  if (Math.abs(origin.lat - destination.lat) < 0.002 && Math.abs(origin.lng - destination.lng) < 0.002) {
    return 0;
  }

  // Check cache
  const cacheKey = `dist_${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}_${destination.lat.toFixed(3)},${destination.lng.toFixed(3)}`;
  const cached = cacheManager.get('travelTime', cacheKey);
  if (cached !== null) return cached;

  try {
    const response = await safeApiCall(() => axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: `${origin.lat},${origin.lng}`,
        destinations: `${destination.lat},${destination.lng}`,
        mode: 'driving',
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    }));

    if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
      const meters = response.data.rows[0].elements[0].distance.value;
      const miles = parseFloat((meters / 1609.344).toFixed(2));
      cacheManager.set('travelTime', cacheKey, miles);
      return miles;
    }
  } catch (err) {
    console.error('[Distance] API error:', err.message);
  }

  // Fallback: haversine approximation
  const R = 3958.8; // Earth radius in miles
  const dLat = (destination.lat - origin.lat) * Math.PI / 180;
  const dLng = (destination.lng - origin.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) * Math.sin(dLng/2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((dist * 1.3).toFixed(2)); // 1.3x factor for road vs straight-line
}

module.exports = {
  calculateTravelTime,
  calculateDistanceMiles,
  validateProviderTravel,
  isWithinServiceArea,
  safeApiCall
};
