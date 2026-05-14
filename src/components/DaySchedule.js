import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { Repeat } from 'lucide-react';
import { TIME_FORMATS, tzOf } from '../utils/timeConstants';
import { AuthContext } from '../AuthContext';
import LuxonService from '../utils/LuxonService';
import NavigateButton from './NavigateButton';

// Tiny shared icon. Inline because it's literally one element used in
// two adjacent renders.
const RepeatIcon = () => <Repeat className="w-3 h-3 text-[#B07A4E] flex-shrink-0" />;

const DaySchedule = ({ date, availabilityBlocks, bookings, blockedTimes = [], onModify, onDelete, onDeleteBlockedTime, onRestoreBlockedTime }) => {
  const navigate = useNavigate();
  // Provider-only view; auth user supplies the wall-clock TZ. Each
  // doc's own timezone is preferred for parsing, falling back to this.
  const { user } = useContext(AuthContext);
  const viewerTz = tzOf(user);
  const startHour = 7;
  const endHour = 23;
  const totalHours = endHour - startHour + 1;

  const handleAppointmentClick = (bookingId) => {
    navigate(`/appointments/${bookingId}`);
  };

  // Both helpers take an optional `tz` so callers can pass the doc's
  // stored TZ when known. Falls back to viewerTz for HH:mm strings
  // (already wall-clock in some TZ — viewerTz is the safest default).
  const timeToPixels = (timeValue, tz = viewerTz) => {
    let formattedTime;
    if (typeof timeValue === 'string' && timeValue.includes('T')) {
      formattedTime = DateTime.fromISO(timeValue).setZone(tz).toFormat("HH:mm");
    } else if (typeof timeValue === 'string') {
      formattedTime = timeValue;
    } else if (timeValue instanceof Date) {
      formattedTime = DateTime.fromJSDate(timeValue).setZone(tz).toFormat("HH:mm");
    } else {
      return 0;
    }
    const [hours, minutes] = formattedTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return ((hours - startHour) * 60 + minutes) * 2;
  };

  const formatTime = (timeValue, tz = viewerTz) => {
    let dt;
    if (timeValue instanceof Date) {
      dt = DateTime.fromJSDate(timeValue).setZone(tz);
    } else if (typeof timeValue === 'string') {
      if (timeValue.includes('T')) {
        dt = DateTime.fromISO(timeValue).setZone(tz);
      } else {
        const [hours, minutes] = timeValue.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return "";
        dt = DateTime.now().setZone(tz).set({ hour: hours, minute: minutes });
      }
    } else {
      return "";
    }
    return dt.toFormat('h:mm a');
  };

  // Hour marker component
  const HourMarker = ({ hour }) => {
    const displayTime = DateTime.now()
      .setZone(viewerTz)
      .set({ hour, minute: 0 })
      .toFormat('h:mm a');

    return (
      <div 
        className="absolute left-0 -translate-y-3 w-16 text-right pr-4 text-sm font-medium text-slate-500"
        style={{ top: `${(hour - startHour) * 60 * 2}px` }}
      >
        {displayTime}
      </div>
    );
  };

  // Half-hour marker component
  const HalfHourMarker = ({ hour }) => (
    <div 
      className="absolute left-0 right-0 border-t border-slate-100"
      style={{ top: `${((hour - startHour) * 60 + 30) * 2}px` }}
    />
  );

  // Hour grid line component
  const HourGridLine = ({ hour }) => (
    <div 
      className="absolute left-0 right-0 border-t border-slate-200"
      style={{ top: `${(hour - startHour) * 60 * 2}px` }}
    />
  );

  return (
    <div className="bg-paper-elev border border-line rounded-card shadow-atelier-sm overflow-hidden h-full flex flex-col">
      {/* Schedule header */}
      <div className="py-2.5 px-4 flex-shrink-0 border-b border-line" style={{ background: 'var(--bg-deep)' }}>
        <div className="av-eyebrow text-ink-3 mb-0.5">Today</div>
        <h2 className="font-display text-ink" style={{ fontSize: "1rem", fontWeight: 500, lineHeight: 1.2 }}>
          {DateTime.fromJSDate(date)
            .setZone(viewerTz)
            .toFormat('cccc, LLLL d')}
        </h2>
      </div>

      {/* Scrollable container for schedule grid */}
      <div className="overflow-y-auto h-full min-h-0 pb-20">
        {/* Schedule grid */}
        <div className="relative h-[1920px] mx-4 mt-4">
          {/* Time markers and grid lines */}
          <div className="absolute top-0 left-0 w-full h-full">
            {Array.from({ length: totalHours + 1 }).map((_, i) => (
              <React.Fragment key={i}>
                <HourMarker hour={startHour + i} />
                <HourGridLine hour={startHour + i} />
                <HalfHourMarker hour={startHour + i} />
              </React.Fragment>
            ))}
          </div>

          {/* Content area */}
          <div className="absolute left-16 right-0 top-0 bottom-0">
            {/* Availability blocks. Mobile = green; In-studio (static) =
                blue, with the location name surfaced inline so the
                provider knows where they're committed. */}
            {availabilityBlocks.map((block, index) => {
              // Use the block's stored TZ; falls back to viewerTz.
              const blockTz = tzOf(block, viewerTz);
              const blockStart = timeToPixels(block.start, blockTz);
              const blockEnd = timeToPixels(block.end, blockTz);
              const isStatic = block.kind === 'static';
              const isFlexible = block.kind === 'flexible';
              const containerColors = isStatic
                ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                : isFlexible
                  ? 'border-emerald-300'
                  : 'bg-green-50 border-green-200 hover:bg-green-100';
              // Flexible block — hard 50/50 diagonal split, same as
              // the calendar cell shading above. emerald-100 / sky-100
              // hex codes for a sharp transition. Inline-styled because
              // Tailwind's gradient utilities don't support hard stops
              // at a fixed midpoint.
              const flexibleStyle = isFlexible
                ? { background: 'linear-gradient(135deg, #d1fae5 0%, #d1fae5 50%, #bae6fd 50%, #bae6fd 100%)' }
                : null;
              const badgeColors = isStatic
                ? 'bg-blue-100 text-blue-800'
                : isFlexible
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-green-100 text-green-800';

              return (
                <div
                  key={`availability-${index}`}
                  onClick={() => onModify && onModify(block)}
                  className={`group absolute left-0 right-0 ${containerColors}
                    border rounded-lg transition-all duration-200 hover:shadow-md cursor-pointer`}
                  style={{
                    top: `${blockStart}px`,
                    height: `${blockEnd - blockStart}px`,
                    ...(flexibleStyle || {}),
                  }}
                >
                  <div className="p-2 flex flex-col h-full justify-between">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-700">
                          {`${formatTime(block.start, blockTz)} - ${formatTime(block.end, blockTz)}`}
                        </span>
                        {isStatic && block.staticLocation?.name && (
                          <p className="text-xs text-blue-700 truncate mt-0.5">
                            at {block.staticLocation.name}
                          </p>
                        )}
                        {isFlexible && block.staticLocation?.name && (
                          <p className="text-xs text-purple-700 truncate mt-0.5">
                            or at {block.staticLocation.name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-xs px-2 py-1 rounded-full ${badgeColors}`}>
                          {isStatic ? 'In-studio' : isFlexible ? 'Flexible' : 'Available'}
                        </span>
                        {onDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(block);
                            }}
                            aria-label="Delete availability"
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-xs px-2 py-0.5
                              rounded bg-red-500 text-white hover:bg-red-600 transition-opacity font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Blocked time overlays */}
            {blockedTimes.map((bt, index) => {
              const btTz = tzOf(bt, viewerTz);
              const btStart = timeToPixels(bt.start, btTz);
              const btEnd = timeToPixels(bt.end, btTz);
              const isOverridden = bt.overridden === true;
              const isGoogle = bt.source === 'google_calendar';

              let badgeText = 'Blocked';
              if (isOverridden) badgeText = 'Overridden';
              else if (isGoogle) badgeText = 'Google Cal';

              return (
                <div
                  key={`blocked-${index}`}
                  onClick={isOverridden && onRestoreBlockedTime ? (e) => {
                    e.stopPropagation();
                    onRestoreBlockedTime(bt._id);
                  } : undefined}
                  className={`absolute left-0 right-0 border rounded-lg z-[15] group ${
                    isOverridden
                      ? 'border-slate-300 cursor-pointer hover:bg-slate-100'
                      : 'border-slate-400 cursor-default'
                  }`}
                  style={{
                    top: `${btStart}px`,
                    height: `${Math.max(btEnd - btStart, 24)}px`,
                    backgroundColor: isOverridden ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.35)',
                    backgroundImage: isOverridden
                      ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(100,116,139,0.05) 4px, rgba(100,116,139,0.05) 8px)'
                      : 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(100,116,139,0.13) 4px, rgba(100,116,139,0.13) 8px)',
                    borderStyle: isOverridden ? 'dashed' : 'solid',
                    opacity: isOverridden ? 0.6 : 1
                  }}
                >
                  <div className="p-1.5 flex items-start justify-between">
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-medium ${isOverridden ? 'text-slate-500 line-through' : 'text-slate-600'}`}>
                          {bt.allDay ? 'All day' : `${formatTime(bt.start, btTz)} - ${formatTime(bt.end, btTz)}`}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isOverridden ? 'bg-slate-200 text-slate-500' : 'bg-slate-300 text-slate-700'
                        }`}>
                          {badgeText}
                        </span>
                      </div>
                      {bt.reason && (
                        <span className={`text-[11px] mt-0.5 truncate ${
                          isOverridden ? 'text-slate-500' : 'text-slate-500'
                        }`}>
                          {bt.reason}
                        </span>
                      )}
                    </div>
                    {onDeleteBlockedTime && !isGoogle && !isOverridden && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteBlockedTime(bt._id);
                        }}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-xs px-1.5 py-0.5
                          rounded bg-slate-500 text-white hover:bg-slate-600 transition-opacity"
                      >
                        Unblock
                      </button>
                    )}
                    {isOverridden && (
                      <span className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-xs text-slate-500 transition-opacity">
                        Tap to restore
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Bookings */}
            {bookings.map((booking, index) => {
              const bookingTz = tzOf(booking, viewerTz);
              const bookingStart = timeToPixels(booking.startTime, bookingTz);
              const bookingEnd = timeToPixels(booking.endTime, bookingTz);
              
              return (
                <div
                  key={`booking-${index}`}
                  onClick={() => handleAppointmentClick(booking._id)}
                  className="absolute left-1 right-1 bg-[#FBF7EF] border border-[#B07A4E]
                   rounded-lg shadow-sm cursor-pointer transition-all duration-200
                   hover:shadow-md hover:bg-[#f0e8e0] z-20"
                  style={{
                    top: `${bookingStart}px`,
                    height: `${bookingEnd - bookingStart}px`,
                  }}
                >
                  <div className="p-2 flex flex-col h-full justify-between">
                    <div className="space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-slate-700 inline-flex items-center gap-1">
                          {booking.series && (
                            <span title="Part of a standing appointment">
                              <RepeatIcon />
                            </span>
                          )}
                          {`${formatTime(booking.startTime, bookingTz)} - ${formatTime(booking.endTime, bookingTz)}`}
                        </span>
                        <span className="text-xs px-2 py-1 bg-[#FBF7EF] text-[#8A5D36] rounded-full">
                          {`${booking.duration} min`}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">
                        {booking.client.profile?.fullName || booking.client.email}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-500 truncate min-w-0 flex-1">
                          {booking.location.address}
                        </p>
                        <NavigateButton location={booking.location} label="" className="px-2 py-0.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DaySchedule;
