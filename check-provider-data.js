require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./server/models/User');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkProviders() {
  try {
    const allUsers = await User.find({});
    console.log(`Total users in database: ${allUsers.length}\n`);
    
    const providers = await User.find({ accountType: 'PROVIDER' });
    const clients = await User.find({ accountType: 'CLIENT' });
    
    console.log(`Providers: ${providers.length}`);
    console.log(`Clients: ${clients.length}\n`);
    
    console.log('ALL USERS:');
    allUsers.forEach(user => {
      console.log('User ID:', user._id);
      console.log('Email:', user.email);
      console.log('Account Type:', user.accountType);
      console.log('Provider Profile:', JSON.stringify(user.providerProfile, null, 2));
      console.log('Profile:', JSON.stringify(user.profile, null, 2));
      console.log('-------------------\n');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkProviders();
