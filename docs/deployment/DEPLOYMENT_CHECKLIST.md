# Heroku Deployment Checklist

## ✅ Phase 1: Environment & Database Setup (COMPLETED)

### Environment Configuration
- [x] Created `.env.example` file with all required variables
- [x] Updated `server.js` to use `MONGODB_URI` environment variable
- [x] Updated session store to use environment MongoDB connection
- [x] Created `Procfile` for Heroku
- [x] Updated `package.json` with Heroku build scripts and engine requirements

### Files Created/Modified
- `.env.example` - Environment variable template
- `Procfile` - Heroku process file
- `package.json` - Added `heroku-postbuild` script and engines
- `server/server.js` - Updated to use environment variables

## 📋 Phase 2: Critical Bug Fixes

### Phone Number Storage/Retrieval
- [x] Update User model to ensure phone field is properly defined
- [x] Fix profile update endpoints to save phone numbers
- [x] Update client components to properly display phone data
- [ ] Test phone functionality end-to-end

### Service Area Validation
- [ ] Resolve Mongoose model import issues in mapService.js
- [ ] Re-enable service area boundary checks
- [ ] Test travel time calculations with various addresses
- [ ] Ensure proper error messages for out-of-area locations

### Security Hardening
- [ ] Add rate limiting to all API endpoints
- [ ] Implement CORS configuration for your domain
- [ ] Add helmet.js for security headers
- [ ] Sanitize all user inputs
- [ ] Update session configuration for production

## 📋 Phase 3: Integration Strategy

### Choose Integration Method
- [ ] Decide on subdomain vs iframe vs widget integration
- [ ] Configure domain/subdomain in Heroku
- [ ] Update DNS settings with domain provider
- [ ] Set up SSL certificate
- [ ] Test cross-origin issues

## 📋 Phase 4: Deployment

### Heroku Setup
- [ ] Install Heroku CLI (`npm install -g heroku`)
- [ ] Login to Heroku (`heroku login`)
- [ ] Create Heroku app (`heroku create your-app-name`)
- [ ] Set environment variables in Heroku
- [ ] Configure MongoDB Atlas connection

### Deployment Process
- [ ] Test build locally (`npm run build`)
- [ ] Commit all changes to git
- [ ] Push to Heroku (`git push heroku main`)
- [ ] Scale dyno (`heroku ps:scale web=1`)
- [ ] Monitor logs (`heroku logs --tail`)

## 📋 Phase 5: Testing & Monitoring

### Alpha Test Checklist
- [ ] Test provider registration and setup
- [ ] Test client booking flow end-to-end
- [ ] Verify address updates affect availability
- [ ] Test on mobile devices
- [ ] Check error handling and user feedback
- [ ] Verify email notifications (if implemented)

### Monitoring Setup
- [ ] Enable Heroku application metrics
- [ ] Set up error tracking (Sentry free tier)
- [ ] Create uptime monitoring (UptimeRobot)
- [ ] Set up backup strategy for database

## 🚀 Immediate Next Steps

1. **✅ Set up MongoDB Atlas** - **COMPLETED** - Cloud database is connected and working
2. **Fix phone number bug** - Update User model and endpoints (Phase 2)
3. **Address CSS build issue** - Fix the pre-existing CSS syntax error
4. **Deploy to Heroku** - Follow the deployment process

## Environment Variables Needed

### Required for Production:
```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/massage_booking_app
SESSION_SECRET=your-very-strong-session-secret-here
GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here
NODE_ENV=production
REACT_APP_API_URL=https://your-heroku-app.herokuapp.com
```

### Optional (Nice-to-have):
```bash
# Email notifications
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Payment integration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key

# Error tracking
SENTRY_DSN=https://your-sentry-dsn.ingest.sentry.io/your-project-id
```

## Deployment Commands

```bash
# Set up Heroku
heroku create your-app-name
heroku config:set MONGODB_URI=your-mongodb-uri
heroku config:set SESSION_SECRET=your-secret
heroku config:set GOOGLE_MAPS_API_KEY=your-key
heroku config:set NODE_ENV=production

# Deploy
git add .
git commit -m "Prepare for Heroku deployment"
git push heroku main

# Monitor
heroku ps:scale web=1
heroku logs --tail
```

## Testing Commands

```bash
# Test build
npm run build

# Test production server locally
NODE_ENV=production MONGODB_URI=your-uri npm start

# Check environment variables
heroku config
