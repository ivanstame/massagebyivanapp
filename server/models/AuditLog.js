// Append-only record of sensitive operations. Required for:
//   - PCI DSS 10.1–10.3 (audit trails for payment-related changes)
//   - CMIA breach detection (who accessed which client's medical data)
//   - CCPA accountability (account creation/deletion provenance)
//
// Stored in a CAPPED COLLECTION so storage is bounded — once the
// configured size is reached, MongoDB auto-evicts oldest entries.
// 50 MB ≈ 100k–500k entries depending on detail payloads, easily
// many months of activity for a small business. Bump the cap by
// dropping and recreating the collection if the rotation window
// becomes too short.
//
// IMPORTANT: capped collections do NOT support `_id` updates and
// reject inserts that don't fit the cap. The schema is therefore
// strictly insert-only — no virtuals, no pre-save mutation.
//
// Never log secrets/passwords/raw token values in `details`. The log
// itself is a target for breach. Log identifiers and outcomes only.

const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  // Who performed the action. Null for unauthenticated events
  // (failed logins from a non-existent user).
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  // CRUD-like verb. 'auth' is a separate category for login flows
  // since they don't fit cleanly into create/read/update/delete.
  action: {
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'auth'],
    required: true,
  },
  // What was acted upon. Free-form so callers can introduce new
  // resource types without schema changes ('booking', 'package',
  // 'client_profile', 'session', etc.). Indexed for ad-hoc queries.
  resource: {
    type: String,
    required: true,
    index: true,
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  // Outcome of the action. 'success' is the default; 'failure' is
  // explicit for failed logins, denied authorization, etc.
  outcome: {
    type: String,
    enum: ['success', 'failure'],
    default: 'success',
  },
  // Free-form context. Examples:
  //   { reason: 'invalid_password' } for a failed login
  //   { from: 'unpaid', to: 'paid' } for a payment status change
  //   { cancelledBy: 'PROVIDER', clientId: '...' } for a cancellation
  // Never include actual PII / health data values here — the log
  // collection is itself a breach target.
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  // 50 MB capped. Rotation is automatic.
  capped: { size: 50 * 1024 * 1024 },
  // Keep _id auto-managed; capped collections need a stable _id.
  versionKey: false,
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
