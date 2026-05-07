// Field-level AES-256-GCM encryption for CMIA medical fields and
// OAuth tokens. Format-prefixed so reads can transparently fall back
// to plaintext for legacy rows during the encrypt-existing-data
// migration window — once the migration completes, every row should
// have the prefix.
//
// FIELD_ENCRYPTION_KEY is a 32-byte (64-char hex) secret. Generate
// once with `openssl rand -hex 32` and store in the deploy env. If
// the key is ever lost, encrypted fields are unrecoverable — back
// the env var up to your password manager / secrets vault.
//
// Format: "enc:v1:<iv-b64>:<ciphertext-b64>:<authTag-b64>"
//   - v1: format version. Bumping it lets future code distinguish
//         e.g. v1 (AES-GCM) from a hypothetical v2 (rotated cipher).
//   - iv: 12 random bytes per call. NIST recommends 96-bit IVs for GCM.
//   - authTag: 16 bytes appended by GCM, protects integrity.

const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

let cachedKey = null;
function getKey() {
  if (cachedKey) return cachedKey;
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: FIELD_ENCRYPTION_KEY required in production');
    }
    // Dev-only fallback. Do NOT ship — production guard above prevents
    // accidental leakage. Encrypted blobs written under this key are
    // toy data and won't decrypt against the real production key.
    cachedKey = Buffer.alloc(32, 0);
    return cachedKey;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptString(plaintext) {
  if (plaintext == null) return plaintext;
  if (typeof plaintext !== 'string') return plaintext;
  if (plaintext.length === 0) return plaintext;
  if (isEncrypted(plaintext)) return plaintext; // already encrypted, idempotent

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    PREFIX.slice(0, -1), // 'enc:v1' without trailing ':'
    iv.toString('base64'),
    ciphertext.toString('base64'),
    authTag.toString('base64'),
  ].join(':');
}

function decryptString(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  if (!isEncrypted(value)) return value; // legacy plaintext, return as-is

  const parts = value.split(':');
  // Expected: ['enc', 'v1', iv, ciphertext, authTag]
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    // Malformed — log and return as-is rather than throw, so a single
    // corrupt row doesn't kill an entire fetch.
    console.warn('fieldCrypto: malformed encrypted value, returning as-is');
    return value;
  }
  try {
    const iv = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    const authTag = Buffer.from(parts[4], 'base64');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    console.error('fieldCrypto: decrypt failed:', err.message);
    // Returning the encrypted blob is wrong (caller would treat
    // ciphertext as plaintext), but throwing breaks every read for
    // every user. Compromise: return null so the caller sees "no
    // value" — visibly broken but recoverable. Operator sees the
    // log line and rotates / restores the key.
    return null;
  }
}

module.exports = {
  encryptString,
  decryptString,
  isEncrypted,
};
