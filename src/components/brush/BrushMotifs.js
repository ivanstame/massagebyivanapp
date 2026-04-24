// Brush motif library — echoes the logo's organic stroke.
// Adapted from the Atelier design bundle.
import React from 'react';

export const BrushCircle = ({ size = 120, color = 'currentColor', stroke = 8, opacity = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: 'block', opacity }}>
    <defs>
      <filter id={`rough-${size}`} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence baseFrequency="0.85" numOctaves="2" seed="3" />
        <feDisplacementMap in="SourceGraphic" scale="2" />
      </filter>
    </defs>
    <path
      d="M 60 10 C 30 10 10 30 10 60 C 10 90 30 110 60 110 C 90 110 110 90 110 60 C 110 40 100 22 82 14"
      fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round"
      filter={`url(#rough-${size})`}
    />
  </svg>
);

export const BrushStroke = ({ width = 200, height = 18, color = 'currentColor', opacity = 1 }) => (
  <svg width={width} height={height} viewBox="0 0 200 18" preserveAspectRatio="none" style={{ display: 'block', opacity }}>
    <defs>
      <filter id="bs-rough" x="-5%" y="-20%" width="110%" height="140%">
        <feTurbulence baseFrequency="1.2" numOctaves="2" seed="5" />
        <feDisplacementMap in="SourceGraphic" scale="1.5" />
      </filter>
    </defs>
    <path
      d="M 4 9 C 40 4, 80 14, 120 8 S 180 10, 196 8"
      fill="none" stroke={color} strokeWidth="3.5"
      strokeLinecap="round"
      filter="url(#bs-rough)"
    />
    <path
      d="M 10 12 C 60 9, 100 11, 160 10"
      fill="none" stroke={color} strokeWidth="1.2"
      strokeLinecap="round" opacity="0.5"
    />
  </svg>
);

export const BrushLeaf = ({ size = 40, color = 'currentColor', opacity = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', opacity }}>
    <g fill={color}>
      <path d="M 8 28 C 10 18, 18 12, 24 14 C 22 22, 16 28, 8 28 Z" opacity="0.85" />
      <path d="M 20 30 C 24 22, 30 18, 34 20 C 32 28, 26 32, 20 30 Z" opacity="1" />
      <path d="M 14 32 C 16 26, 22 24, 26 26" stroke={color} strokeWidth="0.8" fill="none" opacity="0.5" />
    </g>
  </svg>
);

export const BrushBlob = ({ width = 400, height = 400, color = 'currentColor', opacity = 0.1 }) => (
  <svg width={width} height={height} viewBox="0 0 400 400" style={{ display: 'block' }}>
    <defs>
      <filter id="bb-rough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence baseFrequency="0.015" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="30" />
      </filter>
    </defs>
    <path
      d="M 200 30 C 280 30, 360 90, 360 180 C 360 270, 300 350, 210 360 C 110 370, 40 300, 40 200 C 40 110, 120 30, 200 30 Z"
      fill={color} opacity={opacity}
      filter="url(#bb-rough)"
    />
  </svg>
);

