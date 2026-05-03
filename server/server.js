// server/server.js
require('dotenv').config();

// Suppress Node's DEP0170 (Invalid URL) deprecation warning — it prints
// the full MongoDB connection string, including the embedded password,
// to stderr every time the MongoDB driver parses the SRV URI. Filtering
// just that one warning keeps every other deprecation visible.
process.on('warning', (warning) => {
  if (warning.code === 'DEP0170') return;
  console.warn(warning.stack || `${warning.name}: ${warning.message}`);
});

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
require('./config/passport')(passport);
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const User = require('./models/User');
const bookingRoutes = require('./routes/bookings');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const availabilityRoutes = require('./routes/availability');
const geocodeRoutes = require('./routes/geocode');
const {
  ensureProvider,
  ensureProviderOrAdmin,
  validateProviderClient,
  providerRateLimit
} = require('./middleware/passportMiddleware');
const { requestLogger, responseLogger, debugSession, dbConnectionChecker } = require('./middleware/debugMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for Heroku to handle secure cookies properly
app.set('trust proxy', 1);

// MongoDB Atlas connection - environment variable is required
if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required');
}
// Don't log the URI — it contains the DB password. Anyone with `heroku
// logs` access would otherwise see credentials in plaintext history.
console.log('Connecting to MongoDB Atlas…');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true, // This fixes the ensureIndex depercation warning
  autoIndex: true // Make sure indexes are created
}).then(async () => {
  console.log('Connected to MongoDB Atlas');

  // Reconcile the User collection's indexes against the current schema.
  // autoIndex creates missing indexes but never drops/recreates on option
  // changes — syncIndexes does. This caught us once (see
  // scripts/fix-email-index.js for the backstory); running it on boot
  // means future schema-level index changes apply without a manual step.
  // Non-fatal on failure so the server still comes up.
  try {
    const result = await User.syncIndexes();
    if (result && result.length) {
      console.log('[DB] User index reconciliation:', result);
    }
  } catch (err) {
    console.error('[DB] User.syncIndexes failed:', err.message);
  }

  // Start the reminder scheduler
  const { startReminderScheduler } = require('./services/reminderScheduler');
  startReminderScheduler();

  // Start Google Calendar sync scheduler
  const { startGoogleCalendarScheduler } = require('./services/googleCalendarSync');
  startGoogleCalendarScheduler();
}).catch(err => {
  console.error('MongoDB Atlas connection error:', err);
  process.exit(1); // Exit process on connection failure
});

app.use((req, res, next) => {
  console.log('Incoming request:', {
    origin: req.headers.origin,
    host: req.headers.host,
    url: req.url,
    method: req.method
  });
  next();
});

// Add debug logging middleware
app.use(requestLogger);
app.use(responseLogger);
app.use(dbConnectionChecker);

// Stripe webhook needs raw body — must be registered BEFORE json parser
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
// Google Calendar webhook also needs to be before json parser
app.use('/api/google-calendar/webhook', express.raw({ type: 'application/json' }));

// Middleware setup - ORDER IS IMPORTANT
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Debug middleware for request body
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/availability') {
    console.log('DEBUG - Request body:', req.body);
    console.log('DEBUG - Content-Type:', req.headers['content-type']);
    console.log('DEBUG - Body type:', typeof req.body);
    console.log('DEBUG - Body keys:', Object.keys(req.body));
  }
  next();
});

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  /^http:\/\/192\.168\.\d+\.\d+:(3000|5000)$/,
  'https://massagebyivan.com',
  'https://api.massagebyivan.com',
  'https://avayble.app',
  'https://www.avayble.app',
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in the allowed list (string match or any regex match)
    const allowed = allowedOrigins.some(entry =>
      entry instanceof RegExp ? entry.test(origin) : entry === origin
    );
    if (allowed) {
      return callback(null, true);
    }
    
    // In production, allow the current host if it's localhost
    if (process.env.NODE_ENV === 'production' && origin && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Default to localhost:3000 in development or massagebyivan.com in production
    const defaultOrigin = process.env.NODE_ENV === 'production'
      ? 'https://massagebyivan.com'
      : 'http://localhost:3000';
    
    callback(null, defaultOrigin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Handle preflight requests
app.options('*', cors());

// Session middleware MUST come before passport
const isProduction = process.env.NODE_ENV === 'production';

// Fail fast in production rather than fall back to a hardcoded secret.
// A predictable secret means anyone can forge a session and impersonate
// any user — there's no upside to letting the server limp along
// without a real value set.
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required in production');
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-insecure-secret';

// Absolute session TTL in hours. Defaults to 8 — typical workday — so a
// stolen cookie has a bounded blast radius. Override per env if a
// provider's day genuinely runs longer than that.
const SESSION_HOURS = Number(process.env.SESSION_MAX_AGE_HOURS) || 8;
const SESSION_TTL_MS = SESSION_HOURS * 60 * 60 * 1000;

// Create MongoStore instance first with explicit configuration
const store = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: 'sessions',
  ttl: Math.floor(SESSION_TTL_MS / 1000), // seconds, matches cookie maxAge
  autoRemove: 'native' // Use MongoDB's TTL index for automatic removal
});

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: false, // absolute TTL from login, not sliding — no silent extension on activity
  store: store,
  cookie: {
    secure: isProduction, // Use secure cookies in production only
    httpOnly: true,
    // 'lax' is the right default — frontend and API are same-origin so
    // there's no cross-site request that legitimately needs the cookie.
    // 'none' would broaden the attack surface (any cross-site request
    // including the cookie) for no benefit.
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
  }
}));

// Passport middleware MUST come after session
app.use(passport.initialize());
app.use(passport.session());

// Add debug endpoint
app.get('/api/debug/session', debugSession);

// Routes come after all middleware
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/invitations', require('./routes/invitations'));
app.use('/api', require('./routes/direct-access'));
app.use('/api/provider-requests', require('./routes/provider-assignment-requests'));
app.use('/api/weekly-template', require('./routes/weekly-template'));
app.use('/api/saved-locations', require('./routes/saved-locations'));
app.use('/api/weekly-outreach', require('./routes/weekly-outreach'));
app.use('/api/join-code', require('./routes/join-code'));
app.use('/api/stripe', require('./routes/stripe'));
app.use('/api/google-calendar', require('./routes/googleCalendar'));
app.use('/api/google-calendar', require('./routes/googleCalendarWebhook'));
app.use('/api/claim', require('./routes/claim'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/recurring-series', require('./routes/recurring-series'));

// Provider-specific routes and rate limiting
const providerApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this provider, please try again later'
});

app.use('/api/provider', ensureProvider);
app.use('/api/provider', providerApiLimiter);
app.use('/api/provider/availability', require('./routes/availability'));
app.use('/api/provider/bookings', require('./routes/bookings'));
app.use('/api/provider/blocked-times', require('./routes/blocked-times'));

// Explicit route for SMS consent policy
app.get('/sms-consent-policy.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/sms-consent-policy.html'));
});

// Build-version endpoint. The version file is written by scripts/stamp-version.js
// during heroku-postbuild. Clients poll this to detect when a new deploy is live.
app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const fs = require('fs');
    const versionPath = path.join(__dirname, '../build/version.json');
    if (fs.existsSync(versionPath)) {
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      return res.json(data);
    }
    // Fallback for local dev where build/ may not exist
    return res.json({ version: 'dev', buildTime: null });
  } catch (err) {
    console.error('Error reading version file:', err);
    return res.status(500).json({ error: 'Failed to read version' });
  }
});

if (process.env.NODE_ENV === 'production') {
  // Serve React build with split cache policy:
  //   - Hashed asset files (build/static/*) get immutable long-lived caching
  //     because CRA embeds a content hash in the filename.
  //   - index.html must never be cached or users keep loading stale builds.
  // Must come BEFORE express.static('../public') so that GET / resolves to
  // the processed build/index.html (with the bundled <script> injected by
  // webpack), not the raw CRA template in public/index.html which has no
  // script tag and renders as a blank screen.
  app.use(express.static(path.join(__dirname, '../build'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(path.sep + 'index.html') || filePath.endsWith('/index.html')) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(path.sep + 'static' + path.sep)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
}

// Fallback static handler — serves anything in public/ that the build/
// handler above didn't claim. CRA copies all of public/ into build/ at
// build time, so in production this is mostly redundant, but it keeps
// dev (no build/ dir) working: GET / hits public/index.html and the CRA
// dev server on port 3000 takes care of bundling.
app.use(express.static(path.join(__dirname, '../public')));

if (process.env.NODE_ENV === 'production') {
  // Catch-all for client-side routes (e.g. /login, /provider/...). MUST
  // come after both static handlers — otherwise it would intercept
  // legitimate static asset requests and return index.html for them.
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
  });
}

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is reachable!' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err.stack);

  // Handle provider-specific errors
  if (err.name === 'ProviderValidationError') {
    return res.status(400).json({
      message: 'Provider validation failed',
      errors: err.errors
    });
  }

  // Handle client-provider relationship errors
  if (err.name === 'ClientProviderError') {
    return res.status(403).json({
      message: 'Invalid client-provider relationship',
      error: err.message
    });
  }

  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server is accessible at http://localhost:${PORT}`);
  console.log(`For local network access, use your computer's IP address`);
  
  // Log environment for debugging
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? 'Set' : 'Not set'}`);
});
