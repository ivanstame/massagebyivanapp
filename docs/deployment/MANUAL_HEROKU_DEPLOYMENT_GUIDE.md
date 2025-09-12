# Manual Heroku Deployment Guide

Since the Heroku CLI installation is encountering compatibility issues, here's how to deploy your massage app manually using the Heroku Dashboard.

## Step 1: Create Heroku Account
1. Go to [Heroku](https://heroku.com) and sign up for a free account
2. Verify your email address

## Step 2: Create Heroku App
1. Log in to your Heroku Dashboard
2. Click "New" → "Create new app"
3. Choose an app name (e.g., "massage-by-ivan-app")
4. Select a region (US or Europe)
5. Click "Create app"

## Step 3: Set Environment Variables
In your Heroku Dashboard, go to your app's "Settings" tab and add these Config Vars:

### Required Variables:
```
MONGODB_URI: your-mongodb-atlas-connection-string
SESSION_SECRET: a-very-strong-random-secret-key
GOOGLE_MAPS_API_KEY: your-google-maps-api-key
PROVIDER_SIGNUP_PASSWORD: B@ckstreetsback0222
NODE_ENV: production
```

### Optional Variables (if needed):
```
REACT_APP_API_URL: https://your-app-name.herokuapp.com
EMAIL_HOST: smtp.gmail.com
EMAIL_PORT: 587
EMAIL_USER: your-email@gmail.com
EMAIL_PASS: your-app-password
```

## Step 4: Connect GitHub Repository
1. In your Heroku app, go to the "Deploy" tab
2. Under "Deployment method", select "GitHub"
3. Connect your GitHub account
4. Search for and connect your repository
5. Enable "Wait for CI to pass before deploy" if using GitHub Actions
6. Choose your branch (usually "main" or "master")

## Step 5: Manual Deployment
1. In the "Deploy" tab, scroll down to "Manual deploy"
2. Select your branch
3. Click "Deploy Branch"

## Step 6: Monitor Deployment
1. Watch the build logs for any errors
2. If deployment succeeds, click "View" to open your app

## Step 7: Test Your Application
1. Open your app URL (https://your-app-name.herokuapp.com)
2. Test provider sign-up with the password "B@ckstreetsback0222"
3. Test client registration flow
4. Verify all functionality works correctly

## Alternative: Deploy via Git
If you prefer to use Git directly (requires Heroku CLI alternative setup):

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit for Heroku deployment"

# Add Heroku remote (get this from your Heroku app settings)
git remote add heroku https://git.heroku.com/your-app-name.git

# Deploy
git push heroku main
```

## Troubleshooting
- If build fails, check the logs in Heroku Dashboard → Activity
- Ensure all environment variables are set correctly
- Verify MongoDB Atlas connection is working
- Check that Google Maps API key is valid

## Post-Deployment
1. Set up custom domain (optional) in Heroku Settings
2. Configure SSL (automatically provided by Heroku)
3. Set up monitoring and alerts
4. Create database backups strategy

Your app is now ready for alpha testing with the provider security measure in place!