const mongoose = require('mongoose');

const ProviderAssignmentRequestSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'DENIED'],
    default: 'PENDING'
  },
  clientMessage: {
    type: String,
    default: ''
  },
  providerNotes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Create compound index to ensure one active request per client-provider pair
ProviderAssignmentRequestSchema.index({ 
  client: 1, 
  provider: 1, 
  status: 1 
}, { 
  unique: true,
  partialFilterExpression: { status: 'PENDING' }
});

// Method to update the request status and handle provider assignment
ProviderAssignmentRequestSchema.methods.updateStatus = async function(newStatus, notes = '') {
  this.status = newStatus;
  this.providerNotes = notes;
  
  if (newStatus === 'ACCEPTED') {
    // Update the client's providerId when request is accepted
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(this.client, { providerId: this.provider });
  }
  
  return await this.save();
};

// Static method to find pending requests for a provider
ProviderAssignmentRequestSchema.statics.findPendingForProvider = function(providerId) {
  return this.find({ 
    provider: providerId, 
    status: 'PENDING' 
  }).populate('client', 'email profile.fullName profile.phoneNumber');
};

// Static method to find pending request for a client
ProviderAssignmentRequestSchema.statics.findPendingForClient = function(clientId) {
  return this.findOne({ 
    client: clientId, 
    status: 'PENDING' 
  }).populate('provider', 'email providerProfile.businessName');
};

// Static method to check if a client already has a pending request for a provider
ProviderAssignmentRequestSchema.statics.hasPendingRequest = function(clientId, providerId) {
  return this.findOne({
    client: clientId,
    provider: providerId,
    status: 'PENDING'
  });
};

module.exports = mongoose.model('ProviderAssignmentRequest', ProviderAssignmentRequestSchema);
