// One-shot fix for Ashton Christopher's misplaced Saturday May 2 booking.
//
// Background: provider booked on behalf for an in-studio day, the
// booking flow forced the location to Peters Chiropractic (the in-
// studio location for that day) instead of using Ashton's home
// address. Code is fixed forward — provider-on-behalf bookings now
// always respect the form's address — this script repairs the one
// orphan booking after the fact.
//
// Strategy:
//   1. Find Ashton by name (filter on profile.fullName ~ /Ashton/)
//   2. Find his upcoming Saturday May 2 booking with the wrong location
//   3. Update the booking's location to Ashton's saved profile.address
//   4. Recompute travelDistance from previous booking → Ashton's home
//
// Idempotent: skips if the booking already has Ashton's home address.
//
// Run via: heroku run node scripts/repair-ashton-saturday-location.js -a massagebyivan

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../server/models/User');
const Booking = require('../server/models/Booking');

const TARGET_DATE = '2026-05-02';

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  try {
    // Find Ashton
    const ashton = await User.findOne({
      'profile.fullName': /Ashton/i,
      accountType: 'CLIENT',
    });
    if (!ashton) {
      console.error('Could not find Ashton by name');
      process.exit(1);
    }
    console.log(`Found Ashton: ${ashton._id} (${ashton.profile.fullName})`);

    const homeAddress = ashton.profile?.address;
    if (!homeAddress?.street) {
      console.error('Ashton has no saved address on his profile — cannot determine where to put the booking.');
      console.error('Saved address:', homeAddress);
      process.exit(1);
    }
    const formatted = homeAddress.formatted ||
      `${homeAddress.street}${homeAddress.unit ? ', ' + homeAddress.unit : ''}, ${homeAddress.city}, ${homeAddress.state} ${homeAddress.zip}`;
    console.log(`Home address: ${formatted}`);

    // Find the booking
    const booking = await Booking.findOne({
      client: ashton._id,
      localDate: TARGET_DATE,
      status: { $nin: ['cancelled'] },
    });
    if (!booking) {
      console.error(`No active booking found for Ashton on ${TARGET_DATE}`);
      process.exit(1);
    }
    console.log(`Found booking: ${booking._id} at ${booking.startTime} (${booking.duration} min)`);
    console.log(`Current location: ${booking.location?.address}`);

    // Idempotency check
    if (booking.location?.address === formatted) {
      console.log('\nBooking already has Ashton\'s home address — nothing to do.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // We don't have lat/lng for Ashton's home address handy without
    // calling the geocoder; for the repair, just persist the address
    // string and zero out the cached lat/lng so the next downstream
    // consumer (drive-time calc, mileage report) can re-resolve.
    booking.location = {
      address: formatted,
      lat: homeAddress.lat ?? booking.location?.lat ?? null,
      lng: homeAddress.lng ?? booking.location?.lng ?? null,
    };
    // Reset travelDistance — it was computed from the wrong destination.
    booking.travelDistance = { miles: null, fromAddress: null, toAddress: null };
    await booking.save();
    console.log(`\n✓ Updated booking location to: ${formatted}`);
    console.log('  (travelDistance reset; mileage report will recompute on next view)');
  } catch (err) {
    console.error('Fatal:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
