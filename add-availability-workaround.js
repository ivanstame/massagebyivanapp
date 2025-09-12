// add-availability-workaround.js
// This script directly adds availability to the database

require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { DEFAULT_TZ } = require('./src/utils/timeConstants');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Import the models
const User = require('./server/models/User');
const Availability = require('./server/models/Availability');

// Function to add availability
async function addAvailability(email, date, start, end, type) {
  try {
    // Find the provider by email
    const provider = await User.findOne({ email });
    
    if (!provider) {
      console.error('Provider not found with email:', email);
      return { success: false, message: 'Provider not found' };
    }
    
    console.log('Found provider:', provider.email, provider._id);
    
    // Parse the date
    const availabilityDate = DateTime.fromISO(date, { zone: DEFAULT_TZ });
    if (!availabilityDate.isValid) {
      console.error('Invalid date format:', date);
      return { success: false, message: 'Invalid date format' };
    }
    
    // Create start and end DateTime objects
    const startLA = DateTime.fromFormat(
      `${availabilityDate.toFormat('yyyy-MM-dd')} ${start}`,
      'yyyy-MM-dd HH:mm',
      { zone: DEFAULT_TZ }
    );
    const endLA = DateTime.fromFormat(
      `${availabilityDate.toFormat('yyyy-MM-dd')} ${end}`,
      'yyyy-MM-dd HH:mm',
      { zone: DEFAULT_TZ }
    );
    
    // Validate times
    if (!startLA.isValid || !endLA.isValid) {
      console.error('Invalid time format:', { startLA, endLA });
      return { success: false, message: 'Invalid time format' };
    }
    
    if (endLA <= startLA) {
      console.error('End time not after start time:', { startLA, endLA });
      return { success: false, message: 'End time must be after start time' };
    }
    
    // Check for existing availability blocks that overlap with the new one
    const existingBlocks = await Availability.find({
      provider: provider._id,
      localDate: availabilityDate.toFormat('yyyy-MM-dd'),
      $or: [
        // New block starts during existing block
        {
          start: { $lte: startLA.toJSDate() },
          end: { $gt: startLA.toJSDate() }
        },
        // New block ends during existing block
        {
          start: { $lt: endLA.toJSDate() },
          end: { $gte: endLA.toJSDate() }
        },
        // New block completely contains existing block
        {
          start: { $gte: startLA.toJSDate() },
          end: { $lte: endLA.toJSDate() }
        }
      ]
    });
    
    if (existingBlocks.length > 0) {
      console.error('Overlapping blocks found:', existingBlocks.length);
      return { 
        success: false, 
        message: 'This time block overlaps with existing availability',
        conflicts: existingBlocks
      };
    }
    
    // Create the availability object
    const newAvailability = new Availability({
      provider: provider._id,
      date: availabilityDate.toJSDate(),
      start: startLA.toJSDate(),
      end: endLA.toJSDate(),
      type,
      localDate: availabilityDate.toFormat('yyyy-MM-dd')
    });
    
    // Save to database
    const result = await newAvailability.save();
    console.log('Availability created successfully:', result);
    
    return { 
      success: true, 
      message: 'Availability created successfully',
      availability: result
    };
  } catch (error) {
    console.error('Error creating availability:', error);
    return { success: false, message: error.message };
  }
}

// Function to list availability for a provider
async function listAvailability(email, date) {
  try {
    // Find the provider by email
    const provider = await User.findOne({ email });
    
    if (!provider) {
      console.error('Provider not found with email:', email);
      return { success: false, message: 'Provider not found' };
    }
    
    // Parse the date
    const availabilityDate = DateTime.fromISO(date, { zone: DEFAULT_TZ });
    if (!availabilityDate.isValid) {
      console.error('Invalid date format:', date);
      return { success: false, message: 'Invalid date format' };
    }
    
    // Find availability blocks for the date
    const blocks = await Availability.find({
      provider: provider._id,
      localDate: availabilityDate.toFormat('yyyy-MM-dd')
    });
    
    console.log(`Found ${blocks.length} availability blocks for ${date}`);
    
    return {
      success: true,
      blocks: blocks.map(block => ({
        id: block._id,
        date: block.localDate,
        start: DateTime.fromJSDate(block.start).setZone(DEFAULT_TZ).toFormat('HH:mm'),
        end: DateTime.fromJSDate(block.end).setZone(DEFAULT_TZ).toFormat('HH:mm'),
        type: block.type
      }))
    };
  } catch (error) {
    console.error('Error listing availability:', error);
    return { success: false, message: error.message };
  }
}

// Export the functions
module.exports = {
  addAvailability,
  listAvailability
};

// If this script is run directly, add a test availability
if (require.main === module) {
  const tomorrow = DateTime.now().plus({ days: 1 }).toFormat('yyyy-MM-dd');
  const dayAfterTomorrow = DateTime.now().plus({ days: 2 }).toFormat('yyyy-MM-dd');
  
  addAvailability('ivan@massagebyivan.com', dayAfterTomorrow, '09:00', '17:00', 'autobook')
    .then(result => {
      console.log('Result:', result);
      
      if (result.success) {
        return listAvailability('ivan@massagebyivan.com', dayAfterTomorrow);
      }
      
      return { success: false, message: 'Skipping list due to add failure' };
    })
    .then(result => {
      console.log('List result:', result);
      mongoose.connection.close();
    })
    .catch(error => {
      console.error('Script error:', error);
      mongoose.connection.close();
    });
}
