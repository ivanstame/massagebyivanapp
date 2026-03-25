import React from 'react';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';

const PAYMENT_METHOD_CONFIG = {
  cash: { label: 'Cash', icon: Banknote, description: 'Pay in person' },
  zelle: { label: 'Zelle', icon: Smartphone, description: 'Bank transfer' },
  venmo: { label: 'Venmo', icon: Smartphone, description: 'Venmo payment' },
  card: { label: 'Card', icon: CreditCard, description: 'Credit/Debit card' },
};

const PaymentMethodSelector = ({
  selectedMethod,
  onMethodChange,
  acceptedMethods = ['cash'],
  isComplete = false,
}) => {
  const methods = acceptedMethods
    .filter(m => PAYMENT_METHOD_CONFIG[m])
    .map(m => ({ id: m, ...PAYMENT_METHOD_CONFIG[m] }));

  if (methods.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Payment Method</h3>
        {isComplete && (
          <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded-full">
            Selected
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {methods.map(({ id, label, icon: Icon, description }) => (
          <button
            key={id}
            type="button"
            onClick={() => onMethodChange(id)}
            className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left
              ${selectedMethod === id
                ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-200'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 ${
              selectedMethod === id ? 'text-teal-600' : 'text-slate-400'
            }`} />
            <div>
              <p className={`text-sm font-medium ${
                selectedMethod === id ? 'text-teal-900' : 'text-slate-700'
              }`}>{label}</p>
              <p className="text-xs text-slate-500">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PaymentMethodSelector;
