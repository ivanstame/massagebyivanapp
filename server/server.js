// server/server.js
require('dotenv').config();

// Validate critical environment variables before proceeding
function validateEnvironment() {
  const requiredVars = ['MONGODB_URI', 'SESSION_SECRET'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}. Please check your .env file or deployment configuration.`;
    console.error('Environment Validation Error:', errorMessage);
    
    // In production, exit if critical variables are missing
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('WARNING: Running with missing environment variables. This may cause issues.');
      if (missingVars.includes('MONGODB_URI')) {
        console.warn('Falling back to local MongoDB - this will cause database switching issues during builds');
      }
    }
  }
}

validateEnvironment();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
require('./config/passport')(passport);
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
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required');
}
console.log('Using MongoDB Atlas URI:', MONGODB_URI);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true, // This fixes the ensureIndex depercation warning
  autoIndex: true // Make sure indexes are created
}).then(() => {
  console.log('Connected to MongoDB Atlas');
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
  'http://192.168.1.26:3000', // Explicit entry for the IP
  'http://192.168.1.26:50 00', // Explicit entry for the IP
  /^http:\/\/192\.168\.\d+\.\d+:(3000|5000)$/,
  'https://massagebyivan.com',
  'https://api.massagebyivan.com',
  'https://massagebyivan-9420304df681.herokuapp.com',
  /\.herokuapp\.com$/,
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in the allowed list
    if (allowedOrigins.includes(origin) ||
        (typeof allowedOrigins[0] === 'object' && allowedOrigins[0].test(origin))) {
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

// Create MongoStore instance first with explicit configuration
const store = MongoStore.create({
  mongoUrl: MONGODB_URI,
  collectionName: 'sessions',
  ttl: 24 * 60 * 60, // 24 hours in seconds
  autoRemove: 'native' // Use MongoDB's TTL index for automatic removal
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    secure: isProduction, // Use secure cookies in production only
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site in production, 'lax' for development
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
app.use('/api', require('./routes/direct-access')); // Add direct access routes
app.use('/api/provider-requests', require('./routes/provider-assignment-requests')); // Provider assignment requests

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

// Global error handler
// Enhanced error handling middleware
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

// Serve static files from the React build directory in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../build')));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
  });
}

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is reachable!' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server is accessible at http://localhost:${PORT}`);
  console.log(`For local network access, use your computer's IP address`);
  
  // Log environment for debugging
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? 'Set' : 'Not set'}`);
});
