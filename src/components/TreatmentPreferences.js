import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext'; 
import { Info, ChevronDown, ChevronUp, Edit2, Check, CheckCircle, Clock, CreditCard, Settings } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';

// Component for visualizing pressure level
const PressureIndicator = ({ value, isInteractive = false, onChange }) => (
  <div className="relative w-full">
    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
      <div 
        className="h-full bg-[#B07A4E] rounded-r-none transition-all duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
    <div 
      className="absolute top-1/2 -translate-y-1/2"
      style={{ left: `${value}%` }}
    >
      <div className="w-4 h-4 bg-[#B07A4E] rounded-full shadow-md -translate-x-1/2" />
    </div>
    {isInteractive && (
      <input
        type="range"
        min="1"
        max="100"
        value={value}
        onChange={onChange}
        className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
        style={{
          WebkitAppearance: 'none',
          appearance: 'none'
        }}
      />
    )}
    <style>{`
      input[type='range']::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        background: #B07A4E;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        cursor: pointer;
      }
      input[type='range']::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #B07A4E;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        cursor: pointer;
        border: none;
      }
    `}</style>
  </div>
);

const BODY_AREAS = [
  {
    id: 'upper_back_shoulders',
    label: 'Upper Back & Shoulders',
    anatomicalTerms: 'Trapezius • Rhomboids • Posterior Deltoids',
    description: 'Upper back muscles and shoulder blade area',
    commonConditions: [
      'Postural tension',
      'Computer-related strain',
      'Exercise soreness',
      'Shoulder blade tension',
      'Stress-related tension'
    ],
    radiationPatterns: [
      'Between shoulder blades',
      'Across shoulders',
      'Down arms'
    ],
    anatomyInfo: {
      'Trapezius': 'Large diamond-shaped muscle spanning the upper back and neck, crucial for posture and shoulder movement',
      'Rhomboids': 'Deep muscles connecting shoulder blades to spine, important for posture and shoulder stability',
      'Posterior Deltoids': 'Rear shoulder muscles that help with arm movement and shoulder stability'
    }
  },
  {
    id: 'middle_back_lats',
    label: 'Middle Back & Lats',
    anatomicalTerms: 'Latissimus Dorsi • Middle Trapezius • Erector Spinae',
    description: 'Mid-back region including side muscles',
    commonConditions: [
      'Athletic tension',
      'Postural strain',
      'Muscle tightness',
      'Workout soreness'
    ],
    radiationPatterns: [
      'To shoulder blades',
      'Around ribcage',
      'To lower back'
    ],
    anatomyInfo: {
      'Latissimus Dorsi': 'Large, flat muscles of the mid-back, important for arm movement and posture',
      'Middle Trapezius': 'Middle portion of the trapezius muscle, crucial for shoulder blade stability',
      'Erector Spinae': 'Group of muscles running along the spine, essential for back support and movement'
    }
  },
  {
    id: 'lower_back',
    label: 'Lower Back',
    anatomicalTerms: 'Lower Erector Spinae • Quadratus Lumborum',
    description: 'Lower back and lumbar region',
    commonConditions: [
      'General stiffness',
      'Athletic strain',
      'Postural tension',
      'Exercise related'
    ],
    radiationPatterns: [
      'To hips',
      'Across lower back',
      'Down legs'
    ],
    anatomyInfo: {
      'Lower Erector Spinae': 'Lower portion of the back muscles that run along the spine',
      'Quadratus Lumborum': 'Deep lower back muscle that helps with posture and side-bending'
    }
  },
  {
    id: 'glutes_hips',
    label: 'Glutes & Hip Area',
    anatomicalTerms: 'Gluteus Maximus • Gluteus Medius • Hip Rotators',
    description: 'Buttocks and hip region',
    commonConditions: [
      'Sitting tension',
      'Athletic tightness',
      'Hip stiffness',
      'Exercise soreness'
    ],
    radiationPatterns: [
      'To lower back',
      'Down leg',
      'Across glutes'
    ],
    anatomyInfo: {
      'Gluteus Maximus': 'Largest buttock muscle, important for hip extension and movement',
      'Gluteus Medius': 'Hip muscle crucial for stability and walking',
      'Hip Rotators': 'Group of small muscles that help rotate the hip'
    }
  },
  {
    id: 'hamstrings',
    label: 'Hamstrings',
    anatomicalTerms: 'Biceps Femoris • Semitendinosus • Semimembranosus',
    description: 'Back of thigh muscles',
    commonConditions: [
      'Exercise tightness',
      'Running tension',
      'Flexibility issues',
      'General soreness'
    ],
    radiationPatterns: [
      'To knee',
      'To glutes',
      'Behind thigh'
    ],
    anatomyInfo: {
      'Biceps Femoris': 'Outer hamstring muscle',
      'Semitendinosus': 'Inner hamstring muscle',
      'Semimembranosus': 'Deep inner hamstring muscle'
    }
  },
  {
    id: 'calves',
    label: 'Calves & Achilles',
    anatomicalTerms: 'Gastrocnemius • Soleus • Achilles Tendon',
    description: 'Lower leg posterior muscles',
    commonConditions: [
      'Exercise tension',
      'Running tightness',
      'General soreness',
      'Athletic strain'
    ],
    radiationPatterns: [
      'To ankle',
      'Up leg',
      'Throughout calf'
    ],
    anatomyInfo: {
      'Gastrocnemius': 'Main superficial calf muscle',
      'Soleus': 'Deep calf muscle under the gastrocnemius',
      'Achilles Tendon': 'Strong tendon connecting calf muscles to heel'
    }
  }
];

const ProviderPreferences = ({ formData, onChange }) => (
  <div className="space-y-6">
    <h3 className="text-xl font-semibold text-slate-900">Business Settings</h3>

    {/* Scheduling Preferences */}
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-[#B07A4E]" />
        <h4 className="font-medium text-slate-900">Scheduling Settings</h4>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Default Appointment Duration
          </label>
          <select
            value={formData.defaultDuration || 60}
            onChange={(e) => onChange('defaultDuration', parseInt(e.target.value))}
            className="w-full p-2 border rounded-lg"
          >
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
            <option value={120}>120 minutes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Buffer Time Between Appointments
          </label>
          <select
            value={formData.bufferTime || 15}
            onChange={(e) => onChange('bufferTime', parseInt(e.target.value))}
            className="w-full p-2 border rounded-lg"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Advance Booking Window
          </label>
          <select
            value={formData.advanceBooking || 30}
            onChange={(e) => onChange('advanceBooking', parseInt(e.target.value))}
            className="w-full p-2 border rounded-lg"
          >
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
            <option value={30}>1 month</option>
            <option value={60}>2 months</option>
          </select>
        </div>
      </div>
    </div>

    {/* Service Settings */}
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-[#B07A4E]" />
        <h4 className="font-medium text-slate-900">Service Settings</h4>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Available Services
          </label>
          <div className="space-y-2">
            {['Swedish Massage', 'Deep Tissue', 'Sports Massage', 'Prenatal Massage'].map(service => (
              <label key={service} className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.services?.includes(service)}
                  onChange={(e) => {
                    const services = formData.services || [];
                    if (e.target.checked) {
                      onChange('services', [...services, service]);
                    } else {
                      onChange('services', services.filter(s => s !== service));
                    }
                  }}
                  className="form-checkbox h-5 w-5 text-[#B07A4E]"
                />
                <span className="text-slate-700">{service}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Travel Fee (per mile)
          </label>
          <div className="relative mt-1 rounded-lg shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="text-slate-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              step="0.50"
              min="0"
              value={formData.travelFee || 0}
              onChange={(e) => onChange('travelFee', parseFloat(e.target.value))}
              className="block w-full rounded-lg pl-7 pr-12 focus:border-[#B07A4E] focus:ring-[#B07A4E] sm:text-sm"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ProgressIndicator = ({ currentStep }) => (
  <div className="mb-8 w-full max-w-4xl">
    <div className="flex justify-between mb-2">
      <div className={`text-sm font-medium ${currentStep >= 1 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
        Account
      </div>
      <div className={`text-sm font-medium ${currentStep >= 2 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
        Profile
      </div>
      <div className={`text-sm font-medium ${currentStep >= 3 ? 'text-[#B07A4E]' : 'text-slate-400'}`}>
        Preferences
      </div>
    </div>
    <div className="h-1 bg-slate-100 rounded-full">
      <div 
        className="h-full bg-[#B07A4E] rounded-full transition-all duration-500"
        style={{ width: `${(currentStep / 3) * 100}%` }}
      />
    </div>
  </div>
);

const AnatomicalTerms = ({ terms, area }) => {
  const terms_array = terms.split(' • ');
  
  return (
    <p className="text-sm text-slate-500 flex items-center flex-wrap gap-2">
      {terms_array.map((term, index) => (
        <span key={term} className="flex items-center">
          {term}
          <Popover>
            <PopoverTrigger className="ml-1 text-[#B07A4E] hover:opacity-80">
              <Info size={14} />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3">
              <div className="space-y-2">
                <h4 className="font-medium text-slate-900">{term}</h4>
                <p className="text-sm text-slate-600">{area.anatomyInfo[term]}</p>
              </div>
            </PopoverContent>
          </Popover>
          {index < terms_array.length - 1 && <span className="ml-2">•</span>}
        </span>
      ))}
    </p>
  );
};

const TreatmentCard = ({ area, data, isExpanded, isEditing, isLoading, onToggle, onUpdate }) => (
  <div 
    className={`bg-white rounded-lg border transition-all duration-300 ${
      isExpanded ? 'border-[#B07A4E] bg-[#B07A4E]/5' : 'border-slate-200'
    }`}
  >
    <div className="p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-medium text-slate-900">{area.label}</h3>
          <AnatomicalTerms terms={area.anatomicalTerms} area={area} />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-slate-700">
              Pressure Level: {data.pressure || 50}
            </label>
            <span className="text-sm text-[#B07A4E] font-medium">
              {(data.pressure || 50) <= 33 ? 'Gentle' : (data.pressure || 50) <= 66 ? 'Moderate' : 'Deep'}
            </span>
          </div>
          <PressureIndicator 
            value={data.pressure || 50}
            isInteractive={isEditing}
            onChange={(e) => onUpdate(area.id, { pressure: parseInt(e.target.value) })}
          />
        </div>

        <button
          type="button"
          disabled={isLoading}
          onClick={onToggle}
          className={`flex items-center text-sm font-bold text-[#B07A4E] hover:opacity-80 transition-colors ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isExpanded ? (
            <>
              <ChevronUp size={16} className="mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown size={16} className="mr-1" />
              Show more
            </>
          )}
        </button>

        {isExpanded && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Common Conditions
              </label>
              <div className="flex flex-wrap gap-2">
                {area.commonConditions.map(condition => (
                  <button
                    type="button"
                    key={condition}
                    disabled={!isEditing || isLoading}
                    onClick={() => {
                      const conditions = data.conditions || [];
                      const updated = conditions.includes(condition)
                        ? conditions.filter(c => c !== condition)
                        : [...conditions, condition];
                      onUpdate(area.id, { conditions: updated });
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      (data.conditions || []).includes(condition)
                        ? 'bg-[#B07A4E] bg-opacity-10 text-[#B07A4E]'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    } ${(!isEditing || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {condition}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Sensation Patterns
              </label>
              <div className="flex flex-wrap gap-2">
                {area.radiationPatterns.map(pattern => (
                  <button
                    type="button"
                    key={pattern}
                    disabled={!isEditing || isLoading}
                    onClick={() => {
                      const patterns = data.patterns || [];
                      const updated = patterns.includes(pattern)
                        ? patterns.filter(p => p !== pattern)
                        : [...patterns, pattern];
                      onUpdate(area.id, { patterns: updated });
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      (data.patterns || []).includes(pattern)
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    } ${(!isEditing || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {pattern}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Special Instructions
              </label>
              <textarea
                value={data.note || ''}
                onChange={(e) => onUpdate(area.id, { note: e.target.value })}
                disabled={!isEditing || isLoading}
                placeholder="Any specific notes about this area..."
                className={`w-full h-20 px-3 py-2 text-sm border border-slate-200 rounded-lg 
                  placeholder:text-slate-400 focus:border-[#B07A4E] focus:ring-1 focus:ring-[#B07A4E] 
                  outline-none ${(!isEditing || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);

const TreatmentPreferences = () => {
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedAreas, setSelectedAreas] = useState({});
  const [formData, setFormData] = useState({
    // Provider settings
    defaultDuration: 60,
    bufferTime: 15,
    advanceBooking: 30,
    services: [],
    travelFee: 0,
    // Client preferences (existing state)
    selectedAreas: {},
    generalNotes: ''
  });
  const [expandedAreas, setExpandedAreas] = useState(() => 
    BODY_AREAS.reduce((acc, area) => ({ ...acc, [area.id]: false }), {})
  );
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch('/api/users/profile', {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Failed to load preferences');
        }
  
        const data = await response.json();
  
        if (data.profile?.treatmentPreferences?.bodyAreas) {
          const loadedPreferences = {};
          const bodyAreas = data.profile.treatmentPreferences.bodyAreas;
          
          // Handle both Map and Object formats
          const entries = bodyAreas instanceof Map ? 
            Array.from(bodyAreas.entries()) : 
            Object.entries(bodyAreas);
          
          entries.forEach(([key, value]) => {
            loadedPreferences[key] = {
              pressure: value.pressure || 50,
              conditions: value.conditions || [],
              patterns: value.patterns || [],
              note: value.note || ''
            };
          });
          setSelectedAreas(loadedPreferences);
        }
  
        if (data.registrationStep < 2) {
          navigate('/profile-setup');
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
        setError('Failed to load preferences');
      }
    };
  
    loadPreferences();
  }, [navigate]);

const handleChange = (field, value) => {
  setFormData(prev => ({
    ...prev,
    [field]: value
  }));
};

const handleAreaSelect = useCallback((areaId, updates) => {
  setSelectedAreas(prev => ({
    ...prev,
    [areaId]: {
      ...prev[areaId] || {},
      ...updates
    }
  }));
}, []);

  const toggleExpanded = useCallback((areaId) => {
    setExpandedAreas(prev => ({
      ...prev,
      [areaId]: !prev[areaId]
    }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
  
    try {
      const endpoint = user.accountType === 'PROVIDER' 
        ? '/api/users/provider/preferences'
        : '/api/users/treatment-preferences';
  
      const formattedPreferences = user.accountType === 'PROVIDER' ? {
        defaultDuration: formData.defaultDuration,
        bufferTime: formData.bufferTime,
        advanceBooking: formData.advanceBooking,
        services: formData.services,
        travelFee: formData.travelFee
      } : {
        bodyAreas: Object.entries(selectedAreas).reduce((acc, [key, value]) => {  // Changed this line
          if (value.pressure !== undefined) {
            acc[key] = value;
          }
          return acc;
        }, {})
      };
  
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          preferences: formattedPreferences,
          registrationStep: 3
        })
      });
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save preferences');
      }
  
      // On success:
      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'An error occurred while saving your preferences');
    } finally {
      setIsLoading(false);
    }
  };
  const currentStep = user?.registrationStep || 1;
  const isRegistrationComplete = currentStep >= 3;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-slate-50 py-12">
      <div className="w-full max-w-4xl">
        {!isRegistrationComplete && <ProgressIndicator currentStep={3} />}
        
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex justify-between items-center mb-8">
            <div className="text-center">
              <h2 className="text-2xl font-normal text-slate-700">
                {user.accountType === 'PROVIDER' ? 'Business Preferences' : 'Treatment Preferences'}
              </h2>
              {!isRegistrationComplete && (
                <p className="mt-2 text-slate-500">Step 3 of 3: Customize your experience</p>
              )}
            </div>
            {isRegistrationComplete && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                disabled={isLoading}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg
                  ${isEditing 
                    ? 'text-green-700 bg-green-50 hover:bg-green-100' 
                    : 'text-[#B07A4E] hover:bg-[#B07A4E]/10'} 
                  transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isEditing ? (
                  <>
                    <Check size={18} className="mr-2" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Edit2 size={18} className="mr-2" />
                    Edit
                  </>
                )}
              </button>
            )}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
              <p>{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-400 text-green-700 flex items-center">
              <CheckCircle className="mr-2" size={16} />
              <p>{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {user.accountType === 'PROVIDER' ? (
              <ProviderPreferences 
                formData={formData} 
                onChange={handleChange}
              />
            ) : (
              <div className="space-y-4">
                {BODY_AREAS.map(area => (
                  <TreatmentCard
                    key={area.id}
                    area={area}
                    data={selectedAreas[area.id] || {}}
                    isExpanded={expandedAreas[area.id]}
                    isEditing={!isRegistrationComplete ? true : isEditing}
                    isLoading={isLoading}
                    onToggle={() => toggleExpanded(area.id)}
                    onUpdate={handleAreaSelect}
                  />
                ))}
              </div>
            )}

            <div className="flex justify-between space-x-4 mt-8">
              <button
                type="button"
                onClick={() => isRegistrationComplete ? navigate(-1) : navigate('/profile-setup')}
                disabled={isLoading}
                className={`px-6 py-3 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 
                  transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 
                  focus:ring-slate-500 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Back
              </button>

              <button
                type="submit"
                disabled={isLoading || (user.accountType === 'CLIENT' && Object.keys(selectedAreas).length === 0)}
                className={`
                  flex-1 py-3 px-4 rounded-lg
                  bg-[#B07A4E] hover:bg-[#8A5D36]
                  text-white font-medium
                  transition duration-150 ease-in-out
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#B07A4E]
                  ${(isLoading || (user.accountType === 'CLIENT' && Object.keys(selectedAreas).length === 0)) ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {isLoading ? 'Saving...' : (isRegistrationComplete ? 'Save Changes' : 'Complete Setup')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TreatmentPreferences;
