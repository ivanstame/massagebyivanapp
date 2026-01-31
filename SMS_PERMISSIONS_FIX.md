# SMS Gateway - Fix SMS Permissions

## The Problem
The SMS Gateway app has messages queued but can't send them because it lacks SMS permissions.

## Solution: Grant SMS Permissions

### **Method 1: Through the App**

1. Open **SMS Gateway** app
2. When it prompts for SMS permission, tap **"Allow"** or **"Grant"**
3. If you don't see a prompt, go to the app's **Settings** tab
4. Look for **"Permissions"** or **"Grant SMS Permission"** button
5. Tap it and allow when prompted

---

### **Method 2: Through Android Settings** (RECOMMENDED)

**On Android 12+:**

1. Close the SMS Gateway app
2. Go to your phone's **Settings** app
3. Scroll to **Apps** or **Applications**
4. Find and tap **"SMS Gateway for Android"** (or just "SMS Gateway")
5. Tap **Permissions**
6. Find **SMS** in the list
7. Tap **SMS**
8. Select **"Allow"** or **"Allow all the time"**
9. Go back and check **"Phone"** permission - set to **"Allow"** as well
10. **Restart the SMS Gateway app**

**On Android 11 or earlier:**

1. Go to **Settings** → **Apps** → **SMS Gateway**
2. Tap **Permissions**
3. Enable:
   - ✅ **SMS** (required to send messages)
   - ✅ **Phone** (required to access SIM)
4. Restart the app

---

### **Method 3: Reinstall the App** (If permissions are stuck)

If the above doesn't work and the app won't prompt for permissions:

1. **Before uninstalling:** Note your credentials
   - Username: B4AXGY
   - Password: dghroa3slorecw
   - Device ID: aP2cOeWfsNZ0ybwFKBXf7

2. **Uninstall** SMS Gateway app completely

3. **Reinstall** from Google Play Store

4. **On first launch**, it WILL prompt for SMS permissions - **tap "Allow"**

5. **Reconfigure** with your credentials:
   - Settings → Cloud server mode
   - Enter username/password
   - Start the service

---

### **Method 4: Make SMS Gateway Default SMS App** (Alternative)

Some Android versions require apps to be the default SMS app:

1. Go to **Settings** → **Apps** → **Default apps**
2. Tap **SMS app** or **Messaging app**
3. Select **SMS Gateway for Android**
4. Confirm the change

⚠️ **Note**: This will make SMS Gateway your default messaging app. You can change it back after testing if needed.

---

## After Granting Permissions:

1. **Open SMS Gateway app**
2. Go to **Messages** tab
3. You should see your queued message (Message ID: S4iulLI21dbdPfqe4bj1q)
4. It should change from "Pending" to "Sent" within seconds
5. **Check your phone** for the received SMS!

---

## Verify Permissions Are Granted:

In the SMS Gateway app:
- The status should show **"ONLINE"** in green
- Messages tab should show messages moving from "Pending" → "Sent" → "Delivered"

---

## If Still Having Issues:

**Check these:**
- Phone has active SIM card with SMS capability
- Phone has cellular signal or Wi-Fi
- SIM card has SMS balance (if prepaid)
- Carrier hasn't blocked SMS sending from this number

**Common Issues:**
- Some carriers block apps from sending SMS (rare)
- SIM card needs to be activated for SMS
- Phone might need a restart after granting permissions
