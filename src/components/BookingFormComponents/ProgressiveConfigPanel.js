import React from 'react';
import { CheckCircle, ArrowRight, Users } from 'lucide-react';
import { DURATION_OPTIONS, MASSAGE_TYPES, MASSAGE_ADDONS } from '../../shared/constants/massageOptions';

/**
 * ProgressiveConfigPanel Component
 * 
 * Implements a step-based progressive disclosure approach for session configuration.
 * Users move through a series of steps to configure their session(s).
 * 
 * Props:
 * - configStep: Current configuration step ('sessions', 'duration', 'type', 'addons')
 * - setConfigStep: Function to update the current step
 * - sessionConfigs: Array of session configurations
 * - updateSessionConfig: Function to update the session configurations
 * - activeSessionIndex: Index of the currently active session being configured
 * - setActiveSessionIndex: Function to update the active session index
 */
const ProgressiveConfigPanel = ({ 
  configStep, 
  setConfigStep,
  sessionConfigs,
  updateSessionConfig,
  activeSessionIndex,
  setActiveSessionIndex
}) => {
  const activeSession = sessionConfigs[activeSessionIndex] || {};
  
  // Navigate to the next step in the configuration process
  const handleContinue = () => {
    const steps = ['sessions', 'duration', 'type', 'addons'];
    const currentIndex = steps.indexOf(configStep);
    if (currentIndex < steps.length - 1) {
      setConfigStep(steps[currentIndex + 1]);
    }
  };
  
  // Navigate to the previous step in the configuration process
  const handleBack = () => {
    const steps = ['sessions', 'duration', 'type', 'addons'];
    const currentIndex = steps.indexOf(configStep);
    if (currentIndex > 0) {
      setConfigStep(steps[currentIndex - 1]);
    }
  };
  
  // Update the active session configuration
  const updateActiveSession = (updates) => {
    const newConfigs = [...sessionConfigs];
    newConfigs[activeSessionIndex] = {
      ...newConfigs[activeSessionIndex],
      ...updates
    };
    updateSessionConfig(newConfigs);
  };
  
  // Initialize session configurations based on number of sessions
  const initializeSessionConfigs = (numSessions) => {
    const newConfigs = Array(numSessions).fill().map(() => ({
      duration: null,
      massageType: 'focused',
      addons: [],
      recipient: { type: 'self', info: {} }
    }));
    updateSessionConfig(newConfigs);
    setActiveSessionIndex(0);
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
      {/* Step indicator */}
      {sessionConfigs.length > 0 && (
        <div className="flex justify-between mb-4 text-sm">
          {['Sessions', 'Duration', 'Type', 'Add-ons'].map((step, index) => {
            const steps = ['sessions', 'duration', 'type', 'addons'];
            const isCurrent = configStep === steps[index];
            const isCompleted = steps.indexOf(configStep) > index;
            
            return (
              <div 
                key={step} 
                className={`flex items-center ${isCurrent ? 'text-blue-600 font-medium' : isCompleted ? 'text-green-600' : 'text-slate-400'}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-1 ${
                  isCurrent ? 'bg-blue-100 text-blue-600 border border-blue-300' : 
                  isCompleted ? 'bg-green-100 text-green-600 border border-green-300' : 
                  'bg-slate-100 text-slate-400 border border-slate-200'
                }`}>
                  {isCompleted ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="hidden sm:inline">{step}</span>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Sessions Step */}
      {configStep === 'sessions' && (
        <div>
          <div className="flex items-center mb-3 border-b pb-2">
            <Users className="w-5 h-5 text-blue-500 mr-2" />
            <h2 className="font-medium">Number of Sessions</h2>
          </div>
          
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[1, 2, 3, 4].map(num => (
              <button
                key={num}
                onClick={() => initializeSessionConfigs(num)}
                className={`p-3 rounded-md text-center transition-colors ${
                  sessionConfigs.length === num 
                    ? 'bg-blue-100 border-blue-300 border-2 text-blue-700' 
                    : 'border border-slate-200 hover:border-blue-200'
                }`}
              >
                {num} {num === 1 ? 'Session' : 'Sessions'}
              </button>
            ))}
          </div>
          
          <button 
            onClick={handleContinue}
            disabled={!sessionConfigs.length}
            className="w-full py-2 bg-blue-600 text-white rounded-md disabled:bg-slate-300 disabled:text-slate-500 flex items-center justify-center"
          >
            Continue <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      )}
      
      {/* Duration Step */}
      {configStep === 'duration' && (
        <div>
          <div className="flex items-center mb-3 border-b pb-2">
            <h2 className="font-medium">Select Duration</h2>
            {sessionConfigs.length > 1 && (
              <div className="ml-auto text-sm text-blue-600">
                Session {activeSessionIndex + 1} of {sessionConfigs.length}
              </div>
            )}
          </div>
          
          {sessionConfigs.length > 1 && (
            <div className="flex mb-3 overflow-x-auto pb-2">
              {sessionConfigs.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveSessionIndex(index)}
                  className={`px-3 py-1 mr-2 rounded-full text-sm ${
                    index === activeSessionIndex 
                      ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Session {index + 1}
                </button>
              ))}
            </div>
          )}
          
          <div className="space-y-2 mb-4">
            {DURATION_OPTIONS.map(duration => (
              <button
                key={duration.id}
                onClick={() => updateActiveSession({ duration: duration.minutes })}
                className={`w-full p-3 rounded-md text-left transition-colors flex justify-between items-center ${
                  activeSession.duration === duration.minutes
                    ? 'bg-blue-50 border-blue-200 border text-blue-700'
                    : 'border border-slate-200 hover:border-blue-200'
                }`}
              >
                <div>
                  <div className="font-medium">{duration.label}</div>
                  <div className="text-xs text-slate-500">{duration.description}</div>
                </div>
                <div className="text-green-600 font-medium">${duration.price}</div>
              </button>
            ))}
          </div>
          
          <div className="flex justify-between">
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
            >
              Back
            </button>
            
            <button 
              onClick={handleContinue}
              disabled={!activeSession.duration}
              className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-slate-300 disabled:text-slate-500 flex items-center"
            >
              Continue <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}
      
      {/* Massage Type Step */}
      {configStep === 'type' && (
        <div>
          <div className="flex items-center mb-3 border-b pb-2">
            <h2 className="font-medium">Select Massage Type</h2>
            {sessionConfigs.length > 1 && (
              <div className="ml-auto text-sm text-blue-600">
                Session {activeSessionIndex + 1} of {sessionConfigs.length}
              </div>
            )}
          </div>
          
          {sessionConfigs.length > 1 && (
            <div className="flex mb-3 overflow-x-auto pb-2">
              {sessionConfigs.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveSessionIndex(index)}
                  className={`px-3 py-1 mr-2 rounded-full text-sm ${
                    index === activeSessionIndex 
                      ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Session {index + 1}
                </button>
              ))}
            </div>
          )}
          
          <div className="space-y-3 mb-4">
            {MASSAGE_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => updateActiveSession({ massageType: type.id })}
                className={`w-full p-3 rounded-md text-left transition-colors ${
                  activeSession.massageType === type.id
                    ? 'bg-blue-50 border-blue-200 border text-blue-700'
                    : 'border border-slate-200 hover:border-blue-200'
                }`}
              >
                <div className="font-medium">{type.name}</div>
                <div className="text-sm text-slate-600">{type.shortDescription}</div>
              </button>
            ))}
          </div>
          
          <div className="flex justify-between">
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
            >
              Back
            </button>
            
            <button 
              onClick={handleContinue}
              className="px-4 py-2 bg-blue-600 text-white rounded-md flex items-center"
            >
              Continue <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}
      
      {/* Add-ons Step */}
      {configStep === 'addons' && (
        <div>
          <div className="flex items-center mb-3 border-b pb-2">
            <h2 className="font-medium">Select Add-ons (Optional)</h2>
            {sessionConfigs.length > 1 && (
              <div className="ml-auto text-sm text-blue-600">
                Session {activeSessionIndex + 1} of {sessionConfigs.length}
              </div>
            )}
          </div>
          
          {sessionConfigs.length > 1 && (
            <div className="flex mb-3 overflow-x-auto pb-2">
              {sessionConfigs.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveSessionIndex(index)}
                  className={`px-3 py-1 mr-2 rounded-full text-sm ${
                    index === activeSessionIndex 
                      ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Session {index + 1}
                </button>
              ))}
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {MASSAGE_ADDONS.map(addon => {
              const isSelected = activeSession.addons?.includes(addon.id);
              
              return (
                <button
                  key={addon.id}
                  onClick={() => {
                    const currentAddons = activeSession.addons || [];
                    const newAddons = isSelected
                      ? currentAddons.filter(id => id !== addon.id)
                      : [...currentAddons, addon.id];
                    
                    updateActiveSession({ addons: newAddons });
                  }}
                  className={`p-3 rounded-md text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-blue-200 border text-blue-700'
                      : 'border border-slate-200 hover:border-blue-200'
                  }`}
                >
                  <div className="flex justify-between">
                    <div className="font-medium">{addon.name}</div>
                    <div className="text-green-600">+${addon.price}</div>
                  </div>
                  <div className="text-sm text-slate-600">{addon.description}</div>
                  {addon.extraTime > 0 && (
                    <div className="text-xs text-amber-600 mt-1">
                      +{addon.extraTime} minutes
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          
          <div className="flex justify-between">
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
            >
              Back
            </button>
            
            <button 
              onClick={() => {
                // If there are more sessions to configure and this is not the last one
                if (sessionConfigs.length > 1 && activeSessionIndex < sessionConfigs.length - 1) {
                  setActiveSessionIndex(activeSessionIndex + 1);
                  setConfigStep('duration');
                } else {
                  // We're done with configuration
                  setConfigStep('complete');
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-md flex items-center"
            >
              {sessionConfigs.length > 1 && activeSessionIndex < sessionConfigs.length - 1 
                ? 'Next Session' 
                : 'Complete'}
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}
      
      {/* Complete Step - Summary of all sessions */}
      {configStep === 'complete' && (
        <div>
          <div className="flex items-center mb-3 border-b pb-2">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            <h2 className="font-medium">Configuration Complete</h2>
          </div>
          
          <div className="text-center text-green-600 mb-4">
            Your {sessionConfigs.length > 1 ? 'sessions have' : 'session has'} been configured successfully!
          </div>
          
          <button
            onClick={() => setConfigStep('sessions')}
            className="w-full py-2 bg-blue-600 text-white rounded-md"
          >
            Edit Configuration
          </button>
        </div>
      )}
    </div>
  );
};

export default ProgressiveConfigPanel;
