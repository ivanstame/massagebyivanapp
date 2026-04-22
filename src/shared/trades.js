// Trade presets drive placeholder copy and starter-package suggestions across
// the Services page, provider onboarding, and (later) any trade-aware polish
// on the client booking flow. The booking flow itself stays copy-neutral —
// trades influence defaults and hints, not core terminology.

export const TRADES = {
  massage: {
    key: 'massage',
    displayName: 'Massage therapy',
    providerNoun: 'therapist',
    packagePlaceholder: 'e.g. 60-min Deep Tissue, 90-min Swedish, Prenatal',
    addonNamePlaceholder: 'e.g. Hot stones, Aromatherapy, CBD oil',
    addonExamples: 'hot stones, aromatherapy, CBD oil',
    starterPackages: [
      { duration: 60, price: 0, label: '60-min Deep Tissue' },
      { duration: 90, price: 0, label: '90-min Swedish' },
    ],
  },
  esthetics: {
    key: 'esthetics',
    displayName: 'Esthetics & skincare',
    providerNoun: 'esthetician',
    packagePlaceholder: 'e.g. Classic Facial, Hydrafacial, Brow shaping',
    addonNamePlaceholder: 'e.g. LED therapy, Extractions, Brow tint',
    addonExamples: 'LED therapy, extractions, brow tint',
    starterPackages: [
      { duration: 60, price: 0, label: 'Classic Facial' },
      { duration: 75, price: 0, label: 'Hydrafacial' },
    ],
  },
  detailing: {
    key: 'detailing',
    displayName: 'Auto detailing',
    providerNoun: 'detailer',
    packagePlaceholder: 'e.g. Basic Wash, Full Detail, Premium Detail',
    addonNamePlaceholder: 'e.g. Interior shampoo, Headlight restoration, Ceramic spray',
    addonExamples: 'interior shampoo, headlight restoration, ceramic spray',
    starterPackages: [
      { duration: 60, price: 0, label: 'Basic Wash' },
      { duration: 120, price: 0, label: 'Full Detail' },
    ],
  },
  training: {
    key: 'training',
    displayName: 'Personal training',
    providerNoun: 'trainer',
    packagePlaceholder: 'e.g. 60-min Strength, 45-min HIIT, Mobility',
    addonNamePlaceholder: 'e.g. Body comp check, Nutrition review',
    addonExamples: 'body comp check, nutrition review',
    starterPackages: [
      { duration: 60, price: 0, label: '60-min Training' },
    ],
  },
  grooming: {
    key: 'grooming',
    displayName: 'Pet grooming',
    providerNoun: 'groomer',
    packagePlaceholder: 'e.g. Bath & Tidy, Full Groom, Nail trim',
    addonNamePlaceholder: 'e.g. Teeth brushing, De-shed, Flea treatment',
    addonExamples: 'teeth brushing, de-shed, flea treatment',
    starterPackages: [
      { duration: 45, price: 0, label: 'Bath & Tidy' },
      { duration: 90, price: 0, label: 'Full Groom' },
    ],
  },
  other: {
    key: 'other',
    displayName: 'Other',
    providerNoun: 'provider',
    packagePlaceholder: 'e.g. Standard service, Premium package',
    addonNamePlaceholder: 'e.g. Add-on name',
    addonExamples: 'hot stones, aromatherapy, brow tint, interior shampoo',
    starterPackages: [
      { duration: 60, price: 0, label: '' },
    ],
  },
};

export const TRADE_KEYS = Object.keys(TRADES);

export const getTrade = (key) => TRADES[key] || TRADES.other;
