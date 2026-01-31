# SMS Gateway Migration - Quick Reference

## ✅ Migration Complete!

Your massage booking app has been successfully migrated from Twilio to Android SMS Gateway.

## What Was Changed

### 1. **Removed Twilio** ✅
- ❌ Deleted `twilio` package from dependencies
- ❌ Removed Twilio client initialization
- ✅ Ran `npm install` to clean up packages (removed 3 packages)

### 2. **Implemented Android SMS Gateway** ✅
- ✅ Created new HTTP-based SMS service using axios
- ✅ Implemented Basic Authentication
- ✅ Preserved SMS consent checking (TCPA compliance)
- ✅ Maintained same `sendSms()` function signature

### 3. **Updated Configuration** ✅
- ✅ Added new environment variables to `.env.example`
- ✅ Created comprehensive setup guide (`docs/SMS_GATEWAY_SETUP.md`)

## Next Steps - CONFIGURE YOUR ENVIRONMENT

### Step 1: Update Your `.env` File

Add these variables to your `.env` file with your actual Tailscale IP:

```bash
# Android SMS Gateway Configuration
SMS_GATEWAY_URL=http://100.x.y.z:8080
SMS_GATEWAY_USERNAME=admin
SMS_GATEWAY_PASSWORD=your_password_here

# Optional
# SMS_GATEWAY_DEVICE_ID=your_device_id
# SMS_GATEWAY_SIM_NUMBER=1
```

**IMPORTANT**: Replace `100.x.y.z` with your Android device's actual Tailscale IP address!

### Step 2: Configure Android Device

1. Install "SMS Gateway for Android" app (by capcom6)
2. Open the app → **Settings** tab
3. Select **Cloud server** mode
4. Set **Username** and **Password** (must match your `.env`)
5. Enable **Start on boot**
6. Start the service (should show **ONLINE**)

### Step 3: Test the Connection

Use curl to test:

```bash
# Replace with your actual values
curl -X POST http://100.x.y.z:8080/3rdparty/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'username:password' | base64)" \
  -d '{
    "phoneNumbers": ["+1234567890"],
    "textMessage": {
      "text": "Test message"
    }
  }'
```

### Step 4: Start Your Server

```bash
npm run server
# or
npm run dev
```

## Files Modified

1. **`server/services/smsService.js`** - Complete rewrite for Android Gateway
2. **`package.json`** - Removed Twilio dependency
3. **`.env.example`** - Added new SMS Gateway variables
4. **`docs/SMS_GATEWAY_SETUP.md`** - NEW comprehensive setup guide

## Files NOT Modified (No Code Changes Needed!)

- ✅ `server/services/reminderScheduler.js` - Uses same `sendSms()` interface
- ✅ `server/routes/provider-assignment-requests.js` - Uses same `sendSms()` interface  
- ✅ `server/routes/bookings.js` - Uses same `sendSms()` interface

## Key Features Preserved

- ✅ **SMS Consent Checking** - Only sends to users who consented
- ✅ **Error Logging** - Enhanced logging for debugging
- ✅ **Function Signature** - `sendSms(to, body, user)` unchanged
- ✅ **Return Format** - Compatible response structure

## Where Your Tailscale IP Goes

In your `.env` file:
```bash
SMS_GATEWAY_URL=http://100.64.123.45:8080
                      ↑↑↑↑↑↑↑↑↑↑↑↑↑
                      Your Tailscale IP here!
```

## Troubleshooting

### Can't connect to gateway?
- Ensure both devices are on same Tailscale network
- Verify the Android app shows **ONLINE** status
- Check the IP address is correct
- Ping the device: `ping 100.x.y.z`

### Getting 401 Unauthorized?
- Double-check username/password match between `.env` and Android app
- Verify credentials don't have special characters that need escaping

### Messages not sending?
- Check server logs: `logs/combined.log`
- Verify recipient has SMS consent in database
- Check Android app's **Messages** tab for errors

## Documentation

- **Full Setup Guide**: `docs/SMS_GATEWAY_SETUP.md`
- **SMS Consent Docs**: `docs/SMS_CONSENT_DOCUMENTATION.md`
- **Official Gateway Docs**: https://docs.sms-gate.app/

## Support

If you encounter issues:
1. Check `logs/combined.log` for detailed errors
2. Review Android app logs in the Messages tab
3. Verify Tailscale connection on both devices
4. Consult the full setup guide

---

**Migration Date**: January 30, 2026  
**Status**: ✅ Complete - Ready for Configuration
