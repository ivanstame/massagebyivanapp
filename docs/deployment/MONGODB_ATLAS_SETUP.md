# MongoDB Atlas Setup Guide

## Step 1: Create MongoDB Atlas Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Click "Sign Up" and create an account
3. Verify your email address

## Step 2: Create a Cluster

1. Once logged in, click "Create" to create a new cluster
2. Choose the free tier (M0 Sandbox) - it's perfect for your alpha test
3. Select a cloud provider (AWS is fine) and choose a region close to you
4. Click "Create Cluster" - this may take a few minutes

## Step 3: Set Up Database Access

1. Go to "Database Access" in the left sidebar
2. Click "Add New Database User"
3. Set a username (e.g., `massage-app-user`)
4. Set a strong password (save this for later)
5. Set database user privileges to "Read and write to any database"
6. Click "Add User"

## Step 4: Configure Network Access

1. Go to "Network Access" in the left sidebar
2. Click "Add IP Address"
3. For alpha testing, you can allow access from anywhere:
   - Click "Allow Access from Anywhere" (0.0.0.0/0)
   - Alternatively, add specific IP addresses if needed
4. Click "Confirm"

## Step 5: Get Connection String

1. Go back to "Clusters" and click "Connect" on your cluster
2. Choose "Connect your application"
3. Select "Node.js" and version 2.2.12 or later
4. Copy the connection string - it will look like:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/massage_booking_app
   ```

## Step 6: Update Environment Variables

Replace the placeholders in your environment variables:

1. Replace `username` with your database username
2. Replace `password` with your database user password
3. Replace `cluster.mongodb.net` with your actual cluster URL
4. Keep `massage_booking_app` as the database name

Your final `MONGODB_URI` should look like:
```
mongodb+srv://massage-app-user:your-password@cluster0.abc123.mongodb.net/massage_booking_app
```

## Step 7: Test Connection Locally

1. Create a `.env` file from the `.env.example` template
2. Set the `MONGODB_URI` with your Atlas connection string
3. Set `NODE_ENV=development` for testing
4. Start your server: `npm run server`
5. Check if it connects successfully to MongoDB Atlas

## Step 8: Set Up for Heroku

When deploying to Heroku, you'll set the environment variables:

```bash
heroku config:set MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/massage_booking_app
```

## Troubleshooting

### Common Issues:

1. **Connection Timeout**: Make sure your IP is allowed in Network Access
2. **Authentication Failed**: Double-check username and password
3. **Cluster Not Ready**: Wait for the cluster to finish provisioning

### Security Recommendations:

1. For production, restrict IP access to only Heroku's IP ranges
2. Use a more restrictive database user with only necessary permissions
3. Consider using MongoDB Atlas's built-in security features

## Alternative: Use Heroku MongoDB Add-on

If you prefer, you can also use Heroku's MongoDB add-on:

```bash
heroku addons:create mongolab:sandbox
```

This will automatically set the `MONGODB_URI` environment variable in Heroku.

## Next Steps

1. Test the connection locally with your Atlas database
2. Deploy to Heroku and set the environment variables
3. Verify the connection works in production
4. Monitor your database usage in the Atlas dashboard
