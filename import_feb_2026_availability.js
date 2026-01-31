#!/usr/bin/env node

/**
 * Import February 2026 Availability
 * Bulk imports Ivan's massage availability for February 2026
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Availability = require('./server/models/Availability');
const User = require('./server/models/User');

// February 2026 Availability Data
const AVAILABILITY_DATA = [
  // Week 1
  { date: '2026-02-03', start: '16:30', end: '23:00' }, // Tuesday
  { date: '2026-02-04', start: '16:30', end: '23:00' }, // Wednesday
  { date: '2026-02-05', start: '16:30', end: '19:30' }, // Thursday
  { date: '2026-02-07', start: '12:00', end: '23:00' }, // Saturday
  
  // Week 2
  { date: '2026-02-08', start: '13:00', end: '19:00' }, // Sunday
  { date: '2026-02-10', start: '16:30', end: '23:00' }, // Tuesday
  { date: '2026-02-11', start: '16:30', end: '23:00' }, // Wednesday
  { date: '2026-02-12', start: '16:30', end: '19:30' }, // Thursday
  
  // Week 3
  { date: '2026-02-16', start: '13:00', end: '22:00' }, // Monday
  { date: '2026-02-17', start: '16:30', end: '23:00' }, // Tuesday
  { date: '2026-02-18', start: '16:30', end: '23:00' }, // Wednesday
  { date: '2026-02-19', start: '16:30', end: '19:30' }, // Thursday
  { date: '2026-02-21', start: '12:00', end: '23:00' }, // Saturday
  
  // Week 4
  { date: '2026-02-22', start: '13:00', end: '22:00' }, // Sunday
  { date: '2026-02-23', start: '13:00', end: '22:00' }, // Monday
  { date: '2026-02-24', start: '16:30', end: '23:00' }, // Tuesday
  { date: '2026-02-25', start: '16:30', end: '23:00' }, // Wednesday
  { date: '2026-02-26', start: '16:30', end: '19:30' }, // Thursday
  { date: '2026-02-28', start: '12:00', end: '23:00' }, // Saturday
];

async function importAvailability() {
  try {
    console.log('='.repeat(70));
    console.log('IMPORTING FEBRUARY 2026 AVAILABILITY');
    console.log('='.repeat(70));
    
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find provider (assuming there's only one provider, or get by email)
    console.log('\n🔍 Finding provider account...');
    const provider = await User.findOne({ accountType: 'PROVIDER' });
    
    if (!provider) {
      throw new Error('No provider account found! Please create a provider account first.');
    }
    
    console.log(`✅ Found provider: ${provider.email} (${provider.profile.fullName || 'No name set'})`);
    console.log(`   Provider ID: ${provider._id}`);
    
    // Check for existing February 2026 availability
    console.log('\n🔍 Checking for existing February 2026 availability...');
    const existingCount = await Availability.countDocuments({
      provider: provider._id,
      localDate: { $regex: '^2026-02' }
    });
    
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing availability records for February 2026`);
      console.log('   Deleting existing records to avoid duplicates...');
      await Availability.deleteMany({
        provider: provider._id,
        localDate: { $regex: '^2026-02' }
      });
      console.log('✅ Deleted existing records');
    }
    
    // Create availability records
    console.log(`\n📅 Creating ${AVAILABILITY_DATA.length} availability blocks...`);
    console.log('-'.repeat(70));
    
    const availabilityRecords = [];
    
    for (const block of AVAILABILITY_DATA) {
      // Parse date and times in LA timezone
      const startDT = DateTime.fromFormat(
        `${block.date} ${block.start}`,
        'yyyy-MM-dd HH:mm',
        { zone: 'America/Los_Angeles' }
      );
      
      const endDT = DateTime.fromFormat(
        `${block.date} ${block.end}`,
        'yyyy-MM-dd HH:mm',
        { zone: 'America/Los_Angeles' }
      );
      
      // Convert to UTC for storage
      const startUTC = startDT.toUTC().toJSDate();
      const endUTC = endDT.toUTC().toJSDate();
      
      const dayName = startDT.toFormat('cccc');
      const duration = endDT.diff(startDT, 'hours').hours;
      
      console.log(`   ${dayName} ${block.date}: ${block.start} - ${block.end} (${duration} hours)`);
      
      // Manually set date and localDate fields (what pre-save hook would do)
      const localDate = startDT.toFormat('yyyy-MM-dd');
      const dateUTC = startDT.startOf('day').toUTC().toJSDate();
      
      availabilityRecords.push({
        provider: provider._id,
        date: dateUTC,
        localDate: localDate,
        start: startUTC,
        end: endUTC
      });
    }
    
    // Bulk insert using create() to trigger pre-save hooks
    console.log('\n💾 Inserting records into database...');
    const result = await Availability.create(availabilityRecords);
    
    console.log(`✅ Successfully inserted ${result.length} availability blocks!`);
    
    // Verify insertion
    console.log('\n🔍 Verifying data...');
    const verifyCount = await Availability.countDocuments({
      provider: provider._id,
      localDate: { $regex: '^2026-02' }
    });
    
    console.log(`✅ Verification complete: ${verifyCount} records found in database`);
    
    // Show summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(70));
    console.log(`Provider: ${provider.email}`);
    console.log(`Month: February 2026`);
    console.log(`Total Days: ${AVAILABILITY_DATA.length}`);
    console.log(`Total Hours: ${AVAILABILITY_DATA.reduce((sum, block) => {
      const start = DateTime.fromFormat(block.start, 'HH:mm');
      const end = DateTime.fromFormat(block.end, 'HH:mm');
      return sum + end.diff(start, 'hours').hours;
    }, 0).toFixed(1)}`);
    console.log(`Records Created: ${result.length}`);
    console.log('='.repeat(70));
    
    console.log('\n✅ Import complete! Your February 2026 availability is now live.');
    console.log('   Clients can now book appointments for these dates.\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR during import:');
    console.error(error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the import
importAvailability();
