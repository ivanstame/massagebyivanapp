#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Availability = require('./server/models/Availability');

async function diagnose() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Get all February 2026 availability
    console.log('=== SEARCHING FOR FEBRUARY 2026 AVAILABILITY ===\n');
    
    const allAvail = await Availability.find({
      localDate: { $regex: '^2026-02' }
    }).limit(5);
    
    console.log(`Found ${allAvail.length} records\n`);
    
    if (allAvail.length > 0) {
      console.log('=== FIRST RECORD DETAILS ===');
      const first = allAvail[0];
      console.log('ID:', first._id);
      console.log('Provider:', first.provider);
      console.log('localDate:', first.localDate);
      console.log('date (UTC):', first.date);
      console.log('start (UTC):', first.start);
      console.log('end (UTC):', first.end);
      console.log('availableSlots:', first.availableSlots);
      console.log('\n=== CONVERTED TO LA TIMEZONE ===');
      const startLA = DateTime.fromJSDate(first.start).setZone('America/Los_Angeles');
      const endLA = DateTime.fromJSDate(first.end).setZone('America/Los_Angeles');
      const dateLA = DateTime.fromJSDate(first.date).setZone('America/Los_Angeles');
      console.log('date (LA):', dateLA.toFormat('yyyy-MM-dd'));
      console.log('start (LA):', startLA.toFormat('yyyy-MM-dd HH:mm'));
      console.log('end (LA):', endLA.toFormat('yyyy-MM-dd HH:mm'));
    }
    
    // Now test what the /month route would query
    console.log('\n\n=== TESTING /month ROUTE QUERY ===');
    const startDate = DateTime.fromObject(
      { year: 2026, month: 2, day: 1 },
      { zone: 'America/Los_Angeles' }
    );
    const endDate = startDate.endOf('month');
    
    console.log('Query range:');
    console.log('  Start (LA):', startDate.toFormat('yyyy-MM-dd HH:mm'));
    console.log('  End (LA):', endDate.toFormat('yyyy-MM-dd HH:mm'));
    console.log('  Start (UTC):', startDate.toUTC().toISO());
    console.log('  End (UTC):', endDate.toUTC().toISO());
    
    const monthResults = await Availability.find({
      date: {
        $gte: startDate.toUTC().toJSDate(),
        $lte: endDate.toUTC().toJSDate()
      }
    }).sort({ date: 1 });
    
    console.log(`\nResults from /month query: ${monthResults.length} records`);
    
    if (monthResults.length > 0) {
      console.log('\nFirst 3 dates found:');
      monthResults.slice(0, 3).forEach(r => {
        const dateLA = DateTime.fromJSDate(r.date).setZone('America/Los_Angeles');
        console.log(`  ${r.localDate} (date field in LA: ${dateLA.toFormat('yyyy-MM-dd')})`);
      });
    }
    
    // Test a specific date query
    console.log('\n\n=== TESTING /available/:date ROUTE QUERY ===');
    const testDate = DateTime.fromISO('2026-02-03', { zone: 'America/Los_Angeles' });
    const startOfDay = testDate.startOf('day');
    const endOfDay = testDate.endOf('day');
    
    console.log('Testing date: 2026-02-03');
    console.log('  Start of day (UTC):', startOfDay.toUTC().toISO());
    console.log('  End of day (UTC):', endOfDay.toUTC().toISO());
    
    const dayResults = await Availability.find({
      date: {
        $gte: startOfDay.toUTC().toJSDate(),
        $lt: endOfDay.toUTC().toJSDate()
      }
    });
    
    console.log(`\nResults for 2026-02-03: ${dayResults.length} records`);
    
    if (dayResults.length > 0) {
      dayResults.forEach(r => {
        const startLA = DateTime.fromJSDate(r.start).setZone('America/Los_Angeles');
        const endLA = DateTime.fromJSDate(r.end).setZone('America/Los_Angeles');
        console.log(`  ${r.localDate}: ${startLA.toFormat('HH:mm')} - ${endLA.toFormat('HH:mm')}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

diagnose();
