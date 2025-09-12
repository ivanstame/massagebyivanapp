const mongoose = require('mongoose');
const User = require('./server/models/User');
const bcrypt = require('bcryptjs');

require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function seedData() {
  try {
    // Create a provider
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const provider = new User({
      email: 'provider@test.com',
      password: hashedPassword,
      accountType: 'PROVIDER',
      profile: {
        fullName: 'John Smith',
        phoneNumber: '(555) 123-4567',
        address: {
          street: '123 Wellness St',
          unit: 'Suite 100',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90001'
        }
      },
      providerProfile: {
        businessName: 'Healing Hands Massage Therapy',
        tagline: 'Your wellness journey starts here',
        rating: 4.9,
        reviewCount: 127,
        yearsExperience: 15,
        certifications: ['Licensed Massage Therapist', 'Deep Tissue Specialist', 'Sports Massage Certified'],
        serviceAreas: [
          { city: 'Los Angeles', state: 'CA', zipCode: '90001' }
        ]
      },
      registrationStep: 3
    });

    const savedProvider = await provider.save();
    console.log('Provider created:', savedProvider.email);
    console.log('Provider ID:', savedProvider._id);
    console.log('Business Name:', savedProvider.providerProfile.businessName);

    // Create a client associated with this provider
    const client = new User({
      email: 'client@test.com',
      password: hashedPassword,
      accountType: 'CLIENT',
      providerId: savedProvider._id,
      profile: {
        fullName: 'Jane Doe',
        phoneNumber: '(555) 987-6543',
        address: {
          street: '456 Client Ave',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90002'
        }
      },
      registrationStep: 3
    });

    const savedClient = await client.save();
    console.log('\nClient created:', savedClient.email);
    console.log('Client ID:', savedClient._id);
    console.log('Associated Provider ID:', savedClient.providerId);

    console.log('\n✅ Test data seeded successfully!');
    console.log('\nYou can now log in with:');
    console.log('Provider: provider@test.com / password123');
    console.log('Client: client@test.com / password123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seedData();
