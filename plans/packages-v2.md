# Packages — v2 Deferred Features

This document captures everything we intentionally pushed out of the v1
packages feature so none of it falls off the roadmap. See the project
conversation on 2026-04-24 for the v1 decisions; this file assumes v1
has shipped.

## v1 recap (for context)

Decisions locked for v1:

- **No expirations.** Packages never expire. Template schema has no
  `validForDays` field; purchases have no `expiresAt`. When we add
  expiration in v2, the field can be added non-breaking (null = no
  expiry).
- **Add-ons are paid separately.** Package redemption covers the base
  session only; add-ons at redemption time are charged per-booking via
  the provider's normal payment methods.
- **Stripe-only purchase flow.** No Venmo/cash for package buys.
- **Late-cancel consumes the credit.** Client cancels inside the
  provider's cancel window → credit returns. Client cancels late → credit
  is consumed. Provider can manually reinstate a consumed credit from the
  client's package detail view if they choose to be lenient.
- **Refunds are manual.** Provider refunds via Stripe dashboard; in
  Avayble they mark the package cancelled (which freezes its remaining
  credits) and any already-redeemed sessions stay booked.
- **Providers can comp packages.** Button on `/provider/clients/:id` that
  creates a fully-paid package for a client at $0 cost (for loyalty,
  makeup for a bad session, etc.).

---

## v2 — Deferred Features

Rough priority: items near the top are the most commonly-requested in
service-booking platforms and most likely to come up first once v1 is
live.

### 1. Expiration + renewal nudges

**What.** Re-introduce an optional `validForDays` on `PackageTemplate`
and a derived `expiresAt` on `PackagePurchase`. Surface the expiry in
`/my-packages` ("3 of 5 used · expires Sep 1"), gray out expired
packages, and send a reminder SMS/email 30 days before expiry.

**Why deferred.** Providers split roughly 50/50 on whether to use
expirations. Shipping v1 without it means we don't have to design the
"what happens to un-redeemed credits on expiry" edge cases yet (refund
them? keep the money? grace period?). Launching with no-expiry gives
every provider the freedom to add their own policy after we have real
usage.

**Design notes.**
- Schema: add `validForDays: Number` to `PackageTemplate` (nullable);
  snapshot as `expiresAt: Date` on `PackagePurchase` at buy time.
- UI: show expiration in the client's package card only when set.
- Reminder job runs in the existing reminder scheduler (adjacent to the
  24h/1h booking reminders).
- Provider setting: per-template opt-in to expiry reminders.

**Open questions.**
- Does expiry prevent redemption at *booking time* (nothing can use a
  credit after the expiry date) or at *appointment time* (a booking made
  before expiry can still take place afterward)? Assume the former.
- Grace period after expiry? Default: zero. Could be per-provider.

---

### 2. Gifting / buy-for-someone-else

**What.** A client (or a non-client walk-in on the public landing) can
purchase a package for another person. Recipient gets an email with a
code or link to claim the package; claiming creates an account (or
attaches to an existing account) that holds the credits.

**Why deferred.** Nice holiday/birthday feature, but it's
fundamentally a new purchase flow (not an extension of the existing one)
and needs its own claim/attach logic similar to the managed-client claim
flow we already built.

**Design notes.**
- Reuse the `ClaimToken` model or mint a similar `PackageGiftToken` that
  maps a purchased package to a recipient email, with a one-time redeem
  link.
- On claim, the token holder either logs in (existing user) or signs up
  as a client under the selling provider, then the package attaches.
- Sender sees the purchase in their own history; recipient sees the
  package in `/my-packages`.
- Gift notes / personal messages on the email.

**Open questions.**
- If the recipient already has a different provider assigned, what
  happens? (Likely: the gift forces the switch, with a confirmation step.
  Or the gift is rejected and refunded.)
- Anonymous vs. named sender display to recipient.

---

### 3. In-app refund flow

**What.** Provider clicks "Refund" on a package, Avayble calls Stripe's
refund API, marks the package cancelled, and logs the refund amount and
reason. No more "refund in Stripe dashboard, then mark it in Avayble"
two-step.

**Why deferred.** Two-step is fine for a small provider; we only want to
build the one-click path once we have real refund volume. Refunds also
have edge cases (partial refunds when some credits are used, tax
implications, chargebacks) that v1 doesn't need to solve.

**Design notes.**
- Partial refund = refund `(unusedCredits / totalCredits) * price` by
  default, overridable by provider.
- Reason field required (for the provider's records, not Stripe).
- Idempotent — if Stripe API fails after the package is marked
  cancelled, we can retry.

**Open questions.**
- Provider-initiated only, or should clients be able to request a
  refund in-app? Default: provider-initiated; clients contact provider.
- What happens to a booking that was paid via a package credit when that
  package is refunded? Probably: booking stays (provider is still going
  to show up), credit is retroactively "free" — but this gets weird.
  Alternative: refunds only possible on packages with zero redemptions.

---

### 4. Package-aware revenue & reporting

**What.** Provider's revenue and mileage report distinguishes
package-session bookings from direct-pay bookings. Package purchases show
as a revenue line item separate from the sessions they enable.

**Why deferred.** The existing `/api/bookings/revenue` endpoint doesn't
know about packages at all. We'd need to:
- Count package purchases as revenue at purchase time.
- *Not* double-count package-redeemed session bookings (since the money
  already came in via the package).
- Surface "credits outstanding" as a liability (provider owes clients N
  unredeemed sessions worth $X).

**Design notes.**
- New endpoint: `GET /api/bookings/package-revenue` returning
  `{ purchased, redeemed, outstanding }` totals.
- `/provider/mileage` already queries bookings directly — mileage on
  package sessions is still deductible the same as any other client
  visit, so mileage doesn't need special handling.
- Revenue card on the provider dashboard gets a "Package credits
  outstanding: $X" line.

**Open questions.**
- Cash basis vs. accrual: do we count the package revenue at purchase
  time (cash basis, matches Stripe payouts) or spread it across sessions
  (accrual, "unearned revenue" until redeemed)? Most small providers
  think cash basis. We default there; accrual mode is a future toggle.
- Comp packages: should they show $0 revenue with N sessions promised,
  appearing as a pure liability? Yes.

---

### 5. Multi-session (group) booking consuming multiple credits

**What.** The existing multi-session booking wizard (`SessionConfigWizard`)
creates N bookings in one go for a group event. If the client has a
package with N-or-more credits, they should be able to apply multiple
credits in a single booking flow.

**Why deferred.** v1 handles the 1-credit-per-booking case. Multi-session
is a small segment of bookings (mostly events), and the UX gets tricky
(mix-and-match — 2 credits from one package + direct pay for the third
session, for instance). Worth punting until v1 use reveals demand.

**Design notes.**
- Booking payload extends to `packageRedemptions: [{ packagePurchaseId }]`
  (plural), one per session being booked via package.
- Provider-side validation: all redeemed credits must come from packages
  owned by the booking client, for sessions matching the duration.

---

### 6. Variable-duration and "any service" packages

**What.** A package can cover multiple durations (e.g., "5 sessions, any
duration — use credits toward 60-min or 90-min") or any service from the
provider. Pricing could be value-based (`$500 of services` rather than
`5 sessions`).

**Why deferred.** Most packages sold in practice are fixed-duration
(e.g., "5-pack of 60-min massages"). Variable-duration introduces
bookkeeping (what's 1 credit worth if durations vary?) and pricing
questions. v1's fixed-duration model covers >80% of real use.

**Design notes.**
- Add `durationOptions: [Number]` to template (array of allowed
  durations). Empty array or null = any duration from the provider's
  basePricing.
- Credits stay session-based, not dollar-based, for MVP of this feature.
- Later: dollar-value packages where each booking consumes value equal
  to the session's list price.

---

### 7. Subscription / auto-renewing packages

**What.** Monthly-renewing packages (e.g., "4 massages per month,
auto-renews"). Stripe Subscriptions under the hood, package credits
refill monthly.

**Why deferred.** Different billing primitive (Stripe Subscriptions vs.
PaymentIntents), different failure modes (failed renewal, dunning,
cancellation windows), and most of v1's provider base sells
pay-per-package rather than subscriptions. When a provider asks for it
specifically, it's a legit v2.

**Design notes.**
- Use Stripe Subscriptions with a metered billing pattern, or recurring
  invoices with a fixed plan.
- New `PackageSubscription` model linking to a `PackageTemplate` and
  tracking the next renewal date + payment failure state.
- Credits roll over or reset? Provider choice per template.

---

### 8. Package transferability between providers

**What.** A client with an active package under Provider A can transfer
remaining credits to Provider B (if B accepts the transfer and possibly
adjusts pricing).

**Why deferred.** Rarely requested, painful to implement well (valuation
mismatch, chargebacks, tax), and most providers would refuse to honor
another provider's package. Defer until there's clear demand.

---

### 9. Analytics / redemption insight for providers

**What.** Provider dashboard surfaces:
- Average days between purchase and first redemption.
- Average redemption pace (sessions per month).
- Unused-credit liability total.
- Packages at risk of never being redeemed (older than N months with no
  recent booking).

**Why deferred.** Needs real data to be useful; premature to build
until providers have meaningful package volume.

---

### 10. Booking a package session directly from `/my-packages`

**What.** Click "Use a credit" on a package card → lands in the booking
form with the provider, duration, and payment method (package) already
locked in. Skips the shopping-around step.

**Why deferred.** Minor UX polish; v1 reaches this same outcome through
the normal booking flow.

---

## Things v1 should *not* paint us into

Things to keep open-ended so v2 additions stay easy:

- **Don't** hard-code "1 credit per booking" in the booking schema —
  use a `packageRedemption` sub-object that can be extended to multi-
  credit later.
- **Don't** store expiration-dependent values as derived fields on
  purchases — compute them at read time or leave nullable so we can add
  them later without a migration.
- **Don't** write the revenue query to assume all booking money flows
  per-booking. Keep the purchase record as the primary revenue source
  for anything sold that way; v2's reporting can sum across both.
- **Don't** couple the provider's package UI to their existing pricing
  table. Packages reference a duration but aren't strictly required to
  match one of `basePricing.duration` values — we'll want variable-
  duration packages eventually.

---

## Review cadence

Re-read this doc:

- Before starting any v2 work, to confirm the decision is still
  consistent with the rest of the product.
- Every ~6 months even without active v2 work, to prune items that
  stopped mattering or add new ones that emerged from real usage.
