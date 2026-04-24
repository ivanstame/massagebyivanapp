const mongoose = require('mongoose');

// One-time token a provider generates so a managed client can take over their
// own account. Stored as the sha256 hash of the random token; the raw value
// only lives in the URL the provider hands to the client. Single-use: once
// `usedAt` is set, the token cannot be redeemed again. Expired tokens are
// auto-removed by the MongoDB TTL index on `expiresAt`.
//
// Generating a new token for the same managed client implicitly revokes any
// pending unused tokens for that client (see routes/claim.js).
const ClaimTokenSchema = new mongoose.Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  // The managed-client User doc being claimed. Must have isManaged: true at
  // token generation time; the redeem endpoint re-checks on use.
  managedClient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // The provider who generated this link — we verify they still own the
  // managed client at generation time, and keep this as a provenance record.
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // TTL: doc removed when expiresAt passes
  },
  usedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('ClaimToken', ClaimTokenSchema);
