# Avayble Roadmap & Decisions

This document tracks deferred features (per-feature v2 lists), explicit
decisions to *not* build something, and operational follow-ups. The
filename is historical (started as packages-v2) — the contents are the
project's running TODO and rationale log.

---

## Design principles

These guard rails apply to every feature decision recorded in this doc.
When considering whether to build something, especially when industry
peers offer it, check the proposal against these first.

### Facilitate and record-keep, don't replace

> **Avayble facilitates and records real-world interactions with reduced
> friction. It does not replace those interactions with app-originated
> automation.**

Concretely: features that *originate* a request, commitment, or workload
that didn't exist in the underlying relationship are off the table, even
when industry-standard apps offer them. The test is whether the app is
*recording a decision the parties have already made in real life* (build
it) or *generating a new decision request the app itself invented* (don't
build it).

This is also why the existing app already feels different from competitors
— each surface today is a record of something that already happened or
was already agreed:

- **Client books an appointment** within a window the provider already
  set up. The app records the choice; it doesn't ask the provider for
  re-approval.
- **Managed client profiles** are records the provider was already
  keeping in a notebook or head. The app gives them durability.
- **Standing appointments** are agreements like "every Tuesday at 10"
  that already exist between Ivan and Mabel. The app records the rule
  and stops Ivan from re-entering it weekly.
- **Claim flow** turns a managed profile into an account — explicit
  hand-off of a record from custodianship to ownership, again recording
  a decision the two parties made out of band.

Features explicitly considered and rejected on this basis:

- **Client-initiated recurring appointments** (even with provider-approval
  backstop). Industry default is "off" because the request flow generates
  app-originated workload — provider has to triage in-app requests for
  recurrences they didn't ask for. The actual real-world interaction
  ("Mabel asks Ivan, Ivan agrees, Ivan adds it") is faster than any
  in-app analog.

### Provider's record-keeping is the point of the app

Sub-principle: when in doubt, optimize for the provider's bookkeeping
disappearing — not for client autonomy. Avayble exists because real
mobile providers were stitching their day together from a calendar app,
Maps, an SMS thread, Venmo, and a paper mileage log. Removing that
friction is the work. Anything that adds an inbox to triage instead of
removing one is moving the wrong direction.

---

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

# Standing Appointments — v2 Deferred Features

v1 (shipped 2026-04-25): provider-only, weekly + intervals (1/2/4),
single day-of-week, three end conditions (open / end-date / count),
hybrid materialization with rolling 90-day window + lazy-extend on
availability fetch, three-scope cancel ("this one / following / all"),
repeat icon on day view, full per-occurrence override (each occurrence
is a normal Booking).

Items below are intentionally out of v1.

## v2 — Deferred Features

### 1. Monthly patterns

**What.** "First Monday of each month," "15th of each month," "Last
Friday." Real demand — esthetician monthly facials, monthly maintenance
detailing, etc.

**Why deferred.** v1's weekly-only covers ~85% of standing appointments
in the trades the app supports. Monthly adds nontrivial UX (ordinal
selector — "first / second / third / last") and edge cases (what's the
"5th Monday" when there isn't one? skip the month? roll over? — Google
Calendar gets this wrong about half the time, design carefully).

**Design notes.**
- Schema: extend `intervalWeeks` to a discriminated `frequency:
  'weekly' | 'monthly'` with `monthlyPattern: { kind: 'ordinal-day' |
  'day-of-month', ... }`.
- Generator helper changes (currently `current.plus({ weeks: ... })`).
- Default for "5th X when month has only 4" should be "skip" with a
  surfaced warning, not "fall through to next month."

---

### 2. Multi-day series

**What.** "Mabel comes Tuesdays AND Thursdays." Currently you'd create
two separate series, which works but the two are unconnected — cancel
one, the other keeps going.

**Why deferred.** Conceptually clean (just allow `daysOfWeek: [Number]`
instead of single `dayOfWeek`), but the cancel-scope semantics get
weird: does "cancel following" mean every Tuesday after this one, or
every Tue+Thu after this one? "All" gets ambiguous too.

**Design notes.**
- Decision needed before building: Multi-day series = one row with
  `daysOfWeek: [2, 4]`, or a "series-of-series" parent grouping two
  weekly rows? The single-row model is denser; the parent-grouping
  model keeps cancel semantics simple.
- Whichever way, the materialization helper needs to fan out across
  days within a single iteration.

---

### 3. Pause / resume series

**What.** Provider goes on vacation Dec 20 – Jan 5; their standing
appointments should skip those weeks but resume after. Or a client
asks to pause for two months.

**Why deferred.** v1's `status: 'active' | 'cancelled'` is sufficient;
adding `paused` requires schema + UI for date-range exclusion. Also
need to decide whether already-materialized occurrences in the paused
window get cancelled (yes, almost certainly) and what happens to the
rolling window (don't extend during pause).

**Design notes.**
- Status enum gains `paused`.
- Add `pausedRanges: [{ start, end, reason? }]` to the series so
  multiple pauses can stack (vacations, holidays).
- Materialization respects paused ranges — skip dates falling in any
  range, plus surface them as "skipped: paused" in the create response.
- Resume = clear the active pause range (or set its end to today).

---

### 4. Holiday / skip-date support

**What.** First-class skip-date list — "skip Dec 24 – Jan 2 every year"
or one-off skips like "skip July 4 this year." Today the provider has
to manually cancel those occurrences post-materialization.

**Why deferred.** Adjacent to pause/resume but distinct: pauses are
one-off ranges, holidays are recurring. Both are quality-of-life rather
than core. v1 cancel-each-individually works.

**Design notes.**
- Could attach to the User (provider-wide holiday list applied to all
  their series), per-series, or a hybrid. Provider-wide is more
  ergonomic for the common case ("I close for Christmas").
- Materialization filters dates against the holiday list.
- A small UI lives in `/provider/settings` for the recurring list,
  with the per-series option as an override.

---

### 5. Group standing appointments

**What.** "Five clients on Tuesdays at 6pm — yoga, training class,
group massage." One series → N parallel bookings per occurrence, one
per client.

**Why deferred.** Genuinely different domain — tied closely to a
class-booking model that doesn't exist anywhere else in the app. Worth
its own design pass.

---

### 6. Conflict surfacing when one-off booking breaks a future series occurrence

**What.** Provider books a one-off in another part of town that makes
travel to Mabel's standing 10am next Tuesday infeasible (or simply
overlaps in time). Today, the new booking succeeds (since
materialization already happened) and Mabel's appointment quietly
remains scheduled. The provider only finds out when they realize they
double-booked.

**Why deferred.** Requires the booking-create flow to peek at all
*future* same-day bookings (already does for time conflict — the
overlap check), AND walk forward through all this provider's
materialized series occurrences for travel-time feasibility (expensive
unless capped). v1 trusts the provider to notice.

**Design notes.**
- At booking-create time, query `Booking.find({ provider, localDate,
  series: { $ne: null }, status: { $ne: 'cancelled' } })` for the
  same date, run the boundary travel-time check, and either:
    - reject the new booking, OR
    - prompt: "This conflicts with Mabel's standing 10am. Skip Mabel
      that week?" with a one-click skip action.
- Skip = soft-cancel that single occurrence. Rest of series intact.

---

### 7. Edit series rule (cadence/time) propagating to future occurrences

**What.** Provider wants to move Mabel from Tuesdays to Wednesdays
going forward. Today they have to cancel the series and recreate it.

**Why deferred.** The "this and following" semantics for *edits* are
strictly harder than for cancels — depends on whether the new schedule
conflicts with anything, whether to preserve already-modified
individual occurrences, etc. v1 cancel + recreate works, just clunky.

**Design notes.**
- Endpoint: `PATCH /api/recurring-series/:id` with `effectiveFrom: 'this'
  | 'all'` and the field deltas.
- "Effective from this date" = un-modified future occurrences get
  re-materialized with the new rule; already-modified occurrences
  stay (with a surfaced warning to provider).
- Old occurrences keep the original rule snapshot.

---

### 8. Series-level reschedule of a single occurrence

**What.** Today, cancellation has the three-scope picker (this/
following/all) but reschedule does not — it acts as if it's a single
booking, leaving the series rule alone. That's actually correct for
"this one only" but there's no path for "move every Tuesday by 30 min
going forward."

**Why deferred.** Same family of problems as #8 (rule propagation).
Single-occurrence reschedule already works correctly; series-level
reschedule is the v2 feature.

---

### 9. Series analytics for the provider

**What.** Provider dashboard surfaces:
- Active standing relationships count.
- Average series longevity.
- Upcoming standing-appointment load (count per week).
- Standing-revenue forecast (sum of pricing × occurrences in a window).

**Why deferred.** Needs real data to be meaningful; build after we
see how providers actually use v1.

---

## What standing-appointments v1 should *not* paint us into

Things v1 deliberately keeps open-ended for v2 to slot into easily:

- **Don't** add code anywhere that assumes "one series = one weekly
  cadence on one day." The model already has `dayOfWeek` as a single
  number rather than an array — when we add multi-day, we'll switch
  to `daysOfWeek: [Number]` with backfill (existing rows become
  `[dayOfWeek]`). Materialization helper should be the only place
  that needs to change.
- **Don't** treat `lastMaterializedThrough` as the source of truth for
  "what occurrences exist." Always read from `Booking` docs — which
  is what the cancel-scope flow does. This keeps pause/resume + edit-
  rule features from accidentally breaking the materialization
  watermark.
- **Don't** hard-code 90 days as the window everywhere. It's
  `WINDOW_DAYS` in `routes/recurring-series.js`; if we ever want
  per-series window control (e.g. "only materialize 30 days for an
  occurrenceLimit series"), it's one constant to lift.
- **Don't** implement "edit single occurrence" by special-casing the
  series — each occurrence is already an independent Booking, so
  individual edits Just Work. v2's challenge is only **rule-level**
  edits (#8 / #9), not occurrence-level.

---

## Operational follow-ups (non-package)

Things outside the packages roadmap that are tracked here so they don't
get lost. Move into their own file once this section grows beyond ~5
items.

### Rotate the MongoDB Atlas password

**What.** The `massage-app-user` Atlas password (currently embedded in
the Heroku `MONGODB_URI` env var) needs to be rotated. The old value
appeared in plaintext in Heroku log history from v90 through v95
because:

1. `server.js` used to log the full URI on every boot.
2. Node's `DEP0170` deprecation warning printed the URI to stderr each
   time the MongoDB driver parsed the SRV connection string.

Both leaks were stopped in v94/v96 (log line removed, deprecation
suppressed via `NODE_OPTIONS=--no-deprecation`), but **the password
that's still in use is also still in the existing log history.**
Anyone who runs `heroku logs --tail` on logs older than v96 will see
it.

**Why deferred.** The rotation requires manual action in MongoDB Atlas
(Database Access → edit `massage-app-user`) which only the account
owner can do. Once the new password is in hand, updating
`MONGODB_URI` on Heroku is a one-liner.

**Steps when rotating.**

1. In Atlas: Database Access → edit `massage-app-user` → Edit Password
   → generate (or set) a new password → Update User.
2. Copy the new full SRV connection string from Atlas → Database →
   Connect → Drivers (Node.js).
3. Run `heroku config:set MONGODB_URI='<new-uri>' -a massagebyivan`.
   That triggers a dyno restart automatically.
4. Verify by tailing logs for `Connected to MongoDB Atlas` after the
   restart.

**Open follow-up.** Old log history still contains the leaked old
password. After rotation it's a dead credential, but for full hygiene
consider purging Heroku log drains or accepting that the leak window
existed and moving on.

### Optional: rotate PROVIDER_SIGNUP_PASSWORD

Same exposure window — log history from before v94 contains the typed
and expected values for every provider signup attempt during that
period. Lower urgency than the DB password (it's only a gate on
provider signup, not actual data access), but rotate if any untrusted
party had log access during that window.

---

## Review cadence

Re-read this doc:

- Before starting any v2 work, to confirm the decision is still
  consistent with the rest of the product.
- Every ~6 months even without active v2 work, to prune items that
  stopped mattering or add new ones that emerged from real usage.
