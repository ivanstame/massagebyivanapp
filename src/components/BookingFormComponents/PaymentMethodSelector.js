import React from 'react';
import { Banknote, CreditCard, Smartphone, Layers } from 'lucide-react';

const PAYMENT_METHOD_CONFIG = {
  cash: { label: 'Cash', icon: Banknote, description: 'Pay in person' },
  zelle: { label: 'Zelle', icon: Smartphone, description: 'Bank transfer' },
  venmo: { label: 'Venmo', icon: Smartphone, description: 'Venmo payment' },
  card: { label: 'Card', icon: CreditCard, description: 'Credit/Debit card' },
};

// PaymentMethodSelector now also accepts a list of redeemable packages
// (filtered by the parent to match the selected duration). When the client
// picks one, the parent should set selectedMethod='package' and store the
// package id in selectedPackageId so the booking submit can attach it.
const PaymentMethodSelector = ({
  selectedMethod,
  onMethodChange,
  acceptedMethods = ['cash'],
  isComplete = false,
  redeemablePackages = [],
  selectedPackageId = null,
  onPackageSelect = () => {},
}) => {
  const methods = acceptedMethods
    .filter(m => PAYMENT_METHOD_CONFIG[m])
    .map(m => ({ id: m, ...PAYMENT_METHOD_CONFIG[m] }));

  if (methods.length === 0 && redeemablePackages.length === 0) return null;

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Payment Method</h3>
        {isComplete && (
          <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded-full">
            Selected
          </span>
        )}
      </div>

      {/* Package credit options — surfaced first when available since they're
          essentially "already paid." Selecting one switches selectedMethod to
          'package' and records which specific package the credit comes from. */}
      {redeemablePackages.length > 0 && (
        <div className="mb-3 space-y-2">
          {redeemablePackages.map(pkg => {
            const isSelected = selectedMethod === 'package' && selectedPackageId === pkg._id;
            return (
              <button
                key={pkg._id}
                type="button"
                onClick={() => {
                  onMethodChange('package');
                  onPackageSelect(pkg._id);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left
                  ${isSelected
                    ? 'border-[#B07A4E] bg-[#B07A4E]/5 ring-1 ring-[#B07A4E]/30'
                    : 'border-line hover:border-slate-300 hover:bg-paper-deep'
                  }`}
              >
                <Layers className={`w-5 h-5 flex-shrink-0 ${
                  isSelected ? 'text-[#B07A4E]' : 'text-slate-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    isSelected ? 'text-[#8A5D36]' : 'text-slate-700'
                  }`}>
                    Use package credit
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {pkg.name} · {pkg.sessionsRemaining} of {pkg.sessionsTotal} remaining
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {methods.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {methods.map(({ id, label, icon: Icon, description }) => {
            const isSelected = selectedMethod === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onMethodChange(id);
                  onPackageSelect(null); // clear any prior package pick
                }}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left
                  ${isSelected
                    ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-200'
                    : 'border-line hover:border-slate-300 hover:bg-paper-deep'
                  }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${
                  isSelected ? 'text-teal-600' : 'text-slate-400'
                }`} />
                <div>
                  <p className={`text-sm font-medium ${
                    isSelected ? 'text-teal-900' : 'text-slate-700'
                  }`}>{label}</p>
                  <p className="text-xs text-slate-500">{description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PaymentMethodSelector;
