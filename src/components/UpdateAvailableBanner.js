import React from 'react';
import { RefreshCw } from 'lucide-react';

const UpdateAvailableBanner = ({ visible, onReload }) => {
  if (!visible) return null;

  const reload = () => {
    // Prefer the SW-coordinated path (skipWaiting + controllerchange
    // reload) when one is wired in by the parent. Falls back to a hard
    // reload for the version-poll path or when no SW is registered.
    if (typeof onReload === 'function') {
      onReload();
      return;
    }
    window.location.reload();
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg bg-[#B07A4E] text-white max-w-[92vw]"
      style={{ fontSize: "0.875rem" }}
    >
      <RefreshCw className="w-4 h-4 flex-shrink-0" />
      <span>A new version is available.</span>
      <button
        onClick={reload}
        className="font-semibold underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
      >
        Reload
      </button>
    </div>
  );
};

export default UpdateAvailableBanner;
