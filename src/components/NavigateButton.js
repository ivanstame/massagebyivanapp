import React from 'react';
import { Navigation } from 'lucide-react';

// One-tap navigation handoff to the device's native maps app.
//
// iOS  → Apple Maps (maps.apple.com universal link, opens Apple Maps when
//        installed, falls back to web map view otherwise).
// Other → Google Maps directions URL — works on Android (opens app via
//        intent), desktop browsers, and as a web fallback on iOS if the
//        user has Google Maps installed and prefers it.
//
// Prefers lat/lng when available (no geocoding round-trip on the maps
// app side), falls back to the address string. Renders nothing when
// neither is available — fail quietly rather than show a dead button.
const isIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
};

const buildUrl = (location) => {
  const { lat, lng, address } = location || {};
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  if (isIOS()) {
    // Apple Maps universal link. `daddr` = destination; `dirflg=d` = drive.
    if (hasCoords) {
      return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    }
    return `https://maps.apple.com/?daddr=${encodeURIComponent(address || '')}&dirflg=d`;
  }

  // Google Maps directions API URL — opens the Maps app on Android via
  // intent, opens maps.google.com on desktop.
  const params = hasCoords
    ? `destination=${lat},${lng}`
    : `destination=${encodeURIComponent(address || '')}`;
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&${params}`;
};

const NavigateButton = ({
  location,
  variant = 'inline', // 'inline' (compact pill) or 'block' (full-width button)
  label = 'Navigate',
  className = '',
}) => {
  if (!location) return null;
  const hasCoords = typeof location.lat === 'number' && typeof location.lng === 'number';
  if (!hasCoords && !location.address) return null;

  const url = buildUrl(location);

  if (variant === 'block') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] text-sm font-medium transition-colors ${className}`}
      >
        <Navigation className="w-4 h-4" />
        {label}
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#B07A4E] hover:text-white hover:bg-[#B07A4E] border border-[#B07A4E] rounded-full transition-colors ${className}`}
      title="Open turn-by-turn directions"
    >
      <Navigation className="w-3.5 h-3.5" />
      {label}
    </a>
  );
};

export default NavigateButton;
