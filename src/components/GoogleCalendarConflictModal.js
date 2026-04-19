import React, { useState } from 'react';
import { AlertCircle, Calendar } from 'lucide-react';
import { DateTime } from 'luxon';
import { DEFAULT_TZ } from '../utils/timeConstants';

const formatTime = (date) => {
  return DateTime.fromISO(date).setZone(DEFAULT_TZ).toFormat('h:mm a');
};

const GoogleCalendarConflictModal = ({ conflicts, onConfirm, onCancel }) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggle = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(conflicts.map(c => c._id));
  const selectNone = () => setSelectedIds([]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(selectedIds);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmLabel = selectedIds.length > 0
    ? `Save & Override ${selectedIds.length}`
    : 'Save';

  return (
    <div className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full
      flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">Google Calendar Conflict</h2>
            <p className="text-sm text-slate-600 mt-1">
              Your time range overlaps with {conflicts.length === 1 ? 'this event' : 'these events'} on your Google Calendar:
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {conflicts.map(conflict => (
            <label
              key={conflict._id}
              className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(conflict._id)}
                onChange={() => toggle(conflict._id)}
                className="mt-0.5 rounded border-slate-300 text-[#009ea5] focus:ring-[#009ea5]"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {formatTime(conflict.start)} &ndash; {formatTime(conflict.end)}
                </div>
                {conflict.location?.address && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{conflict.location.address}</p>
                )}
              </div>
            </label>
          ))}
        </div>

        {conflicts.length > 1 && (
          <div className="flex gap-3 text-xs mb-3">
            <button onClick={selectAll} className="text-[#009ea5] hover:text-[#008a91] font-medium">
              Select All
            </button>
            <button onClick={selectNone} className="text-slate-500 hover:text-slate-700 font-medium">
              Select None
            </button>
          </div>
        )}

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
          <p className="text-xs text-slate-600">
            Check any event you want to override &mdash; clients will be able to book during its time. Leave unchecked events as blocking. Save proceeds either way.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 bg-[#009ea5] text-white rounded-lg hover:bg-[#008a91]
              disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoogleCalendarConflictModal;
