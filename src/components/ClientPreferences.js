import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';

const ProgressIndicator = ({ currentStep }) => (
  <div className="mb-8 w-full max-w-2xl">
    <div className="flex justify-between mb-2">
      <div className={`text-sm font-medium ${currentStep >= 1 ? 'text-[#009ea5]' : 'text-slate-400'}`}>
        Account
      </div>
      <div className={`text-sm font-medium ${currentStep >= 2 ? 'text-[#009ea5]' : 'text-slate-400'}`}>
        Profile
      </div>
      <div className={`text-sm font-medium ${currentStep >= 3 ? 'text-[#009ea5]' : 'text-slate-400'}`}>
        Preferences
      </div>
    </div>
    <div className="h-1 bg-slate-100 rounded-full">
      <div 
        className="h-full bg-[#009ea5] rounded-full transition-all duration-500"
        style={{ width: `${(currentStep / 3) * 100}%` }}
      />
    </div>
  </div>
);

const ClientPreferences = () => {
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [preferences, setPreferences] = useState({
    primaryArea: '',
    pressureLevel: 'medium',
    notes: ''
  });

  const handleChange = (field, value) => {
    setPreferences(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/users/treatment-preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          preferences: {
            bodyAreas: {
              general: {
                pressure: preferences.pressureLevel === 'gentle' ? 30 : preferences.pressureLevel === 'medium' ? 50 : 70,
                note: preferences.notes,
                conditions: preferences.primaryArea ? [preferences.primaryArea] : [],
                patterns: []
              }
            }
          },
          registrationStep: 3
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save preferences');
      }

      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'An error occurred while saving your preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      // Update registration step without saving preferences
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          registrationStep: 3
        })
      });

      const data = await response.json();
      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError('Failed to skip preferences');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-md">
        <ProgressIndicator currentStep={3} />
        
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-normal text-slate-700">Treatment Preferences</h2>
            <p className="mt-2 text-slate-500">Step 3 of 3: Help your therapist understand your needs</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Primary Area of Concern
              </label>
              <select
                value={preferences.primaryArea}
                onChange={(e) => handleChange('primaryArea', e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#009ea5]"
              >
                <option value="">Select an area</option>
                <option value="neck_shoulders">Neck & Shoulders</option>
                <option value="upper_back">Upper Back</option>
                <option value="lower_back">Lower Back</option>
                <option value="full_body">Full Body</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Preferred Pressure Level
              </label>
              <div className="space-y-2">
                {['gentle', 'medium', 'firm'].map(level => (
                  <label key={level} className="flex items-center">
                    <input
                      type="radio"
                      name="pressureLevel"
                      value={level}
                      checked={preferences.pressureLevel === level}
                      onChange={(e) => handleChange('pressureLevel', e.target.value)}
                      className="form-radio h-4 w-4 text-[#009ea5]"
                    />
                    <span className="ml-2 text-slate-700 capitalize">{level}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Additional Notes (Optional)
              </label>
              <textarea
                value={preferences.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Any specific instructions or concerns for your therapist..."
                className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#009ea5] h-24"
              />
            </div>

            <div className="flex justify-between space-x-4">
              <button
                type="button"
                onClick={handleSkip}
                disabled={isLoading}
                className="px-6 py-3 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-50"
              >
                Skip for Now
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-3 rounded-md bg-[#009ea5] hover:bg-[#2c5f60] text-white font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#009ea5] disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ClientPreferences;