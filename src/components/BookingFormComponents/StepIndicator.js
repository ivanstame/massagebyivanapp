import React from 'react';
import { Check } from 'lucide-react';

const StepIndicator = ({ steps, currentStep }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-slate-200">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = step.isComplete;
          const isCurrent = currentStep === index;
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium
                    transition-all duration-300 ease-in-out
                    ${
                      isCompleted
                        ? 'bg-sage-600 text-white'
                        : isCurrent
                        ? 'bg-sage-100 text-sage-700 border-2 border-sage-600'
                        : 'bg-slate-100 text-slate-400 border-2 border-slate-200'
                    }
                  `}
                >
                  {isCompleted ? (
                    <Check className="w-6 h-6" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={`
                    mt-2 text-sm font-medium text-center hidden sm:block
                    ${
                      isCompleted || isCurrent
                        ? 'text-sage-700'
                        : 'text-slate-400'
                    }
                  `}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`
                    flex-1 h-1 mx-4 transition-all duration-300 ease-in-out
                    ${
                      isCompleted
                        ? 'bg-sage-600'
                        : 'bg-slate-200'
                    }
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      {/* Mobile view - show current step name */}
      <div className="mt-4 text-center sm:hidden">
        <p className="text-sage-700 font-medium text-lg">
          Step {currentStep + 1}: {steps[currentStep]?.label}
        </p>
      </div>
    </div>
  );
};

export default StepIndicator;
