// server/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  smsConsent: {
    type: Boolean,
    default: false
  },
  email: {
    type: String,
    // Managed clients (created by a provider on their behalf) don't have email.
    required: function() { return !this.isManaged; },
    unique: true,
    sparse: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() { return !this.isManaged; }
  },
  accountType: {
    type: String,
    enum: ['PROVIDER', 'CLIENT', 'SUPER_ADMIN'],
    required: true
  },
  // A provider-managed client profile: created by the provider for someone who
  // won't register themselves (elderly/low-tech). Never logs in. managedBy is
  // the provider who owns the record; providerId is also set so existing
  // client-list / booking queries pick them up without changes.
  isManaged: {
    type: Boolean,
    default: false
  },
  managedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  joinCode: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: [/^[a-z0-9]+$/, 'Join code must be alphanumeric only']
  },
  joinCodeLastChanged: {
    type: Date,
    default: null
  },
  providerProfile: {
    businessName: String,
    // Provider's trade — drives placeholder copy and starter packages on the Services page.
    // Kept loose (default 'other') so the flow works for providers who haven't picked one.
    trade: {
      type: String,
      enum: ['massage', 'esthetics', 'detailing', 'training', 'grooming', 'other'],
      default: 'other'
    },
    subscription: {
      plan: {
        type: String,
        enum: [null, 'BASIC', 'PRO'],
        default: 'BASIC'
      },
      status: {
        type: String,
        enum: [null, 'ACTIVE', 'PAST_DUE', 'CANCELLED'],
        default: 'ACTIVE'
      },
      expiresAt: Date
    },
    // Provider-accepted payment methods
    acceptedPaymentMethods: {
      type: [String],
      enum: ['cash', 'zelle', 'venmo', 'card'],
      default: ['cash']
    },
    // Direct Venmo handle (e.g. "ivan-stame"). When present, Venmo bookings
    // skip Stripe and surface a pay-on-Venmo deep link instead. Storage is
    // without the leading @; validation trims and lowercases the prefix.
    venmoHandle: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
      match: [/^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/, 'Venmo handle may only contain letters, numbers, dashes, and underscores']
    },
    // Provider-configured pricing by duration. displayOrder lets the
    // provider override the default duration-ascending sort with a
    // hand-curated order (drag-to-reorder in ProviderServices).
    // basePricing is the implicit "Standard" tier — the rates new
    // clients see by default. Alternate tiers (Discount, Concierge,
    // grandfathered, etc.) live in pricingTiers below and are tagged
    // onto specific clients via clientProfile.pricingTierId.
    basePricing: [{
      duration: { type: Number, required: true },  // minutes: 60, 90, 120
      price: { type: Number, required: true },
      label: String,  // e.g. "60 Minutes"
      displayOrder: { type: Number, default: null }
    }],
    // Named alternate pricing tiers. Each tier has its own pricing
    // array (same shape as basePricing) and a stable _id that clients
    // reference via clientProfile.pricingTierId. The Standard tier is
    // basePricing above — tiers here are the alternates only.
    pricingTiers: [{
      name: { type: String, required: true, trim: true, maxlength: 60 },
      pricing: [{
        duration: { type: Number, required: true },
        price: { type: Number, required: true },
        label: String,
        displayOrder: { type: Number, default: null }
      }]
    }],
    // Stripe Connect
    stripeAccountId: { type: String, default: null },
    stripeAccountStatus: {
      type: String,
      enum: ['not_connected', 'pending', 'active', 'restricted'],
      default: 'not_connected'
    },
    // Provider-configured add-on services
    addons: [{
      name: { type: String, required: true },
      price: { type: Number, required: true },
      description: String,
      extraTime: { type: Number, default: 0 },  // additional minutes
      isActive: { type: Boolean, default: true }
    }],
    // Home office designation (affects mileage deduction rules)
    homeOffice: { type: Boolean, default: false },
    // Cancellation policy
    cancellationPolicy: {
      windowHours: { type: Number, default: 24 },  // hours before appointment
      lateCancelFee: { type: Number, default: 0 },  // fee in dollars (0 = no fee, just warning)
      enabled: { type: Boolean, default: false }
    },
    // Google Calendar integration
    googleCalendar: {
      accessToken: { type: String, default: null },
      refreshToken: { type: String, default: null },
      tokenExpiry: { type: Date, default: null },
      connected: { type: Boolean, default: false },
      connectedEmail: { type: String, default: null },
      syncedCalendarIds: { type: [String], default: [] },
      watchChannels: {
        type: Map,
        of: new mongoose.Schema({
          channelId: String,
          resourceId: String,
          expiration: Date
        }, { _id: false }),
        default: new Map()
      },
      syncTokens: {
        type: Map,
        of: String,
        default: new Map()
      },
      lastSyncedAt: { type: Date, default: null }
    }
  },
  // Add the new clientProfile field here
  clientProfile: {
    notes: String,  // For storing client notes, preferences, special instructions
    preferences: mongoose.Schema.Types.Mixed,  // Flexible field for client-specific options
    // Optional reference to one of the provider's pricingTiers subdocs
    // (providerProfile.pricingTiers[]._id). When set, booking flows
    // resolve this client's prices from that tier instead of the
    // provider's basePricing. Null/missing = Standard (basePricing).
    pricingTierId: { type: mongoose.Schema.Types.ObjectId, default: null },
    stats: {
      totalAppointments: { type: Number, default: 0 },
      upcomingAppointments: { type: Number, default: 0 },
      completedAppointments: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 }
    }
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  registrationStep: {
    type: Number,
    default: 1,
    enum: [1, 2, 3]  // Explicitly define valid steps
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  lastLogin: {
    type: Date,
    default: null
  },
  profile: {
    fullName: String,
    phoneNumber: String,
    address: {
      street: String,
      unit: String,
      city: String,
      state: String,
      zip: String,
      formatted: String  // Keep formatted version for backwards compatibility
    },
    emergencyContact: {
      name: String,
      phone: String
    },
    treatmentPreferences: {
      pressure: {
        type: String,
        enum: ['light', 'medium', 'firm', 'deep'],
        default: 'medium'
      },
      focusAreas: { type: [String], default: [] },
      avoidAreas: { type: [String], default: [] },
      oilSensitivities: { type: String, default: '' },
      notes: { type: String, default: '' }
    }
  }
}, {
  timestamps: true
});

// Password hashing middleware
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.pre('save', function(next) {
  // Automatically set providerId for new provider accounts
  if (this.isNew && this.accountType === 'PROVIDER' && !this.providerId) {
    this.providerId = this._id;
  }
  next();
});

// Password comparison for Passport. Managed clients have no password and
// must never authenticate.
UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error(error);
  }
};

// Static method for finding by email
UserSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Update login timestamp
UserSchema.methods.updateLoginTimestamp = function() {
  this.lastLogin = new Date();
  return this.save();
};
// Public profile method
UserSchema.methods.getPublicProfile = function() {
  const obj = this.toObject();
  delete obj.password;
  
  // Add account type info to profile
  obj.isProvider = this.accountType === 'PROVIDER';
  obj.isClient = this.accountType === 'CLIENT';
  obj.isSuperAdmin = this.accountType === 'SUPER_ADMIN';

  // Check if treatmentPreferences and bodyAreas exist
  if (obj.profile && obj.profile.treatmentPreferences && obj.profile.treatmentPreferences.bodyAreas) {
    // Convert Map to object if it's still a Map
    if (obj.profile.treatmentPreferences.bodyAreas instanceof Map) {
      obj.profile.treatmentPreferences.bodyAreas = Object.fromEntries(obj.profile.treatmentPreferences.bodyAreas);
    }
  }

  // Initialize clientProfile if it doesn't exist for CLIENT users
  if (this.accountType === 'CLIENT' && !obj.clientProfile) {
    obj.clientProfile = {
      notes: '',
      preferences: {},
      stats: {
        totalAppointments: 0,
        upcomingAppointments: 0,
        completedAppointments: 0,
        totalRevenue: 0
      }
    };
  }

  return obj;
};




// Convert to JSON method
UserSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Method to update client notes
UserSchema.methods.updateClientNotes = async function(notes) {
  if (!this.clientProfile) {
    this.clientProfile = {
      notes: '',
      preferences: {},
      stats: {
        totalAppointments: 0,
        upcomingAppointments: 0,
        completedAppointments: 0,
        totalRevenue: 0
      }
    };
  }
  
  this.clientProfile.notes = notes;
  return await this.save();
};

// Method to update client preferences
UserSchema.methods.updateClientPreferences = async function(preferences) {
  if (!this.clientProfile) {
    this.clientProfile = {
      notes: '',
      preferences: {},
      stats: {
        totalAppointments: 0,
        upcomingAppointments: 0,
        completedAppointments: 0,
        totalRevenue: 0
      }
    };
  }
  
  this.clientProfile.preferences = preferences;
  return await this.save();
};

// Method to update client stats
UserSchema.methods.updateClientStats = async function(stats) {
  if (!this.clientProfile) {
    this.clientProfile = {
      notes: '',
      preferences: {},
      stats: {
        totalAppointments: 0,
        upcomingAppointments: 0,
        completedAppointments: 0,
        totalRevenue: 0
      }
    };
  }
  
  this.clientProfile.stats = {
    ...this.clientProfile.stats,
    ...stats
  };
  
  return await this.save();
};

// Enhanced Profile update method
UserSchema.methods.updateProfile = async function(profileData) {
  // Format the address
  const formattedAddress = `${profileData.street}${profileData.unit ? ' ' + profileData.unit : ''}, ${profileData.city}, ${profileData.state} ${profileData.zip}`;
  
  // Update profile with new structure
  this.profile = {
    fullName: profileData.fullName,
    phoneNumber: profileData.phoneNumber,
    address: {
      street: profileData.street || '',
      unit: profileData.unit || '',
      city: profileData.city || '',
      state: profileData.state || '',
      zip: profileData.zip || '',
      formatted: formattedAddress
    },
    emergencyContact: {
      name: profileData.emergencyContactName || '',
      phone: profileData.emergencyContactPhone || ''
    },
    // Preserve existing treatment preferences
    treatmentPreferences: this.profile?.treatmentPreferences || {
      pressure: 'medium',
      focusAreas: [],
      avoidAreas: [],
      oilSensitivities: '',
      notes: ''
    }
  };

  // Update registration step if provided
  if (profileData.registrationStep) {
    this.registrationStep = profileData.registrationStep;
  }

  // Save and return the updated document
  return await this.save();
};

// New method for updating treatment preferences
UserSchema.methods.updateTreatmentPreferences = async function(preferencesData) {
  if (!this.profile.treatmentPreferences) {
    this.profile.treatmentPreferences = { bodyAreas: new Map() };
  }

  // Update bodyAreas with new data
  this.profile.treatmentPreferences.bodyAreas = new Map(Object.entries(preferencesData.bodyAreas));

  return await this.save();
};

// Provider relationship methods
UserSchema.methods.getClients = async function() {
  return await this.model('User').find({ providerId: this._id });
};

UserSchema.methods.isProviderOf = async function(clientId) {
  const client = await this.model('User').findById(clientId);
  return client && client.providerId?.equals(this._id);
};

module.exports = mongoose.model('User', UserSchema);
