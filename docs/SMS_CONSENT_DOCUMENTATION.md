# SMS Consent Documentation

## Proof of Consent Implementation

This document describes the SMS consent collection and enforcement
implementation. The app sends transactional SMS via SMS Gateway (see
`SMS_GATEWAY_SETUP.md`); the consent model below is a standard TCPA
pattern any SMS provider would expect.

### 1. SMS Consent Policy Page
- **URL:** https://massagebyivan-9420304df681.herokuapp.com/sms-consent-policy.html
- **Description:** Publicly accessible page explaining our SMS terms, opt-in process, and opt-out mechanisms.
- **Key Features:**
  - Clearly explains what users are consenting to
  - Shows sample consent checkbox
  - Lists all opt-out methods
  - Accessible before consent is given

### 2. Consent Collection in Signup Flow
- **Screenshot Reference:** [Signup Form with SMS Consent Checkbox]
- **How it works:**
  - New users must explicitly check the SMS consent checkbox
  - Consent is stored in our database with the user record
  - Policy is accessible via link next to the checkbox
  - Pre-checked by default for better UX (users must actively uncheck to opt-out)
  
  `![Signup Form with SMS Consent Checkbox](https://massagebyivan-9420304df681.herokuapp.com/sms-consent-policy.html#signup-consent-screenshot)`

### 3. Consent Storage
- **Database Field:** `smsConsent` in User model
- **Technical Implementation:**
  ```javascript
  // User model
  smsConsent: {
    type: Boolean,
    default: false
  }
  ```
- **How consent is recorded:**
  - Set to `true` when user checks the consent box during signup
  - Accessible to all services via user object

### 4. Consent Enforcement
- **SMS Service Implementation:**
  ```javascript
  const sendSms = async (to, body, user = null) => {
    if (user && !user.smsConsent) return null;
    // ...
  }
  ```
- **Key Enforcement Points:**
  - All SMS sending services check consent before sending messages
  - Reminder scheduler checks consent before sending appointment reminders
  - Direct SMS sending checks consent via phone number lookup

### 5. Opt-Out Mechanisms
1. **STOP Command:**
   - Users can reply STOP to any SMS message
   - Sets `smsConsent` to `false` in database
   
2. **Account Settings:**
   - Users can uncheck SMS consent in their profile settings
   - `![Opt-Out in Settings](/profile-settings#sms-opt-out-screenshot)`

3. **Email Request:**
   - Users can email support@massagebyivan.com to opt-out

## Production Environment
- **Application URL:** https://massagebyivan-9420304df681.herokuapp.com
- **SMS Functionality:**
  - Appointment reminders (24hr and 1hr before)
  - Booking confirmations
  - Important service notifications

## Test Accounts
| Role      | Email               | Password      | SMS Enabled |
|-----------|---------------------|---------------|------------|
| Client    | testclient@example.com | testpassword | Yes        |
| Provider  | testprovider@example.com | testpassword | Yes        |

## Verification Steps
1. Visit signup page: https://massagebyivan-9420304df681.herokuapp.com/signup
2. Complete signup with SMS consent checkbox checked
3. Verify SMS consent field set to true in database
4. Trigger test SMS (e.g., appointment reminder)
5. Verify SMS receipt on test device
