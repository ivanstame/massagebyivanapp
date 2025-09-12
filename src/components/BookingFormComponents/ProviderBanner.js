import React from 'react';
import { Star, MapPin, Award, Shield } from 'lucide-react';

const ProviderBanner = ({ provider }) => {
  
  // Show loading state if provider is null (data is being fetched)
  if (provider === null) {
    return (
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-xl shadow-lg overflow-hidden animate-pulse">
        <div className="relative p-8">
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
            {/* Loading placeholder for image */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-white bg-teal-500 opacity-50"></div>
            </div>
            
            {/* Loading placeholder for content */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="h-8 bg-white/20 rounded w-3/4 mx-auto md:mx-0"></div>
              <div className="h-6 bg-white/20 rounded w-1/2 mx-auto md:mx-0"></div>
              <div className="h-4 bg-white/20 rounded w-2/3 mx-auto md:mx-0"></div>
              <div className="h-4 bg-white/20 rounded w-1/3 mx-auto md:mx-0"></div>
            </div>
          </div>
        </div>
        <div className="h-2 bg-gradient-to-r from-yellow-400 to-yellow-500"></div>
      </div>
    );
  }
  
  // Extract real provider data with sensible defaults
  const providerData = {
    rating: provider?.providerProfile?.rating || 5.0,
    reviews: provider?.providerProfile?.reviewCount || 0,
    experience: provider?.providerProfile?.yearsExperience ? `${provider.providerProfile.yearsExperience}+ years` : "Experienced professional",
    certifications: provider?.providerProfile?.certifications || ["Licensed Massage Therapist"],
    location: provider?.profile?.address ? 
      `${provider.profile.address.city}, ${provider.profile.address.state}` : 
      provider?.providerProfile?.serviceAreas?.[0]?.city || "Los Angeles, CA",
    image: provider?.providerProfile?.profileImage || null,
    tagline: provider?.providerProfile?.tagline || "Your wellness journey starts here",
    businessName: provider?.providerProfile?.businessName || "Your Wellness Provider",
    email: provider?.email || null,
    phone: provider?.profile?.phoneNumber || null
  };

  return (
    <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-xl shadow-lg overflow-hidden">
      <div className="relative p-8">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
            {/* Provider Image or Placeholder */}
            <div className="flex-shrink-0">
              {providerData.image ? (
                <img
                  src={providerData.image}
                  alt={provider?.providerProfile?.businessName}
                  className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-white shadow-lg object-cover"
                />
              ) : (
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-white shadow-lg bg-teal-500 flex items-center justify-center">
                  <span className="text-3xl md:text-4xl font-bold">
                    {provider?.providerProfile?.businessName?.charAt(0) || 'M'}
                  </span>
                </div>
              )}
            </div>

            {/* Provider Information */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                {provider?.providerProfile?.businessName || 'Your Wellness Provider'}
              </h1>
              
              <p className="text-lg text-teal-100 mb-4 italic">
                {providerData.tagline}
              </p>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm">
                {/* Rating */}
                {providerData.reviews > 0 && (
                  <div className="flex items-center space-x-1">
                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold">{providerData.rating}</span>
                    <span className="text-teal-100">({providerData.reviews} reviews)</span>
                  </div>
                )}

                {/* Experience */}
                <div className="flex items-center space-x-1">
                  <Award className="w-5 h-5 text-yellow-400" />
                  <span>{providerData.experience}</span>
                </div>

                {/* Location */}
                <div className="flex items-center space-x-1">
                  <MapPin className="w-5 h-5" />
                  <span>{providerData.location}</span>
                </div>
              </div>

              {/* Certifications */}
              <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-2">
                <Shield className="w-5 h-5 text-yellow-400" />
                {providerData.certifications.map((cert, index) => (
                  <span key={index} className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm">
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom accent bar */}
      <div className="h-2 bg-gradient-to-r from-yellow-400 to-yellow-500"></div>
    </div>
  );
};

export default ProviderBanner;
