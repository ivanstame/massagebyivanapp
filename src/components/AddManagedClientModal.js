import React, { useState } from 'react';
import { User, Phone, Mail, MapPin, AlertCircle, MessageSquare } from 'lucide-react';
import api from '../services/api';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

// Modal for providers to create a client profile on behalf of someone who
// won't use the app themselves (e.g. long-time elderly clients). The resulting
// User has no password and can never log in; the provider owns the record.
const AddManagedClientModal = ({ onClose, onCreated }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState({ street: '', unit: '', city: '', state: '', zip: '' });
  const [notes, setNotes] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const updateAddress = (field, value) => setAddress(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/users/managed-clients', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email.trim(),
        address: {
          street: address.street.trim(),
          unit: address.unit.trim(),
          city: address.city.trim(),
          state: address.state.trim(),
          zip: address.zip.trim(),
        },
        notes: notes.trim(),
        smsConsent,
      });
      onCreated?.(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create client');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full
        flex items-center justify-center z-50"
    >
      <div className="bg-paper-elev p-6 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Add Client</h2>
          <p className="text-sm text-slate-500 mt-1">
            For clients who aren't using the app. You'll manage their bookings on their behalf.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <User className="w-3.5 h-3.5 inline mr-1" />
                First name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <Phone className="w-3.5 h-3.5 inline mr-1" />
              Phone <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <Mail className="w-3.5 h-3.5 inline mr-1" />
              Email <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
            />
          </div>

          <div className="border-t border-line pt-4">
            <div className="flex items-center mb-3">
              <MapPin className="w-4 h-4 text-slate-500 mr-1.5" />
              <span className="text-sm font-medium text-slate-700">
                Home address <span className="text-slate-500 font-normal">(optional but needed for travel-time)</span>
              </span>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={address.street}
                onChange={(e) => updateAddress('street', e.target.value)}
                placeholder="Street address"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              />
              <input
                type="text"
                value={address.unit}
                onChange={(e) => updateAddress('unit', e.target.value)}
                placeholder="Unit / Apt (optional)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
              />
              <div className="grid grid-cols-6 gap-2">
                <input
                  type="text"
                  value={address.city}
                  onChange={(e) => updateAddress('city', e.target.value)}
                  placeholder="City"
                  className="col-span-3 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
                />
                <select
                  value={address.state}
                  onChange={(e) => updateAddress('state', e.target.value)}
                  className="col-span-1 px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
                >
                  <option value="">St</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  type="text"
                  value={address.zip}
                  onChange={(e) => updateAddress('zip', e.target.value)}
                  placeholder="ZIP"
                  maxLength={5}
                  className="col-span-2 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Preferences, recurring requests, anything worth remembering"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
            />
          </div>

          <div className="border-t border-line pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-[#B07A4E] focus:ring-[#B07A4E] border-slate-300 rounded"
                disabled={!phoneNumber.trim()}
              />
              <div>
                <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Send appointment reminders by text
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Only enable this if you've confirmed verbally that they want text reminders.
                  {!phoneNumber.trim() && ' (Add a phone number first.)'}
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2.5 bg-[#B07A4E] text-white rounded-lg hover:bg-[#8A5D36] transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddManagedClientModal;
