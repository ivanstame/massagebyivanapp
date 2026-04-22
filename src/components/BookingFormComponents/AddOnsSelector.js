import React from 'react';
import { Plus, Check, Info } from 'lucide-react';

const AddOnsSelector = ({ selectedAddons, onAddonsChange, isComplete, availableAddons = [] }) => {
  const toggleAddon = (addonName) => {
    if (selectedAddons.includes(addonName)) {
      onAddonsChange(selectedAddons.filter(name => name !== addonName));
    } else {
      onAddonsChange([...selectedAddons, addonName]);
    }
  };

  if (availableAddons.length === 0) {
    return null; // Don't render if provider has no add-ons
  }

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      {/* Header */}
      <div className="flex items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <Plus className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Add-ons</h3>
            <p className="text-sm text-slate-600 mt-1">Optional extras to customize your appointment</p>
          </div>
        </div>
      </div>

      {/* Add-ons Grid */}
      <div className="space-y-3">
        {availableAddons.map((addon) => {
          const isSelected = selectedAddons.includes(addon.name);

          return (
            <button
              key={addon.name}
              onClick={() => toggleAddon(addon.name)}
              className={`
                w-full min-h-touch p-4 rounded-lg border-2 transition-all duration-200
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                ${isSelected
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-line bg-paper-elev hover:border-teal-300'
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Toggle indicator */}
                  <div className={`
                    w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
                    ${isSelected
                      ? 'border-teal-600 bg-teal-600'
                      : 'border-slate-300 bg-paper-elev'
                    }
                  `}>
                    {isSelected && <Check className="w-4 h-4 text-white" />}
                  </div>

                  {/* Add-on details */}
                  <div className="text-left">
                    <div className="font-medium text-lg text-slate-900">
                      {addon.name}
                    </div>
                    {addon.description && (
                      <div className="text-sm text-slate-600 mt-1">
                        {addon.description}
                      </div>
                    )}
                    {addon.extraTime > 0 && (
                      <div className="text-xs text-teal-600 mt-1 font-medium">
                        +{addon.extraTime} min added to appointment
                      </div>
                    )}
                  </div>
                </div>

                {/* Price */}
                <div className="text-right">
                  <div className={`text-lg font-semibold ${isSelected ? 'text-teal-700' : 'text-slate-700'}`}>
                    +${addon.price}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Info message */}
      <div className="mt-4 p-3 bg-cream-50 rounded-lg border border-cream-200">
        <div className="flex items-start space-x-2">
          <Info className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-600">
            Add-ons are optional. Your provider will confirm them before the appointment starts.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AddOnsSelector;
