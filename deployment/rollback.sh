#!/bin/bash
# Full rollback script with safety checks

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="./logs/rollback_$TIMESTAMP.log"
BACKUP_DIR="./backups/$TIMESTAMP"

# Initialize logging
mkdir -p "./logs"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== Starting Rollback Process ==="
echo "Backup Directory: $BACKUP_DIR"
echo "Log File: $LOG_FILE"

# Create backup
echo "Creating backup..."
mkdir -p "$BACKUP_DIR"
cp server/services/mapService.js "$BACKUP_DIR/"
cp server/utils/timeUtils.js "$BACKUP_DIR/"
cp package.json "$BACKUP_DIR/"

# Verify Git status
if ! git diff --quiet; then
  echo "ERROR: Working directory not clean. Commit or stash changes first."
  exit 1
fi

# Revert code changes
echo "Reverting code..."
git checkout HEAD~1 -- \
  server/services/mapService.js \
  server/utils/timeUtils.js

# Remove rate limiter if exists
if [ -f "server/middleware/apiLimiter.js" ]; then
  echo "Removing rate limiter..."
  rm server/middleware/apiLimiter.js
fi

# Clean up dependencies
echo "Resetting dependencies..."
npm ci --omit=dev

# Restart services
echo "Restarting server..."
pm2 restart all

echo "=== Rollback Complete ==="
echo "Verify functionality and check logs: $LOG_FILE"