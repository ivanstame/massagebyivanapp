const User = require('../models/User');

// Middleware to log detailed request information
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const { method, originalUrl, headers, cookies, session } = req;
  
  console.log('\n=== REQUEST DEBUG ===');
  console.log(`Time: ${timestamp}`);
  console.log(`Method: ${method}`);
  console.log(`URL: ${originalUrl}`);
  console.log('Headers:', JSON.stringify(headers, null, 2));
  console.log('Cookies:', JSON.stringify(cookies, null, 2));
  console.log('Session ID:', session?.id || 'No session');
  console.log('Session Data:', JSON.stringify(session, null, 2));
  console.log('Authenticated:', req.isAuthenticated ? req.isAuthenticated() : false);
  console.log('User:', req.user ? req.user._id : 'No user');
  console.log('=====================\n');
  
  next();
};

// Middleware to log response information
const responseLogger = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(body) {
    console.log('\n=== RESPONSE DEBUG ===');
    console.log(`Status: ${res.statusCode}`);
    console.log('Headers:', JSON.stringify(res.getHeaders(), null, 2));
    console.log('Body:', typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    console.log('======================\n');
    
    return originalSend.call(this, body);
  };
  
  next();
};

// Debug endpoint to check session and database status
const debugSession = async (req, res) => {
  try {
    const sessionInfo = {
      sessionId: req.session?.id,
      sessionData: req.session,
      authenticated: req.isAuthenticated ? req.isAuthenticated() : false,
      user: req.user ? req.user._id : null,
      cookies: req.cookies,
      headers: req.headers
    };

    // Check database connection by trying to count users
    const userCount = await User.countDocuments();
    const dbStatus = {
      connected: true,
      userCount: userCount
    };

    res.json({
      session: sessionInfo,
      database: dbStatus,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        mongodbUri: process.env.MONGODB_URI ? 'Set (hidden)' : 'Not set',
        sessionSecret: process.env.SESSION_SECRET ? 'Set (hidden)' : 'Not set',
        apiUrl: process.env.REACT_APP_API_URL || 'Not set'
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ 
      error: 'Debug endpoint failed',
      message: error.message,
      stack: error.stack
    });
  }
};

// Middleware to check database connection on each request
const dbConnectionChecker = async (req, res, next) => {
  try {
    // Simple query to check if database is connected
    const count = await User.countDocuments();
    req.dbConnected = true;
    next();
  } catch (error) {
    console.error('Database connection check failed:', error);
    req.dbConnected = false;
    next();
  }
};

module.exports = {
  requestLogger,
  responseLogger,
  debugSession,
  dbConnectionChecker
};
