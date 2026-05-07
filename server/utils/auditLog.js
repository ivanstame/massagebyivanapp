// Audit-logging convenience wrapper. Centralizes the IP / user-agent /
// userId extraction so callers can pass an Express `req` and a small
// description object without repeating themselves. Keeps audit calls
// to one line at each instrumented point.
//
// Audit writes are fire-and-forget: failures log a warning and don't
// propagate. Rationale: a failed audit insert should never break a
// live business operation (cancel a booking, log a user in). The cost
// of a missed log line is acceptable; the cost of a 500 on /login
// because the AuditLog collection had a hiccup is not.

const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

// Extract caller-context metadata from an Express request. Falls back
// to safe defaults when called without a req (background jobs, scripts).
function contextFromReq(req) {
  if (!req) return { ip: null, userAgent: null };
  return {
    ip: req.ip
      || req.headers['x-forwarded-for']
      || req.connection?.remoteAddress
      || null,
    userAgent: req.headers?.['user-agent'] || null,
  };
}

// Record an audit event. Pass any combination of these fields:
//   userId, action, resource, resourceId, outcome, details, req
// Returns immediately — the write is awaited in the background.
function audit({ userId, action, resource, resourceId, outcome, details, req }) {
  if (!action || !resource) {
    logger.warn('audit() called without action+resource — ignored');
    return;
  }
  const { ip, userAgent } = contextFromReq(req);
  // Don't await — caller proceeds. Errors land in the warn path.
  AuditLog.create({
    userId: userId || req?.user?._id || null,
    action,
    resource,
    resourceId: resourceId || null,
    outcome: outcome || 'success',
    details: details || null,
    ip,
    userAgent,
  }).catch(err => {
    logger.warn(`audit log insert failed: ${err.message}`);
  });
}

module.exports = { audit };
