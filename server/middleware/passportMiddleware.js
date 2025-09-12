const rateLimit = require('express-rate-limit');
const User = require('../models/User');

const ensureAuthenticated = async (req, res, next) => {
  try {
    if (req.isAuthenticated && req.isAuthenticated()) {
      // Check if the user still exists in the database
      const user = await User.findById(req.user._id);
      if (!user) {
        // User no longer exists, clear the session and return error
        req.logout((err) => {
          if (err) {
            console.error('Error during logout:', err);
          }
        });
        return res.status(401).json({ message: 'Session invalid: user no longer exists' });
      }
      return next();
    }
    res.status(401).json({ message: 'Please log in to access this resource' });
  } catch (error) {
    console.error('Error in ensureAuthenticated:', error);
    res.status(500).json({ message: 'Internal server error during authentication check' });
  }
};

const ensureGuest = (req, res, next) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return next();
  }
  res.status(400).json({ message: 'You are already logged in' });
};

const ensureAdmin = async (req, res, next) => {
  try {
    if (req.isAuthenticated && req.isAuthenticated()) {
      // Check if the user still exists in the database
      const user = await User.findById(req.user._id);
      if (!user) {
        req.logout((err) => {
          if (err) console.error('Error during logout:', err);
        });
        return res.status(401).json({ message: 'Session invalid: user no longer exists' });
      }
      if (user.isAdmin) {
        return next();
      }
    }
    res.status(403).json({ message: 'Admin access required' });
  } catch (error) {
    console.error('Error in ensureAdmin:', error);
    res.status(500).json({ message: 'Internal server error during admin check' });
  }
};

// New middleware functions
const ensureProvider = async (req, res, next) => {
  try {
    if (req.isAuthenticated && req.isAuthenticated()) {
      // Check if the user still exists in the database
      const user = await User.findById(req.user._id);
      if (!user) {
        req.logout((err) => {
          if (err) console.error('Error during logout:', err);
        });
        return res.status(401).json({ message: 'Session invalid: user no longer exists' });
      }
      if (user.accountType === 'PROVIDER') {
        return next();
      }
    }
    res.status(403).json({ message: 'Provider access required' });
  } catch (error) {
    console.error('Error in ensureProvider:', error);
    res.status(500).json({ message: 'Internal server error during provider check' });
  }
};

const ensureProviderOrAdmin = async (req, res, next) => {
  try {
    if (req.isAuthenticated && req.isAuthenticated()) {
      // Check if the user still exists in the database
      const user = await User.findById(req.user._id);
      if (!user) {
        req.logout((err) => {
          if (err) console.error('Error during logout:', err);
        });
        return res.status(401).json({ message: 'Session invalid: user no longer exists' });
      }
      if (user.accountType === 'PROVIDER' || user.isAdmin) {
        return next();
      }
    }
    res.status(403).json({ message: 'Provider or admin access required' });
  } catch (error) {
    console.error('Error in ensureProviderOrAdmin:', error);
    res.status(500).json({ message: 'Internal server error during provider/admin check' });
  }
};

const validateProviderClient = async (req, res, next) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return next();
    }
    
    const clientId = req.params.clientId || req.body.clientId;
    if (!clientId) {
      return next();
    }

    const client = await User.findById(clientId);
    if (!client || !client.providerId.equals(req.user._id)) {
      return res.status(403).json({ message: 'Client does not belong to provider' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error validating client-provider relationship' });
  }
};

const providerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each provider to 100 requests per windowMs
  message: 'Too many requests from this provider, please try again later'
});

module.exports = {
  ensureAuthenticated,
  ensureGuest,
  ensureAdmin,
  ensureProvider,
  ensureProviderOrAdmin,
  validateProviderClient,
  providerRateLimit
};
