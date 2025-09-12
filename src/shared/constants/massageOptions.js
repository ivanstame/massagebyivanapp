/**
 * Shared constants for massage types and add-ons
 * Used by both frontend and backend for consistency
 */

// Massage types
export const MASSAGE_TYPES = [
  {
    id: 'focused',
    name: 'Focused Therapeutic',
    description: 'Targeted massage for pain, mobility issues, or rehab. Uses Physical Therapy techniques to address specific problem areas.',
    shortDescription: 'Targeted relief for specific pain points'
  },
  {
    id: 'deep',
    name: 'General Deep Tissue',
    description: 'Intense pressure to release deep muscle tension and stiffness throughout the body. Ideal for chronic tension patterns.',
    shortDescription: 'Firm pressure for tension release'
  },
  {
    id: 'relaxation',
    name: 'Relaxation Flow',
    description: 'Lomi-lomi-inspired massage to reduce stress and anxiety with long, flowing strokes that promote deep relaxation.',
    shortDescription: 'Gentle, flowing strokes for relaxation'
  }
];

// Massage add-ons
export const MASSAGE_ADDONS = [
  { 
    id: 'theragun', 
    name: 'TheraGun', 
    price: 10, 
    description: 'Percussive therapy for muscle relief',
    extraTime: 0
  },
  { 
    id: 'hotstone', 
    name: 'Hot Stone', 
    price: 20, 
    description: 'Warm stones to relax muscles',
    extraTime: 0
  },
  { 
    id: 'bamboo', 
    name: 'Warm Bamboo', 
    price: 30, 
    description: 'Heated bamboo for deep relaxation',
    extraTime: 0
  }
];

// Duration options
export const DURATION_OPTIONS = [
  { id: '60', minutes: 60, label: '60 min', price: 125 },
  { id: '90', minutes: 90, label: '90 min', price: 180 },
  { id: '120', minutes: 120, label: '120 min', price: 250 }
];

// Helper functions
export const getMassageTypeName = (typeId) => {
  if (!typeId) return 'Standard';
  const massageType = MASSAGE_TYPES.find(type => type.id === typeId);
  return massageType ? massageType.name : 'Standard';
};

export const getAddonDetails = (addonId) => {
  return MASSAGE_ADDONS.find(addon => addon.id === addonId);
};

export const calculateExtraTime = (addons = []) => {
  return addons.reduce((total, addonId) => {
    const addon = getAddonDetails(addonId);
    return total + (addon ? addon.extraTime : 0);
  }, 0);
};

export const calculateBasePrice = (durationMinutes) => {
  const durationOption = DURATION_OPTIONS.find(option => option.minutes === durationMinutes);
  return durationOption ? durationOption.price : 0;
};

export const calculateAddonsPrice = (addons = []) => {
  return addons.reduce((total, addonId) => {
    const addon = getAddonDetails(addonId);
    return total + (addon ? addon.price : 0);
  }, 0);
};

export const calculateTotalPrice = (durationMinutes, addons = []) => {
  return calculateBasePrice(durationMinutes) + calculateAddonsPrice(addons);
};
