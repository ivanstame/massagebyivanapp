const fs = require('fs');
const path = require('path');

const authFilePath = path.join(__dirname, 'server', 'routes', 'auth.js');

// Read the current auth.js file
const content = fs.readFileSync(authFilePath, 'utf8');

// Find the registration endpoint and modify the req.login callback to explicitly save the session
const updatedContent = content.replace(
  /      \/\/ Log the user in automatically\s+req\.login\(user, async \(err\) => {\s+if \(err\) {\s+return res\.status\(500\)\.json\(\{ message: 'Registration successful but login failed' \}\);\s+}\s+\s+try {\s+\/\/ Return user data with provider info if client\s+const userData = user\.getPublicProfile\(\);\s+let providerInfo = null;\s+\s+if \(accountType === 'CLIENT' && providerId\) {\s+userData\.providerId = providerId;\s+const provider = await User\.findById\(providerId\)\s+\.select\('providerProfile\.businessName email'\);\s+if \(provider\) {\s+providerInfo = {\s+businessName: provider\.providerProfile\.businessName,\s+email: provider\.email\s+};\s+}\s+}\s+\s+return res\.status\(201\)\.json\(\{\s+message: 'Registration successful',\s+user: userData,\s+provider: providerInfo\s+}\);\s+} catch \(error\) {\s+console\.error\('Error fetching provider info:', error\);\s+return res\.status\(500\)\.json\(\{ message: 'Error completing registration' \}\);\s+}\s+}\);/,
  `      // Log the user in automatically
      req.login(user, async (err) => {
        if (err) {
          return res.status(500).json({ message: 'Registration successful but login failed' });
        }

        // Explicitly save the session to ensure it's persisted
        req.session.save(async (saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: 'Registration successful but session save failed' });
          }

          try {
            // Return user data with provider info if client
            const userData = user.getPublicProfile();
            let providerInfo = null;
            
            if (accountType === 'CLIENT' && providerId) {
              userData.providerId = providerId;
              const provider = await User.findById(providerId)
                .select('providerProfile.businessName email');
              if (provider) {
                providerInfo = {
                  businessName: provider.providerProfile.businessName,
                  email: provider.email
                };
              }
            }

            return res.status(201).json({
              message: 'Registration successful',
              user: userData,
              provider: providerInfo
            });
          } catch (error) {
            console.error('Error fetching provider info:', error);
            return res.status(500).json({ message: 'Error completing registration' });
          }
        });
      });`
);

// Write the updated content back to the file
fs.writeFileSync(authFilePath, updatedContent, 'utf8');
console.log('Session fix applied to auth.js');
