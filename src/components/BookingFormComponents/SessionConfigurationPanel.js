import React, { useState, useEffect } from 'react';
import ProgressiveConfigPanel from './ProgressiveConfigPanel';
import BookingSessionSummary from './BookingSessionSummary';

/**
 * SessionConfigurationPanel
 * 
 * A wrapper component that orchestrates the new ProgressiveConfigPanel and BookingSessionSummary components.
 * This component manages the state for session configuration and provides it to the child components.
 */
const SessionConfigurationPanel = ({
  onSessionConfigChange,
  availableDurations,
  isComplete = false,
  selectedAddons = [],
  setSelectedAddons = () => {},
  selectedMassageType = 'focused',
  setSelectedMassageType = () => {}
}) => {
  // Configuration step state
  const [configStep, setConfigStep] = useState('sessions');
  
  // Session configuration state
  const [sessionConfigs, setSessionConfigs] = useState([]);
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);
  
  // Update the parent component when session configurations change
  useEffect(() => {
    if (sessionConfigs.length === 0) return;
    
    if (sessionConfigs.length === 1) {
      // Single session
      const session = sessionConfigs[0];
      onSessionConfigChange({
        numSessions: 1,
        selectedDuration: session.duration,
        sessionDurations: [],
        sessionNames: []
      });
      
      // Update the single session add-ons and massage type
      if (session.addons) setSelectedAddons(session.addons);
      if (session.massageType) setSelectedMassageType(session.massageType);
    } else {
      // Multi-session
      onSessionConfigChange({
        numSessions: sessionConfigs.length,
        selectedDuration: null,
        sessionDurations: sessionConfigs.map(s => s.duration),
        sessionNames: sessionConfigs.map(s => s.recipient?.info?.name || '')
      });
    }
  }, [sessionConfigs, onSessionConfigChange, setSelectedAddons, setSelectedMassageType]);
  
  // Update session configurations when single session props change
  useEffect(() => {
    if (sessionConfigs.length === 1) {
      const updatedConfig = {
        ...sessionConfigs[0],
        addons: selectedAddons,
        massageType: selectedMassageType
      };
      
      setSessionConfigs([updatedConfig]);
    }
  }, [selectedAddons, selectedMassageType]);
  
  // Handle editing a specific session from the summary card
  const handleEditSession = (index) => {
    setActiveSessionIndex(index);
    setConfigStep('duration');
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <ProgressiveConfigPanel
          configStep={configStep}
          setConfigStep={setConfigStep}
          sessionConfigs={sessionConfigs}
          updateSessionConfig={setSessionConfigs}
          activeSessionIndex={activeSessionIndex}
          setActiveSessionIndex={setActiveSessionIndex}
        />
      </div>
      
      <div>
        <BookingSessionSummary
          sessionConfigs={sessionConfigs}
          activeSessionIndex={activeSessionIndex}
          onEditSession={handleEditSession}
        />
      </div>
    </div>
  );
};

export default SessionConfigurationPanel;
