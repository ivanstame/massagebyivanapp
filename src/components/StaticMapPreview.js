import React from 'react';

/**
 * Renders a static Google Map image showing a pin at the given location.
 * Uses the Static Maps API — no JS map load needed.
 */
const StaticMapPreview = ({ lat, lng, width = 300, height = 150, zoom = 15, className = '' }) => {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !lat || !lng) return null;

  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&scale=2&markers=color:red%7C${lat},${lng}&key=${apiKey}`;

  return (
    <img
      src={src}
      alt="Appointment location"
      width={width}
      height={height}
      className={`rounded-lg ${className}`}
      loading="lazy"
    />
  );
};

export default StaticMapPreview;
