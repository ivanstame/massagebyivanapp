import React from 'react';
import { Clock, Check } from 'lucide-react';
import { DURATION_OPTIONS } from '../../shared/constants/massageOptions';

const SimpleDurationSelector = ({ selectedDuration, onDurationChange, isComplete }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      {/* Header */}
      <div className="flex items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <Clock className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Select Massage Duration</h3>
            <p className="text-sm text-slate-600 mt-1">Choose your preferred session length</p>
          </div>
        </div>
      </div>

      {/* Duration Options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {DURATION_OPTIONS.map((option) => {
          const isSelected = selectedDuration === option.minutes;
          const isRecommended = option.minutes === 90;

          return (
            <button
              key={option.id}
              onClick={() => onDurationChange(option.minutes)}
              className={`
                relative min-h-touch p-4 rounded-lg border-2 transition-all duration-200
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                ${isSelected
                  ? 'border-teal-600 bg-teal-50 shadow-md'
                  : 'border-slate-200 bg-white hover:border-teal-300'
                }
              `}
            >
              
              {isRecommended && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                  <span className="bg-copper-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Duration content */}
              <div className="text-center mt-2">
                <div className={`text-2xl font-bold ${isSelected ? 'text-teal-700' : 'text-slate-900'}`}>
                  {option.label}
                </div>
                <div className={`text-lg mt-2 ${isSelected ? 'text-teal-600' : 'text-slate-600'}`}>
                  ${option.price}
                </div>
              </div>

              {/* Selected indicator */}
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

      {/* Help text */}
      <p className="text-sm text-slate-500 mt-4 text-center">
        All sessions include setup time and consultation
      </p>
    </div>
  );
};

export default SimpleDurationSelector;
