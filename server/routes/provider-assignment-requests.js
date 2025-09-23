const express = require('express');
const router = express.Router();
const ProviderAssignmentRequest = require('../models/ProviderAssignmentRequest');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// @route   GET /api/provider-requests/available-providers
// @desc    Get all available providers for client selection
// @access  Private (Client only)
router.get('/available-providers', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'CLIENT') {
      return res.status(403).json({ message: 'Only clients can access available providers' });
    }

    const providers = await User.find({ 
      accountType: 'PROVIDER'
    }).select('email providerProfile.businessName');

    res.json({
      providers: providers.map(provider => ({
        id: provider._id,
        email: provider.email,
        businessName: provider.providerProfile.businessName
      }))
    });
  } catch (error) {
    console.error('Error fetching available providers:', error);
    res.status(500).json({ message: 'Error fetching available providers' });
  }
});

// @route   POST /api/provider-requests
// @desc    Create a new provider assignment request
// @access  Private (Client only)
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'CLIENT') {
      return res.status(403).json({ message: 'Only clients can create assignment requests' });
    }

    const { providerId, clientMessage } = req.body;

    // Check if provider exists
    const provider = await User.findById(providerId);
    if (!provider || provider.accountType !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    // Check if client already has a pending request for this provider
    const existingRequest = await ProviderAssignmentRequest.hasPendingRequest(req.user._id, providerId);
    if (existingRequest) {
      return res.status(400).json({ message: 'You already have a pending request for this provider' });
    }

    // Create new request
    const assignmentRequest = new ProviderAssignmentRequest({
      client: req.user._id,
      provider: providerId,
      clientMessage: clientMessage || ''
    });

    await assignmentRequest.save();

    // Populate provider info for response
    await assignmentRequest.populate('provider', 'email providerProfile.businessName');

    res.status(201).json({
      message: 'Provider assignment request submitted successfully',
      request: {
        id: assignmentRequest._id,
        provider: {
          id: assignmentRequest.provider._id,
          businessName: assignmentRequest.provider.providerProfile.businessName,
          email: assignmentRequest.provider.email
        },
        status: assignmentRequest.status,
        createdAt: assignmentRequest.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating provider assignment request:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ message: `Error creating provider assignment request: ${error.message}` });
  }
});

// @route   GET /api/provider-requests/pending
// @desc    Get pending assignment requests for a provider
// @access  Private (Provider only)
router.get('/pending', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can view pending requests' });
    }

    const pendingRequests = await ProviderAssignmentRequest.findPendingForProvider(req.user._id);

    res.json({
      requests: pendingRequests.map(request => ({
        id: request._id,
        client: {
          id: request.client._id,
          email: request.client.email,
          fullName: request.client.profile?.fullName || '',
          phoneNumber: request.client.profile?.phoneNumber || ''
        },
        clientMessage: request.clientMessage,
        createdAt: request.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({ message: 'Error fetching pending requests' });
  }
});

// @route   PUT /api/provider-requests/:requestId/accept
// @desc    Accept a provider assignment request
// @access  Private (Provider only)
router.put('/:requestId/accept', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can accept requests' });
    }

    const { requestId } = req.params;
    const { providerNotes } = req.body;

    const assignmentRequest = await ProviderAssignmentRequest.findById(requestId);
    
    if (!assignmentRequest) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (!assignmentRequest.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only accept your own requests' });
    }

    if (assignmentRequest.status !== 'PENDING') {
      return res.status(400).json({ message: 'Request is not pending' });
    }

    // Update status and handle provider assignment
    await assignmentRequest.updateStatus('ACCEPTED', providerNotes);

    res.json({
      message: 'Provider assignment request accepted successfully',
      request: {
        id: assignmentRequest._id,
        status: assignmentRequest.status,
        providerNotes: assignmentRequest.providerNotes
      }
    });
  } catch (error) {
    console.error('Error accepting provider assignment request:', error);
    res.status(500).json({ message: 'Error accepting provider assignment request' });
  }
});

// @route   PUT /api/provider-requests/:requestId/deny
// @desc    Deny a provider assignment request
// @access  Private (Provider only)
router.put('/:requestId/deny', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can deny requests' });
    }

    const { requestId } = req.params;
    const { providerNotes } = req.body;

    const assignmentRequest = await ProviderAssignmentRequest.findById(requestId);
    
    if (!assignmentRequest) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (!assignmentRequest.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only deny your own requests' });
    }

    if (assignmentRequest.status !== 'PENDING') {
      return res.status(400).json({ message: 'Request is not pending' });
    }

    // Update status
    await assignmentRequest.updateStatus('DENIED', providerNotes);

    res.json({
      message: 'Provider assignment request denied successfully',
      request: {
        id: assignmentRequest._id,
        status: assignmentRequest.status,
        providerNotes: assignmentRequest.providerNotes
      }
    });
  } catch (error) {
    console.error('Error denying provider assignment request:', error);
    res.status(500).json({ message: 'Error denying provider assignment request' });
  }
});

// @route   GET /api/provider-requests/client/status
// @desc    Get assignment request status for client
// @access  Private (Client only)
router.get('/client/status', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'CLIENT') {
      return res.status(403).json({ message: 'Only clients can view request status' });
    }

    const pendingRequest = await ProviderAssignmentRequest.findPendingForClient(req.user._id);

    if (!pendingRequest) {
      return res.json({ hasPendingRequest: false });
    }

    res.json({
      hasPendingRequest: true,
      request: {
        id: pendingRequest._id,
        provider: {
          id: pendingRequest.provider._id,
          businessName: pendingRequest.provider.providerProfile.businessName,
          email: pendingRequest.provider.email
        },
        status: pendingRequest.status,
        createdAt: pendingRequest.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching client request status:', error);
    res.status(500).json({ message: 'Error fetching request status' });
  }
});

module.exports = router;
