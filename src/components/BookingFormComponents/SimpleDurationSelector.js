import React from 'react';
import { Clock, Check } from 'lucide-react';

const SimpleDurationSelector = ({ selectedDuration, onDurationChange, isComplete, durationOptions = [] }) => {
  if (durationOptions.length === 0) {
    return null;
  }

  const gridCols = durationOptions.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      {/* Header */}
      <div className="flex items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <Clock className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Select a service</h3>
            <p className="text-sm text-slate-600 mt-1">Choose the package that fits you</p>
          </div>
        </div>
      </div>

      {/* Package Options */}
      <div className={`grid grid-cols-1 ${gridCols} gap-4`}>
        {durationOptions.map((option) => {
          const isSelected = selectedDuration === option.duration;
          const primary = option.label && option.label.trim()
            ? option.label
            : `${option.duration} min`;
          const showDurationSub = !!(option.label && option.label.trim());

          return (
            <button
              key={`${option.duration}-${option.label || ''}`}
              onClick={() => onDurationChange(option.duration)}
              className={`
                relative min-h-touch p-4 rounded-lg border-2 transition-all duration-200
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                ${isSelected
                  ? 'border-teal-600 bg-teal-50 shadow-md'
                  : 'border-line bg-paper-elev hover:border-teal-300'
                }
              `}
            >
              <div className="text-center">
                <div className={`text-lg font-semibold leading-tight ${isSelected ? 'text-teal-700' : 'text-slate-900'}`}>
                  {primary}
                </div>
                {showDurationSub && (
                  <div className="text-xs text-slate-500 mt-1">{option.duration} min</div>
                )}
                <div className={`text-2xl font-bold mt-2 ${isSelected ? 'text-teal-600' : 'text-slate-700'}`}>
                  ${option.price}
                </div>
              </div>

              {isSelected && (
                <div className="absolute top-2 right-2">
                  <div className="bg-teal-600 rounded-full p-1">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SimpleDurationSelector;
