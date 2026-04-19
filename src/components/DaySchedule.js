import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import LuxonService from '../utils/LuxonService';

const DaySchedule = ({ date, availabilityBlocks, bookings, blockedTimes = [], onModify, onDelete, onDeleteBlockedTime, onRestoreBlockedTime }) => {
  const navigate = useNavigate();
  const startHour = 7;
  const endHour = 23;
  const totalHours = endHour - startHour + 1;

  const handleAppointmentClick = (bookingId) => {
    navigate(`/appointments/${bookingId}`);
  };

  const timeToPixels = (timeValue) => {
    let formattedTime;
    if (typeof timeValue === 'string' && timeValue.includes('T')) {
      formattedTime = DateTime.fromISO(timeValue).setZone(DEFAULT_TZ).toFormat("HH:mm");
    } else if (typeof timeValue === 'string') {
      formattedTime = timeValue;
    } else if (timeValue instanceof Date) {
      formattedTime = DateTime.fromJSDate(timeValue).setZone(DEFAULT_TZ).toFormat("HH:mm");
    } else {
      return 0;
    }
    const [hours, minutes] = formattedTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return ((hours - startHour) * 60 + minutes) * 2;
  };

  const formatTime = (timeValue) => {
    let dt;
    if (timeValue instanceof Date) {
      dt = DateTime.fromJSDate(timeValue).setZone(DEFAULT_TZ);
    } else if (typeof timeValue === 'string') {
      if (timeValue.includes('T')) {
        dt = DateTime.fromISO(timeValue).setZone(DEFAULT_TZ);
      } else {
        const [hours, minutes] = timeValue.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return "";
        dt = DateTime.now().setZone(DEFAULT_TZ).set({ hour: hours, minute: minutes });
      }
    } else {
      return "";
    }
    return dt.toFormat('h:mm a');
  };

  // Hour marker component
  const HourMarker = ({ hour }) => {
    const displayTime = DateTime.now()
      .setZone(DEFAULT_TZ)
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
    <div className="bg-white rounded-lg shadow-md overflow-hidden h-full flex flex-col">
      {/* Schedule header */}
      <div className="bg-cyan-900 py-1.5 px-3 flex-shrink-0">
        <h2 className="text-white text-sm">                  
          {DateTime.fromJSDate(date)
            .setZone(DEFAULT_TZ)
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
            {/* Availability blocks */}
            {availabilityBlocks.map((block, index) => {
              // Convert block times to LA timezone for display
              const blockStart = timeToPixels(block.start);
              const blockEnd = timeToPixels(block.end);

              return (
                <div
                  key={`availability-${index}`}
                  onClick={() => onModify && onModify(block)}
                  className="group absolute left-0 right-0 bg-green-50 border-green-200
                    border rounded-lg transition-all duration-200 hover:shadow-md cursor-pointer hover:bg-green-100"
                  style={{
                    top: `${blockStart}px`,
                    height: `${blockEnd - blockStart}px`,
                  }}
                >
                  <div className="p-2 flex flex-col h-full justify-between">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-slate-700">
                        {`${formatTime(block.start)} - ${formatTime(block.end)}`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                          Available
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

            {/* Anchor blocks (fixed location commitments) */}
            {availabilityBlocks
              .filter(block => block.anchor && block.anchor.name && block.anchor.startTime)
              .map((block, index) => {
                const anchorStart = timeToPixels(block.anchor.startTime);
                const anchorEnd = timeToPixels(block.anchor.endTime);
                return (
                  <div
                    key={`anchor-${index}`}
                    className="absolute left-0 right-0 bg-amber-50 border border-amber-300
                      rounded-lg z-10"
                    style={{
                      top: `${anchorStart}px`,
                      height: `${Math.max(anchorEnd - anchorStart, 30)}px`,
                    }}
                  >
                    <div className="p-2 flex flex-col h-full">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-amber-800">
                          {`${formatTime(block.anchor.startTime)} - ${formatTime(block.anchor.endTime)}`}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          Fixed
                        </span>
                      </div>
                      <p className="text-xs text-amber-700 mt-0.5 font-medium">{block.anchor.name}</p>
                      {block.anchor.address && (
                        <p className="text-xs text-amber-600 truncate">{block.anchor.address}</p>
                      )}
                    </div>
                  </div>
                );
              })
            }

            {/* Blocked time overlays */}
            {blockedTimes.map((bt, index) => {
              const btStart = timeToPixels(bt.start);
              const btEnd = timeToPixels(bt.end);
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
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium ${isOverridden ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                        {`${formatTime(bt.start)} - ${formatTime(bt.end)}`}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        isOverridden ? 'bg-slate-200 text-slate-500' : 'bg-slate-300 text-slate-700'
                      }`}>
                        {badgeText}
                      </span>
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
              const bookingStart = timeToPixels(booking.startTime);
              const bookingEnd = timeToPixels(booking.endTime);
              
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
                        <span className="text-sm font-medium text-slate-700">
                          {`${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`}
                        </span>
                        <span className="text-xs px-2 py-1 bg-[#FBF7EF] text-[#8A5D36] rounded-full">
                          {`${booking.duration} min`}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">
                        {booking.client.profile?.fullName || booking.client.email}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {booking.location.address}
                      </p>
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
