# LRU Cache Implementation - Future Improvement

**Status**: Documented for implementation at 100+ providers milestone  
**Priority**: Medium (optimization for scale, not critical for launch)  
**Estimated Effort**: 2-3 hours

---

## Problem Statement

Current in-memory cache implementation uses unbounded `Map` objects for storing travel time data. While the day-of-week/hour bucketing limits cache keys to a finite set, at scale this could still consume significant memory:

**Worst-case calculation:**
- 50 unique client addresses per provider
- 50 × 50 = 2,500 unique origin-destination pairs
- 2,500 pairs × 168 hours/week × 3 traffic models = **1,260,000 possible cache entries**
- At ~100 bytes per entry = **~120MB per provider**
- 100 providers = **~12GB memory usage**

In practice, the real usage will be much lower (providers don't visit all 50 clients from all 50 locations), but the unbounded nature creates risk at scale.

---

## When to Implement

**Trigger points:**
- Provider count reaches 75-100
- Memory usage on production server exceeds 70% sustained
- Cache size monitoring shows unbounded growth

**Not needed if:**
- Provider count stays under 50
- Memory usage remains stable
- Average cache size per provider stays under 5,000 entries

---

## Proposed Solution

Implement an LRU (Least Recently Used) eviction policy with a configurable max size per cache type.

### Implementation Approach

```javascript
class LRUCache {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = new Map(); // Track access times
  }

  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }
    
    // Update access time
    this.accessOrder.set(key, Date.now());
    return this.cache.get(key);
  }

  set(key, value) {
    // If at capacity, evict least recently used
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const lruKey = this.findLRU();
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
    
    this.cache.set(key, value);
    this.accessOrder.set(key, Date.now());
  }

  findLRU() {
    let lruKey = null;
    let oldestTime = Infinity;
    
    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        lruKey = key;
      }
    }
    
    return lruKey;
  }
}
```

### Alternative: Use npm package

```bash
npm install lru-cache
```

```javascript
const LRU = require('lru-cache');

const travelTimeCache = new LRU({
  max: 10000,  // Max entries
  maxAge: 1000 * 60 * 60 * 24 * 7,  // 7 day TTL
  updateAgeOnGet: false  // Don't reset TTL on access
});
```

---

## Configuration Recommendations

### Cache Size Limits by Type

```javascript
const CACHE_LIMITS = {
  travelTime: 10000,     // Most frequently used
  geocoding: 1000,       // Address lookups are infrequent
  providerTravel: 5000   // Service area validation
};
```

### Monitoring Metrics

Track these metrics in production:
- Cache hit rate (already tracked)
- Cache size (current entry count)
- Eviction rate (entries removed due to LRU)
- Memory usage per cache type

Alert thresholds:
- Cache hit rate drops below 75% → May need larger max size
- Eviction rate exceeds 10% of gets → Max size too small
- Memory usage exceeds 8GB total → Reduce max sizes

---

## Migration Path

1. **Add npm package**:
   ```bash
   npm install lru-cache
   ```

2. **Update CacheManager constructor**:
   ```javascript
   const LRU = require('lru-cache');
   
   constructor() {
     this.caches = new Map();
     this.caches.set('travelTime', new LRU({ max: 10000, maxAge: 7 * 24 * 60 * 60 * 1000 }));
     this.caches.set('geocoding', new LRU({ max: 1000, maxAge: 7 * 24 * 60 * 60 * 1000 }));
     this.caches.set('providerTravel', new LRU({ max: 5000, maxAge: 7 * 24 * 60 * 60 * 1000 }));
   }
   ```

3. **Update monitoring to track evictions**:
   ```javascript
   getStats() {
     return {
       ...this.performanceStats,
       cacheSizes: {
         travelTime: this.caches.get('travelTime').length,
         geocoding: this.caches.get('geocoding').length,
         providerTravel: this.caches.get('providerTravel').length
       },
       cacheMaxSizes: {
         travelTime: this.caches.get('travelTime').max,
         geocoding: this.caches.get('geocoding').max,
         providerTravel: this.caches.get('providerTravel').max
       }
     };
   }
   ```

4. **Test in staging with realistic load**:
   - Simulate 100+ providers × 50 clients
   - Monitor hit rate and eviction rate
   - Adjust max sizes based on observed patterns

5. **Deploy to production with gradual rollout**

---

## Cost-Benefit Analysis

**Benefits:**
- Bounded memory usage (predictable costs)
- Prevents OOM crashes at scale
- Maintains high cache hit rates (95%+ with proper sizing)

**Costs:**
- 2-3 hours implementation time
- Slightly more complex cache logic
- Need to tune max sizes based on usage patterns

**Verdict:** Implement when approaching 100 providers or if memory usage trends upward. Not critical for first 10-50 providers.

---

## Related Monitoring

Set up CloudWatch/Datadog alerts:
- Memory usage > 70% sustained for 5 minutes
- Cache size growth rate > 1000 entries/day
- Cache hit rate drops below 75%

These will give early warning if LRU implementation becomes necessary sooner than expected.
