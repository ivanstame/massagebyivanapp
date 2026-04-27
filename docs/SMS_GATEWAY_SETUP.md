# SMS Gateway Setup

The app sends transactional SMS (booking confirmations, 24h/1h reminders,
cancellations) through [SMS Gateway for Android](https://sms-gate.app)
running in **Cloud Server mode**. An Android device with a SIM card is
the actual sender; the cloud service brokers HTTP requests from our
backend to the device.

(An earlier setup ran the gateway over a Tailscale VPN with the device's
LAN IP — that's no longer the case. The code in `server/services/smsService.js`
talks to `https://api.sms-gate.app/3rdparty/v1/messages` directly.)

## What you need

- An Android phone (5.0+) with an active SIM
- The "SMS Gateway" app installed (capcom6) and configured for **Cloud
  Server** mode
- An account on https://sms-gate.app — gives you the API username/password
  to authenticate

## Configuration

In the SMS Gateway app on the phone:

1. Open Settings → Server mode → **Cloud server**
2. Sign in with your sms-gate.app account
3. Note the **Device ID** the app shows (used to route messages to this
   specific device when your account has more than one)
4. Enable "Start on boot" so it survives reboots

In your environment (`.env` for local, Heroku config for prod):

```bash
SMS_GATEWAY_USERNAME=your-cloud-account-username
SMS_GATEWAY_PASSWORD=your-cloud-account-password
SMS_GATEWAY_DEVICE_ID=device-id-from-app   # required if you have >1 device
SMS_GATEWAY_SIM_NUMBER=1                   # optional, defaults to SIM 1
```

That's it — no VPN, no inbound network access to the phone, no
self-hosted gateway URL.

## How it's used in the app

`server/services/smsService.js` exports `sendSms(to, body, user)`. The
function:

1. Checks SMS consent (`user.smsConsent`) — skips silently if explicitly
   `false`. Undefined/null is grandfathered consent for legacy users.
2. POSTs to `https://api.sms-gate.app/3rdparty/v1/messages` with HTTP
   Basic auth (username:password from env).
3. Returns a `{ id, status, gatewayResponse }` object on success, throws
   on failure. Callers wrap it in try/catch so SMS failure never blocks
   a booking save.

Callers:
- `server/routes/bookings.js` — confirmation + cancellation SMS on
  POST/DELETE
- `server/services/reminderScheduler.js` — 24h/1h reminders (hourly
  scan; see comment in that file for why the time-window check is wider
  than the cron interval)
- `server/routes/provider-assignment-requests.js` — notifies provider
  when a client requests assignment

## Consent

See `docs/SMS_CONSENT_DOCUMENTATION.md` for the consent collection +
opt-out implementation. Consent enforcement happens in `smsService.sendSms`
itself, so every SMS path in the app gets the check for free.

## Troubleshooting

**"Failed to reach SMS Gateway Cloud"** — usually a credentials issue
or rate limit. Check `SMS_GATEWAY_USERNAME` / `SMS_GATEWAY_PASSWORD` and
the gateway app's status in the cloud dashboard.

**Message goes "Pending" and never sends** — the Android device is
offline (no cell signal, app force-stopped, battery optimization killed
it). Check the device, and verify "Start on boot" is on.

**401 from the gateway** — the cloud account's credentials don't match
the env vars. Reset and re-set both.

**Messages send but reminders don't** — check `logs/combined.log` for
`Skipping SMS to <number>: user has explicitly opted out`. If consent
is missing, the SMS is suppressed before the gateway call.
