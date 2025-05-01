# API Safeguards Rollback Plan

## Affected Files
1. `server/services/mapService.js`
2. `server/utils/timeUtils.js`
3. `server/middleware/apiLimiter.js` (new)
4. `package.json` (if dependencies added)

## Rollback Steps

### 1. Create Backup
```bash
#!/bin/bash
# Create timestamped backup
BACKUP_DIR="./backups/$(date +'%Y%m%d_%H%M%S')"
mkdir -p $BACKUP_DIR
cp server/services/mapService.js $BACKUP_DIR/
cp server/utils/timeUtils.js $BACKUP_DIR/
```

### 2. Revert Code Changes
```bash
# Restore previous versions from Git
git checkout HEAD~1 -- server/services/mapService.js
git checkout HEAD~1 -- server/utils/timeUtils.js

# Remove new rate limiter
rm server/middleware/apiLimiter.js

# Restart server with clean state
pm2 restart all
```

### 3. Environment Variables
```bash
# Remove emergency stop flag
unset EMERGENCY_STOP

# Revoke temporary API key if used
export GOOGLE_MAPS_API_KEY="legacy-key-xxxx"
```

## Verification Checklist
1. [ ] API responses return within normal latency (<500ms)
2. [ ] No "API rate limit exceeded" errors in logs
3. [ ] Booking flow test successful
4. [ ] Address validation works without caching
5. [ ] Travel time calculations show real-time data

## Fallback Procedure
If issues persist after rollback:
```bash
# Full system restore from last known good backup
git reset --hard HEAD~3
npm ci
pm2 restart all