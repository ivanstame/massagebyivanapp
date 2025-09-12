import React from 'react';
import { User, Users, Check, Phone, Mail, UserCircle } from 'lucide-react';

const RecipientSection = ({ 
  recipientType, 
  setRecipientType, 
  recipientInfo, 
  setRecipientInfo,
  isComplete 
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
      {/* Header */}
      <div className="flex items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <Users className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Who is this massage for?</h3>
            <p className="text-sm text-slate-600 mt-1">Select the recipient of this service</p>
          </div>
        </div>
      </div>

      {/* Recipient Options */}
      <div className="space-y-3">
        {/* For myself option */}
        <button
          onClick={() => setRecipientType('self')}
          className={`
            w-full min-h-touch p-4 rounded-lg border-2 transition-all duration-200
            hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
            ${recipientType === 'self'
              ? 'border-teal-600 bg-teal-50'
              : 'border-slate-200 bg-white hover:border-teal-300'
            }
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                ${recipientType === 'self' ? 'bg-teal-600' : 'bg-teal-100'}
              `}>
                <User className={`w-5 h-5 ${recipientType === 'self' ? 'text-white' : 'text-teal-700'}`} />
              </div>
              <div className="text-left">
                <div className={`font-medium text-lg ${recipientType === 'self' ? 'text-teal-900' : 'text-slate-900'}`}>
                  For myself
                </div>
                <div className="text-sm text-slate-600">
                  Use my account information
                </div>
              </div>
            </div>
            {recipientType === 'self' && (
              <Check className="w-5 h-5 text-teal-600" />
            )}
          </div>
        </button>

        {/* For someone else option */}
        <button
          onClick={() => setRecipientType('other')}
          className={`
            w-full min-h-touch p-4 rounded-lg border-2 transition-all duration-200
            hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
            ${recipientType === 'other'
              ? 'border-teal-600 bg-teal-50'
              : 'border-slate-200 bg-white hover:border-teal-300'
            }
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                ${recipientType === 'other' ? 'bg-teal-600' : 'bg-teal-100'}
              `}>
                <Users className={`w-5 h-5 ${recipientType === 'other' ? 'text-white' : 'text-teal-700'}`} />
              </div>
              <div className="text-left">
                <div className={`font-medium text-lg ${recipientType === 'other' ? 'text-teal-900' : 'text-slate-900'}`}>
                  For someone else
                </div>
                <div className="text-sm text-slate-600">
                  Gift or book for another person
                </div>
              </div>
            </div>
            {recipientType === 'other' && (
              <Check className="w-5 h-5 text-teal-600" />
            )}
          </div>
        </button>
      </div>

      {/* Recipient Information Form */}
      {recipientType === 'other' && (
        <div className="mt-6 p-4 bg-cream-50 rounded-lg border border-cream-200">
          <h4 className="font-medium text-lg text-slate-900 mb-4">Recipient Information</h4>
          
          <div className="space-y-4">
            {/* Name input */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 mb-2">
                <UserCircle className="w-4 h-4 mr-2 text-teal-600" />
                Full Name
              </label>
              <input
                type="text"
                placeholder="Enter recipient's full name"
                value={recipientInfo.name}
                onChange={(e) => setRecipientInfo({...recipientInfo, name: e.target.value})}
                className="w-full px-4 py-3 text-base border border-slate-200 rounded-lg 
                          focus:ring-2 focus:ring-teal-500 focus:border-transparent
                          placeholder:text-slate-400"
              />
            </div>

            {/* Phone input */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 mb-2">
                <Phone className="w-4 h-4 mr-2 text-teal-600" />
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="(555) 555-5555"
                value={recipientInfo.phone}
                onChange={(e) => setRecipientInfo({...recipientInfo, phone: e.target.value})}
                className="w-full px-4 py-3 text-base border border-slate-200 rounded-lg 
                          focus:ring-2 focus:ring-sage-500 focus:border-transparent
                          placeholder:text-slate-400"
              />
            </div>

            {/* Email input */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 mb-2">
                <Mail className="w-4 h-4 mr-2 text-teal-600" />
                Email Address <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="email"
                placeholder="email@example.com"
                value={recipientInfo.email}
                onChange={(e) => setRecipientInfo({...recipientInfo, email: e.target.value})}
                className="w-full px-4 py-3 text-base border border-slate-200 rounded-lg 
                          focus:ring-2 focus:ring-sage-500 focus:border-transparent
                          placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipientSection;
