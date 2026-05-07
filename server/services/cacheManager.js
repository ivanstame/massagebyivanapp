// Cache Manager for Google Maps API with address-based invalidation
const { DateTime } = require('luxon');

class CacheManager {
  constructor() {
    this.caches = new Map(); // Map of cache types to their respective caches
    this.performanceStats = {
      totalHits: 0,
      totalMisses: 0,
      totalInvalidations: 0,
      averageResponseTime: 0,
      errorCount: 0,
      lastReset: DateTime.now().toISO()
    };
    
    // Initialize caches
    this.caches.set('travelTime', new Map());
    this.caches.set('geocoding', new Map());
    this.caches.set('providerTravel', new Map());
    
    // Start performance monitoring
    this.startMonitoring();
  }

  /**
   * Get cache key for travel time calculation
   * Uses day-of-week and hour buckets for better cache reuse
   * @param {Object} origin - Origin location
   * @param {Object} destination - Destination location
   * @param {Date} departureTime - Departure time
   * @param {string} trafficModel - Traffic model used ('best_guess', 'pessimistic', 'optimistic')
   * @returns {string} - Cache key
   */
  getTravelTimeKey(origin, destination, departureTime, trafficModel = 'pessimistic', tz = 'America/Los_Angeles') {
    // Bucket by day-of-week + hour in the requesting provider's TZ so a
    // Chicago provider's "Mon 9am" doesn't collide with an LA provider's
    // (those are different real-world traffic windows). The TZ is also
    // baked into the key to prevent cross-provider key collisions.
    const dt = DateTime.fromJSDate(departureTime, { zone: tz });

    // Day-of-week + hour bucket: "Mon_14", "Fri_17", etc. 168 possible
    // buckets per TZ — traffic patterns are consistent week-over-week.
    const dayHourKey = `${dt.weekdayShort}_${dt.hour}`;

    return `travel_${this.getLocationKey(origin)}_to_${this.getLocationKey(destination)}_${tz}_${dayHourKey}_${trafficModel}`;
  }

  /**
   * Get cache key for provider travel validation
   * @param {Object} origin - Origin location
   * @param {Object} destination - Destination location
   * @param {string} providerId - Provider ID
   * @returns {string} - Cache key
   */
  getProviderTravelKey(origin, destination, providerId) {
    return `provider_travel_${this.getLocationKey(origin)}_to_${this.getLocationKey(destination)}_provider_${providerId}`;
  }

  /**
   * Get standardized location key
   * @param {Object} location - Location with lat/lng
   * @returns {string} - Location key
   */
  getLocationKey(location) {
    if (!location || !location.lat || !location.lng) {
      return 'invalid_location';
    }
    return `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
  }

  /**
   * Get item from cache
   * @param {string} cacheType - Type of cache ('travelTime', 'geocoding', 'providerTravel')
   * @param {string} key - Cache key
   * @returns {Object|null} - Cached data or null if not found/expired
   */
  get(cacheType, key) {
    const cache = this.caches.get(cacheType);
    if (!cache || !cache.has(key)) {
      this.performanceStats.totalMisses++;
      return null;
    }

    const cachedData = cache.get(key);
    
    // Check if cache entry is still valid (7 day TTL for contextual keys)
    // Since we bucket by day-of-week + hour, traffic patterns remain consistent across weeks
    const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    if (Date.now() - cachedData.timestamp > TTL) {
      cache.delete(key);
      this.performanceStats.totalMisses++;
      this.performanceStats.totalInvalidations++;
      return null;
    }

    this.performanceStats.totalHits++;
    return cachedData.data;
  }

  /**
   * Set item in cache
   * @param {string} cacheType - Type of cache
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   */
  set(cacheType, key, data) {
    const cache = this.caches.get(cacheType);
    if (cache) {
      cache.set(key, {
        data,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Invalidate cache entries related to a specific address
   * @param {Object} location - Location to invalidate
   */
  invalidateByLocation(location) {
    const locationKey = this.getLocationKey(location);
    if (locationKey === 'invalid_location') return;

    let invalidatedCount = 0;

    // Invalidate all cache entries that involve this location
    for (const [cacheType, cache] of this.caches) {
      for (const [key] of cache) {
        if (key.includes(locationKey)) {
          cache.delete(key);
          invalidatedCount++;
        }
      }
    }

    this.performanceStats.totalInvalidations += invalidatedCount;
    console.log(`Invalidated ${invalidatedCount} cache entries for location: ${locationKey}`);
  }

  /**
   * Clear entire cache or specific cache type
   * @param {string} [cacheType] - Optional specific cache type to clear
   */
  clear(cacheType = null) {
    if (cacheType) {
      const cache = this.caches.get(cacheType);
      if (cache) {
        const count = cache.size;
        cache.clear();
        this.performanceStats.totalInvalidations += count;
        console.log(`Cleared ${count} entries from ${cacheType} cache`);
      }
    } else {
      let totalCount = 0;
      for (const [type, cache] of this.caches) {
        totalCount += cache.size;
        cache.clear();
      }
      this.performanceStats.totalInvalidations += totalCount;
      console.log(`Cleared all caches (${totalCount} total entries)`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache performance statistics
   */
  getStats() {
    const hitRate = this.performanceStats.totalHits + this.performanceStats.totalMisses > 0 
      ? (this.performanceStats.totalHits / (this.performanceStats.totalHits + this.performanceStats.totalMisses)) * 100 
      : 0;

    return {
      ...this.performanceStats,
      hitRate: hitRate.toFixed(2) + '%',
      cacheSizes: {
        travelTime: this.caches.get('travelTime').size,
        geocoding: this.caches.get('geocoding').size,
        providerTravel: this.caches.get('providerTravel').size
      },
      uptime: DateTime.fromISO(this.performanceStats.lastReset).toRelative()
    };
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    // Log performance stats every 5 minutes
    this.monitorInterval = setInterval(() => {
      const stats = this.getStats();
      console.log('🚀 Cache Performance Stats:', {
        hitRate: stats.hitRate,
        cacheSizes: stats.cacheSizes,
        totalInvalidations: stats.totalInvalidations,
        uptime: stats.uptime
      });
    }, 5 * 60 * 1000); // 5 minutes

    // Auto-clean expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 1000); // 1 minute
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpired() {
    const now = Date.now();
    const TTL = 7 * 24 * 60 * 60 * 1000; // 7 day TTL
    let cleanedCount = 0;

    for (const [cacheType, cache] of this.caches) {
      for (const [key, value] of cache) {
        if (now - value.timestamp > TTL) {
          cache.delete(key);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      this.performanceStats.totalInvalidations += cleanedCount;
      console.log(`Auto-cleaned ${cleanedCount} expired cache entries (7-day TTL)`);
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Create global cache manager instance
const cacheManager = new CacheManager();

// Export for use in other modules
module.exports = cacheManager;
