import React, { useState, useEffect } from 'react';

const SessionConfigWizard = ({
  numSessions,
  setNumSessions,
  sessionDurations,
  setSessionDurations,
  sessionNames,
  setSessionNames,
  wizardStep,
  setWizardStep,
  isConfiguringDurations,
  setIsConfiguringDurations,
  durations
}) => {
  // For occupant name + duration on each step
  const [currentDuration, setCurrentDuration] = useState(null);
  const [currentName, setCurrentName] = useState('');

  useEffect(() => {
    setCurrentDuration(sessionDurations[wizardStep] || null);
    setCurrentName(sessionNames[wizardStep] || '');
  }, [wizardStep, sessionDurations, sessionNames]);

  const handleNext = () => {
    // Save occupant name + duration
    const newDurations = [...sessionDurations];
    newDurations[wizardStep] = currentDuration;
    setSessionDurations(newDurations);

    const newNames = [...sessionNames];
    newNames[wizardStep] = currentName;
    setSessionNames(newNames);

    if (wizardStep < numSessions - 1) {
      setWizardStep(wizardStep + 1);
    } else {
      // Done with multi-session steps
      setIsConfiguringDurations(false);
      setWizardStep(0);
    }
  };

  const handleBack = () => {
    if (wizardStep === 0) {
      // If user wants to cancel multi-session entirely:
      setNumSessions(1);
      setSessionDurations([null]);
      setSessionNames(['']);
      setIsConfiguringDurations(false);
      setWizardStep(0);
    } else {
      setWizardStep(prev => prev - 1);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-slate-900">
            Configure Session {wizardStep + 1}
          </h3>
          <div className="text-sm text-slate-500">
            Step {wizardStep + 1} of {numSessions}
          </div>
        </div>

        {/* Occupant Name Input */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Who is this session for?
          </label>
          <input
            type="text"
            value={currentName}
            onChange={(e) => setCurrentName(e.target.value)}
            placeholder="Aunt Nancy"
            className="w-full p-2 border border-slate-200 rounded-lg"
          />
        </div>

        {/* Duration Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Session Duration
          </label>
          <div className="space-y-2">
            {durations.map(dur => (
              <button
                key={dur.minutes}
                onClick={() => setCurrentDuration(dur.minutes)}
                className={`w-full p-2 rounded-lg text-left transition-all ${
                  currentDuration === dur.minutes
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'border border-slate-200 hover:border-blue-200'
                }`}
              >
                <div className="font-medium">{dur.label}</div>
                <div className="text-xs text-slate-500">{dur.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
          >
            {wizardStep === 0 ? 'Cancel' : 'Back'}
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={currentDuration === null || currentName.trim() === ''}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-cyan-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {wizardStep < numSessions - 1 ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionConfigWizard;
