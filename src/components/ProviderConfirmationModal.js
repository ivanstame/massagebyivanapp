import React from 'react';
import { MapPin, AlertCircle, UserPlus, CheckCircle } from 'lucide-react';

const ProviderConfirmationModal = ({ provider, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
      {/* Success Icon */}
      <div className="text-center mb-6">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900">
          Registration Successful!
        </h3>
        <p className="mt-2 text-slate-600">
          Welcome to {provider.businessName}'s client portal
        </p>
      </div>

      <div className="flex items-start mb-6 p-3 bg-amber-50 rounded-lg">
        <AlertCircle className="w-5 h-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700">
          Next, you'll set up your profile and treatment preferences to help customize 
          your massage experience. This will only take a few minutes.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row-reverse gap-3">
        <button
          onClick={onConfirm}
          className="flex-1 py-2 px-4 bg-[#009ea5] text-white rounded-md 
            hover:bg-[#2c5f60] transition-colors"
        >
          Continue Setup
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2 px-4 border border-slate-300 text-slate-700 
            rounded-md hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

export default ProviderConfirmationModal;