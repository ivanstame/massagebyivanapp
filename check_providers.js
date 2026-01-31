#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./server/models/User');
const Availability = require('./server/models/Availability');

async function checkProviders() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Find all provider accounts
    console.log('=== ALL PROVIDER ACCOUNTS ===');
    const providers = await User.find({ accountType: 'PROVIDER' });
    
    if (providers.length === 0) {
      console.log('❌ No provider accounts found!');
    } else {
      providers.forEach((p, i) => {
        console.log(`\nProvider ${i + 1}:`);
        console.log(`  ID: ${p._id}`);
        console.log(`  Email: ${p.email}`);
        console.log(`  Name: ${p.profile?.fullName || 'Not set'}`);
        console.log(`  Created: ${p.createdAt}`);
      });
    }
    
    // Check availability for each provider
    console.log('\n\n=== AVAILABILITY CHECK (Feb 2026) ===');
    for (const provider of providers) {
      const count = await Availability.countDocuments({
        provider: provider._id,
        localDate: { $regex: '^2026-02' }
      });
      console.log(`\nProvider: ${provider.email}`);
      console.log(`  Feb 2026 availability blocks: ${count}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkProviders();
