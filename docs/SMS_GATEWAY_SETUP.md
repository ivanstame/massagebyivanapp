# Android SMS Gateway Setup Guide

## Overview
This application now uses **Android SMS Gateway** (by capcom6) instead of Twilio for sending SMS notifications. The Android device connects to the server via Tailscale VPN for secure, private communication.

## Migration Summary
- ✅ **Removed**: Twilio SDK dependency
- ✅ **Added**: Android SMS Gateway integration using axios HTTP requests
- ✅ **Preserved**: SMS consent checking logic (TCPA compliance)
- ✅ **Maintained**: Same API interface (`sendSms` function signature unchanged)

## Prerequisites

### 1. Android Device Setup
- Android device running Android 5.0 or higher
- "SMS Gateway for Android" app installed (by capcom6)
- Active SIM card with SMS capability
- Device connected to the same Tailscale network as your server

### 2. Tailscale VPN Setup
- Both the Android device and your server must be on the same Tailscale network
- Note the Android device's Tailscale IP address (format: `100.x.y.z`)

## Configuration Steps

### Step 1: Configure Android SMS Gateway App

1. Open the SMS Gateway app on your Android device
2. Navigate to **Settings** tab
3. Select **Cloud server** mode
4. Configure credentials:
   - **Username**: Choose a username (e.g., `admin`)
   - **Password**: Set a strong password
   - **Device ID**: Note this if you want to specify which device to use (optional)
5. Enable **Start on boot** (recommended)
6. Start the service - status should show **ONLINE**

### Step 2: Find Your Tailscale IP

On your Android device:
1. Open Tailscale app
2. Note your device's IP address (e.g., `100.64.123.45`)
3. This will be your `SMS_GATEWAY_URL` host

### Step 3: Update Environment Variables

Edit your `.env` file and add the following variables:

```bash
# Android SMS Gateway Configuration
SMS_GATEWAY_URL=http://100.64.123.45:8080
SMS_GATEWAY_USERNAME=admin
SMS_GATEWAY_PASSWORD=your_strong_password_here

# Optional: Specify device ID (if you have multiple devices)
# SMS_GATEWAY_DEVICE_ID=your_device_id

# Optional: Specify which SIM to use (1, 2, or 3)
# SMS_GATEWAY_SIM_NUMBER=1
```

**Important**: Replace the IP address with your actual Tailscale IP!

### Step 4: Install Dependencies

Since we removed Twilio, run:

```bash
npm install
```

This will update your `node_modules` to remove the Twilio package.

### Step 5: Test the Connection

You can test the SMS Gateway connection using curl:

```bash
curl -X POST http://100.64.123.45:8080/3rdparty/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'username:password' | base64)" \
  -d '{
    "phoneNumbers": ["+15551234567"],
    "textMessage": {
      "text": "Test message from API"
    }
  }'
```

Replace:
- `100.64.123.45:8080` with your actual gateway URL
- `username:password` with your actual credentials
- `+15551234567` with a test phone number

## API Endpoint Details

### SMS Gateway API Endpoint
```
POST http://<TAILSCALE_IP>:8080/3rdparty/v1/messages
```

### Request Format
```json
{
  "phoneNumbers": ["+1234567890"],
  "textMessage": {
    "text": "Your message content here"
  },
  "deviceId": "optional_device_id",
  "simNumber": 1
}
```

### Authentication
- Type: Basic Auth
- Header: `Authorization: Basic <base64(username:password)>`

### Response Format
```json
{
  "id": "message_id",
  "state": "Pending",
  "recipients": [
    {
      "phoneNumber": "+1234567890",
      "state": "Pending"
    }
  ]
}
```

## Server Implementation Details

### Modified Files

1. **`server/services/smsService.js`**
   - Removed Twilio client initialization
   - Added axios-based HTTP POST implementation
   - Preserved SMS consent checking logic
   - Added enhanced error logging
   - Same function signature for backward compatibility

2. **`package.json`**
   - Removed: `"twilio": "^5.11.1"`
   - Note: `axios` is already a dependency

3. **`.env.example`**
   - Added SMS Gateway configuration variables
   - Removed Twilio-related variables

### SMS Consent Compliance

The implementation maintains TCPA compliance by:
- Checking user's `smsConsent` flag before sending
- Looking up user by phone number if not provided
- Logging skipped messages for audit trail
- Returning `null` when consent is not given

### Usage in Code

No changes needed in existing code! The `sendSms` function maintains the same interface:

```javascript
const smsService = require('../services/smsService');

// Usage remains the same
await smsService.sendSms(phoneNumber, messageBody, userObject);
```

## Troubleshooting

### Issue: "Failed to reach Android SMS Gateway"
**Solutions:**
- Verify both devices are on the same Tailscale network
- Check the Tailscale IP address is correct
- Ensure port 8080 is accessible
- Verify the Android SMS Gateway app is running and shows ONLINE

### Issue: "401 Unauthorized"
**Solutions:**
- Double-check username and password in `.env`
- Ensure credentials match what's configured in the Android app
- Verify the Basic Auth header is being generated correctly

### Issue: "Gateway returns error"
**Solutions:**
- Check Android device has cellular signal
- Verify SIM card is active and has SMS capability
- Check Android app logs for detailed error messages
- Ensure phone number is in E.164 format (e.g., `+1234567890`)

### Issue: Messages not sending
**Solutions:**
- Check that the recipient has given SMS consent in your database
- Review server logs for consent-related skips
- Verify the Android device has sufficient SMS balance
- Check carrier rate limits aren't being hit

## Monitoring and Logs

### Server Logs
The service logs important events:
- SMS sent successfully: `SMS sent to <number> via Android Gateway: <id>`
- Consent skipped: `Skipping SMS to <number>: user has not consented`
- Gateway errors: `Android SMS Gateway error for <number>: <details>`
- Connection errors: `Failed to reach Android SMS Gateway for <number>`

### Android App Logs
Check the SMS Gateway app's Messages tab to see:
- Pending messages
- Sent confirmations
- Delivery reports
- Error messages

## Production Deployment

### Heroku Configuration

Set environment variables in Heroku:

```bash
heroku config:set SMS_GATEWAY_URL=http://100.x.y.z:8080
heroku config:set SMS_GATEWAY_USERNAME=your_username
heroku config:set SMS_GATEWAY_PASSWORD=your_password
```

### Security Considerations

1. **VPN Security**: Tailscale provides end-to-end encryption
2. **Authentication**: Always use strong passwords for gateway credentials
3. **IP Restriction**: Consider restricting the gateway to only accept connections from your server's Tailscale IP
4. **HTTPS**: For production, consider setting up HTTPS on the Android device (requires certificate setup)

## Benefits of This Approach

✅ **Cost Savings**: No monthly Twilio fees or per-SMS charges  
✅ **Privacy**: Messages never leave your private network  
✅ **Control**: Full control over message delivery  
✅ **Flexibility**: Easy to add multiple devices for redundancy  
✅ **Compliance**: Maintains SMS consent checking  
✅ **Security**: Private Tailscale VPN connection  

## Support and Resources

- **SMS Gateway App Documentation**: https://docs.sms-gate.app/
- **Tailscale Documentation**: https://tailscale.com/kb/
- **Application Logs**: Check `logs/combined.log` and `logs/error.log`

---

**Last Updated**: January 30, 2026  
**Version**: 2.0
