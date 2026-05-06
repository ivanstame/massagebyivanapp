import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../AuthContext';
import ProfileSection from './ProfileSection';
import { EditModeTransition } from './transitions/TransitionComponents';
import TreatmentCard from './TreatmentCard';
import TreatmentPreferences from './TreatmentPreferences';

const STATES = [
  ['AK', 'Alaska'], ['AL', 'Alabama'], ['AR', 'Arkansas'], ['AZ', 'Arizona'], 
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], 
  ['DC', 'District of Columbia'], ['DE', 'Delaware'], ['FL', 'Florida'], 
  ['GA', 'Georgia'], ['HI', 'Hawaii'], ['IA', 'Iowa'], ['ID', 'Idaho'], 
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['KS', 'Kansas'], ['KY', 'Kentucky'], 
  ['LA', 'Louisiana'], ['MA', 'Massachusetts'], ['MD', 'Maryland'], 
  ['ME', 'Maine'], ['MI', 'Michigan'], ['MN', 'Minnesota'], 
  ['MO', 'Missouri'], ['MS', 'Mississippi'], ['MT', 'Montana'], 
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['NE', 'Nebraska'], 
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], 
  ['NV', 'Nevada'], ['NY', 'New York'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], 
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], 
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], 
  ['TX', 'Texas'], ['UT', 'Utah'], ['VA', 'Virginia'], ['VT', 'Vermont'], 
  ['WA', 'Washington'], ['WI', 'Wisconsin'], ['WV', 'West Virginia'], 
  ['WY', 'Wyoming']
];


const MyProfile = () => {
  // All hooks must run on every render — keep them above any conditional
  // returns. Earlier versions had `if (loading)` / `if (!user)` early-
  // returns interleaved with the useState calls below, which violates
  // the Rules of Hooks (React errors when the hook count changes between
  // renders). The auth-state guards now live below, after every hook.
  const { user, loading } = useContext(AuthContext);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [provider, setProvider] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSections, setEditingSections] = useState({
    basic: false,
    contact: false,
    treatment: false
  });
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    contact: true,
    treatment: true,
    provider: true
  });
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    address: {
      street: '',
      unit: '',
      city: '',
      state: '',
      zip: ''
    },
    emergencyContact: {
      name: '',
      phone: ''
    },
    treatmentPreferences: {
      pressure: 'medium',
      focusAreas: [],
      avoidAreas: [],
      oilSensitivities: '',
      notes: ''
    }
  });

  // If user is available from AuthContext and we haven't set profile yet, use it
  useEffect(() => {
    const synchronizePreferences = async () => {
      if (loading) return;
      
      try {
        setIsLoading(true);
        setPreferencesLoading(true);  // Set both loading states
        
        const response = await fetch('/api/users/profile', {
          credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to fetch profile');
        
        const userData = await response.json();
        
        // Set form data with all profile fields, including address
        setFormData(prev => ({
          fullName: userData.profile?.fullName || '',
          email: userData.email || '',
          phoneNumber: userData.profile?.phoneNumber || '',
          address: {
            street: userData.profile?.address?.street || '',
            unit: userData.profile?.address?.unit || '',
            city: userData.profile?.address?.city || '',
            state: userData.profile?.address?.state || '',
            zip: userData.profile?.address?.zip || ''
          },
          emergencyContact: {
            name: userData.profile?.emergencyContact?.name || '',
            phone: userData.profile?.emergencyContact?.phone || ''
          },
          treatmentPreferences: {
            pressure: userData.profile?.treatmentPreferences?.pressure || 'medium',
            focusAreas: userData.profile?.treatmentPreferences?.focusAreas || [],
            avoidAreas: userData.profile?.treatmentPreferences?.avoidAreas || [],
            oilSensitivities: userData.profile?.treatmentPreferences?.oilSensitivities || '',
            notes: userData.profile?.treatmentPreferences?.notes || ''
          }
        }));
   
        // If this is a client, fetch provider info
        if (userData.accountType === 'CLIENT' && userData.providerId) {
          try {
            const providerResponse = await fetch(`/api/users/provider/${userData.providerId}/profile`, {
              credentials: 'include'
            });
            
            if (providerResponse.ok) {
              const providerData = await providerResponse.json();
              setProvider(providerData);
            } else {
              setProvider({ error: 'Failed to load provider data' });
            }
          } catch (providerError) {
            setProvider({ error: 'Failed to load provider data' });
          }
        }
        
        setProfile(userData);
      } catch (error) {
        setError('Failed to load profile data');
      } finally {
        setIsLoading(false);
        setPreferencesLoading(false);  // Clear both loading states
      }
    };
   
    synchronizePreferences();
   }, [loading]);
  

  const handleSectionEdit = (section) => {
    setEditingSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleSectionToggle = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleInputChange = (e, section) => {
    const { name, value } = e.target;
    setFormData(prev => {
      if (name.includes('.')) {
        const [parent, child] = name.split('.');
        return {
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: value
          }
        };
      }
      return {
        ...prev,
        [name]: value
      };
    });
  };

  const handleSectionUpdate = async (section, data = null) => {
    try {
      let updateData = {};
      
      switch(section) {
        case 'basic':
          updateData = {
            fullName: formData.fullName,
            phoneNumber: formData.phoneNumber
          };
          break;
        case 'contact':
          updateData = {
            address: formData.address
          };
          break;
        case 'treatment':
          updateData = data ? {
            treatmentPreferences: data
          } : {
            treatmentPreferences: formData.treatmentPreferences
          };
          break;
        default:
          break;
      }
  
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // again, use session cookie, not token
        body: JSON.stringify(updateData)
      });
  
      if (response.ok) {
        const updatedData = await response.json();
        setProfile(prev => ({
          ...prev,
          ...updatedData.user
        }));
        setEditingSections(prev => ({
          ...prev,
          [section]: false
        }));

        // Re-sync formData from updatedData if needed
        const u = updatedData.user;        
        setFormData({
          fullName: u.profile?.fullName || '',
          email: u.email || '',
          phoneNumber: u.profile?.phoneNumber || '',
          address: u.profile?.address || {
            street: '',
            unit: '',
            city: '',
            state: '',
            zip: ''
          },
          emergencyContact: u.profile?.emergencyContact || {
            name: '',
            phone: ''
          },
          treatmentPreferences: u.profile?.treatmentPreferences || {
            pressure: 'medium',
            focusAreas: [],
            avoidAreas: [],
            oilSensitivities: '',
            notes: ''
          }
        });
      } else {
        throw new Error('Failed to update profile');
      }
    } catch (error) {
      // You might add error feedback to the user here
    }
  };

  if (loading || preferencesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-slate-600">Loading your profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-slate-600">No user found. Please log in.</div>
      </div>
    );
  }

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-3xl mx-auto px-5 py-8">
        <div className="mb-7">
          <div className="av-eyebrow mb-2">Your details</div>
          <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Profile
          </h1>
        </div>
      
      {/* Basic Information Section */}
      <ProfileSection
        title="Basic Information"
        isEditing={editingSections.basic}
        isExpanded={expandedSections.basic}
        onEdit={() => handleSectionEdit('basic')}
        onToggle={() => handleSectionToggle('basic')}
      >
        <EditModeTransition
          isEditing={editingSections.basic}
          viewComponent={
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-line-soft">
                <span className="text-slate-500">Full Name</span>
                <span className="text-slate-900 font-medium">{formData.fullName}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-line-soft">
                <span className="text-slate-500">Email</span>
                <span className="text-slate-900">{formData.email}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-line-soft">
                <span className="text-slate-500">Phone Number</span>
                <span className="text-slate-900">{formData.phoneNumber}</span>
              </div>
            </div>
          }
          editComponent={
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSectionUpdate('basic');
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange(e, 'basic')}
                  className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange(e, 'basic')}
                  className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
                />
              </div>
              <div className="flex justify-end space-x-4 pt-4">
                <button
                  type="button"
                  onClick={() => handleSectionEdit('basic')}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
                >
                  Save Changes
                </button>
                </div>
            </form>
          }
        />
      </ProfileSection>

      {/* Contact Information Section */}
      <ProfileSection
        title="Address Information"
        isEditing={editingSections.contact}
        isExpanded={expandedSections.contact}
        onEdit={() => handleSectionEdit('contact')}
        onToggle={() => handleSectionToggle('contact')}
      >
        <EditModeTransition
          isEditing={editingSections.contact}
          viewComponent={
            <div className="space-y-4">
              <div className="py-2 border-b border-line-soft">
                <div className="text-slate-500 mb-1">Address</div>
                <div className="text-slate-900">
                  {formData.address.street ? (
                    <>
                      {formData.address.street}
                      {formData.address.unit && `, Unit ${formData.address.unit}`}
                      <br />
                      {formData.address.city && formData.address.state ? (
                        `${formData.address.city}, ${formData.address.state} ${formData.address.zip}`
                      ) : (
                        <span className="text-slate-500 italic">Incomplete address</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-500 italic">No address provided</span>
                  )}
                </div>
              </div>
            </div>
          }
          editComponent={
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSectionUpdate('contact');
            }} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600">Address</h3>
                <div className="grid grid-cols-1 gap-4">
                  <input
                    type="text"
                    name="address.street"
                    value={formData.address.street}
                    onChange={(e) => handleInputChange(e, 'contact')}
                    placeholder="Street Address"
                    className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
                  />
                  <input
                    type="text"
                    name="address.unit"
                    value={formData.address.unit}
                    onChange={(e) => handleInputChange(e, 'contact')}
                    placeholder="Apt, Suite, Unit (optional)"
                    className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <input
                      type="text"
                      name="address.city"
                      value={formData.address.city}
                      onChange={(e) => handleInputChange(e, 'contact')}
                      placeholder="City"
                      className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
                    />
                    <select
                      name="address.state"
                      value={formData.address.state}
                      onChange={(e) => handleInputChange(e, 'contact')}
                      className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
                    >
                      <option value="">State</option>
                      {STATES.map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      name="address.zip"
                      value={formData.address.zip}
                      onChange={(e) => handleInputChange(e, 'contact')}
                      placeholder="ZIP"
                      maxLength="5"
                      pattern="[0-9]{5}"
                      className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B07A4E]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-4">
                <button
                  type="button"
                  onClick={() => handleSectionEdit('contact')}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36]"
                >
                  Save Changes
                </button>
              </div>
            </form>
          }
        />
      </ProfileSection>

      <ProfileSection
        title="My Massage Provider"
        isEditing={false}
        isExpanded={expandedSections.provider}
        onToggle={() => handleSectionToggle('provider')}
      >
        <div className="space-y-4">
          {user?.providerId ? (
            <div className="bg-paper-elev rounded-lg p-4 border border-line">
              <div className="flex justify-between items-center py-2 border-b border-line-soft">
                <span className="text-slate-500">Business Name</span>
                <span className="text-slate-900 font-medium">
                  {provider?.error ? 'Error loading data' : (provider?.providerProfile?.businessName || 'Loading...')}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-line-soft">
                <span className="text-slate-500">Contact Email</span>
                <span className="text-slate-900">
                  {provider?.error ? 'Error loading data' : (provider?.email || 'Loading...')}
                </span>
              </div>
            
              {/* Communication Buttons */}
              <div className="flex gap-3 mt-4">
                {provider?.profile?.phoneNumber && (
                  <a
                    href={`tel:${provider.profile.phoneNumber}`}
                    className="flex-1 py-2 px-4 bg-[#B07A4E] text-white rounded-lg
                      hover:bg-[#8A5D36] transition-colors text-center"
                  >
                    Call Provider
                  </a>
                )}
                <a
                  href={`sms:${provider?.profile?.phoneNumber}`}
                  className="flex-1 py-2 px-4 bg-[#B07A4E] text-white rounded-lg
                    hover:bg-[#8A5D36] transition-colors text-center"
                >
                  Text Provider
                </a>
                <a
                  href={`mailto:${provider?.email}`}
                  className="flex-1 py-2 px-4 bg-[#B07A4E] text-white rounded-lg
                    hover:bg-[#8A5D36] transition-colors text-center"
                >
                  Email Provider
                </a>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 italic">
              No provider information available
            </div>
          )}
        </div>
      </ProfileSection>

      {/* Treatment Preferences Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">Treatment Preferences</h2>
          <a
            href="/treatment-preferences"
            className="text-sm text-[#B07A4E] hover:text-[#8A5D36] font-medium"
          >
            Edit
          </a>
        </div>
        <div className="bg-paper-elev border border-line rounded-lg p-5 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Pressure</div>
            <div className="text-slate-900 capitalize">
              {formData.treatmentPreferences?.pressure || 'Not set'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Focus areas</div>
            <div className="flex flex-wrap gap-1.5">
              {(formData.treatmentPreferences?.focusAreas || []).length > 0 ? (
                formData.treatmentPreferences.focusAreas.map(area => (
                  <span key={area} className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-[#B07A4E]/10 text-[#B07A4E]">
                    {area}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">None specified</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Avoid areas</div>
            <div className="flex flex-wrap gap-1.5">
              {(formData.treatmentPreferences?.avoidAreas || []).length > 0 ? (
                formData.treatmentPreferences.avoidAreas.map(area => (
                  <span key={area} className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-700 border border-red-200">
                    {area}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">None specified</span>
              )}
            </div>
          </div>
          {formData.treatmentPreferences?.oilSensitivities && (
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Oil / scent sensitivities</div>
              <div className="text-sm text-slate-900">{formData.treatmentPreferences.oilSensitivities}</div>
            </div>
          )}
          {formData.treatmentPreferences?.notes && (
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Notes for your therapist</div>
              <div className="text-sm text-slate-900 whitespace-pre-wrap">{formData.treatmentPreferences.notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* Account Management Section */}
      <div className="mt-8 border-t border-line pt-8">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Account Management</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-red-800 mb-2">Danger Zone</h3>
          <p className="text-red-700 mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <button
            onClick={async () => {
              if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                try {
                  const response = await fetch('/api/users/account', {
                    method: 'DELETE',
                    credentials: 'include'
                  });
                  
                  if (response.ok) {
                    alert('Account deleted successfully. You will be logged out.');
                    window.location.href = '/login';
                  } else {
                    const errorData = await response.json();
                    alert(`Error deleting account: ${errorData.message}`);
                  }
                } catch (error) {
                  alert('An error occurred while deleting your account.');
                }
              }
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Delete My Account
          </button>
        </div>
      </div>
    </div>
    </div>
  );
};

export default MyProfile;
