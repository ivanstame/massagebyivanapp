# Avayble — TODO

Prioritized work queue. Order = priority. Items marked **🚧** need provider input before engineering can start.

---

## 1. Security & compliance audit (CRITICAL — pre-launch)

**Audit file:** `~/Downloads/COMPLIANCE_AUDIT.md` (NOT in version control — at risk if Downloads gets cleared).

**Verified findings (all spot-checked against the codebase, all real):**

1. `server/server.js:176` — `SESSION_SECRET` has hardcoded fallback `'your-secret-key'`. Forge-able sessions if env var unset.
2. `server/routes/stripe.js:203` — webhook signature verification is conditional. Forged `payment_intent.succeeded` would mark bookings paid.
3. `server/routes/users.js:771` — `GET /provider/:providerId` no auth. Returns full User minus password.
4. `server/routes/users.js:690` — `GET /provider/:providerId/services` unauthenticated, leaks `venmoHandle`.
5. No Helmet.js (HSTS, CSP, X-Frame-Options missing).
6. Health data plaintext (`medicalConditions`, `allergies`, `treatmentPreferences.notes`).
7. Google OAuth tokens plaintext in DB.
8. Webhook handler no idempotency — Stripe retries overwrite `paidAt`.
9. Account deletion doesn't cascade (PackagePurchase, SavedLocation, RecurringSeries, ClaimToken, WeeklyTemplate, BlockedTime).
10. No structured audit logging.

**Recommended sequence:**
- **Hour 1:** fix #1, #2, #3, #4 (single-block changes, unambiguous)
- **This week:** Helmet (#5), webhook idempotency (#8), encrypt OAuth tokens (#7)
- **Pre-launch:** field-level encryption for health data (#6 — non-trivial, breaks query-by-value, needs blind-index pattern), cascade delete (#9), audit logging (#10)
- **Separately:** privacy policy (legal, not engineering)

---

## 2. 🚧 White-label provider logos (high priority — MB conversion wedge)

**Origin:** Reddit complaint thread (r/massage) where MB users called out the platform for hijacking branding on outgoing client comms:
> *"appointment confirmation emails should have MY business logo, not theirs."*

Once shipped, Avayble can position as **"Your brand, end to end. Avayble runs the booking; your clients only ever see you."** — a direct wedge for MassageBook churners.

### Current state (single-tenant warts)

- `server/utils/email.js` has `<h1>Massage by Ivan</h1>` hardcoded. Single-tenant code; doesn't generalize.
- No `logoUrl` field on the User model.
- No upload UI.
- Booking page header is text-only (business name).

### What we'll build

- Schema: `User.providerProfile.logoUrl: String` (nullable, no migration needed)
- Upload UI in `ProviderSettings` — drag-drop / file picker + preview
- Email template parameterization across all 5 templates (confirmation, provider notification, cancellation, completion, password reset). Logo image when set, styled-text fallback otherwise.
- Booking page + confirmation modal show the logo at the top.
- Auto-resize / optimization via Cloudinary transformations (200×60 letterbox).

### 🚧 Required from provider before starting

1. **Cloudinary account** (free tier covers our scale by orders of magnitude). Sign up → set on Heroku:
   ```
   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
   ```
   Different host (Cloudflare Images / S3) is fine, just say so.
2. **Massage by Ivan logo file** (PNG with transparency or SVG). Optional — without one, fallback is styled text rendering of the business name (≈ what's hardcoded today).
3. **Decision on Resend.** Email templates won't actually deliver until `RESEND_API_KEY` is set. Either:
   - Wire Resend alongside this work (recommended — get the white-label benefit live the same day), OR
   - Ship template changes, turn on Resend later.

### Acquisition follow-on (non-engineering)

- `avayble.com/vs-massagebook` comparison landing page.
- Substantive Reddit replies in r/massage (not spammy — answer the question, link last).
- Direct outreach to identified MB providers in our service area.

### Estimated build

~1 day end-to-end:
- Logo upload (4 hrs — Cloudinary widget, settings UI, save endpoint)
- Email template parameterization (2 hrs)
- Booking page header (1 hr)
- Schema additions (trivial)

### Files that will change

- `server/models/User.js`
- `server/routes/users.js`
- `server/utils/email.js`
- `src/components/ProviderSettings.js`
- `src/components/BookingFormComponents/BookingConfirmationModal.js`
- (optional) `src/components/PublicProviderProfile.js`
- New env vars on Heroku
