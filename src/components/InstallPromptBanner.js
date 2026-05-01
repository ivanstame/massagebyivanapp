import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// Surfaces an explicit "Install Avayble" call-to-action when the
// browser fires `beforeinstallprompt` — more reliable than waiting
// for Chrome's automatic install banner, which depends on opaque
// engagement heuristics and stops firing entirely once a user has
// dismissed it. Calling `e.prompt()` from a click handler shows the
// native install dialog.
//
// iOS Safari never fires beforeinstallprompt. iOS users install via
// Share → Add to Home Screen (no programmatic equivalent exists).
// We don't surface any iOS-specific hint here yet — separate piece
// of work if/when we want to chase iOS install conversion.

const DISMISS_KEY = 'avayble.installPromptDismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const recentlyDismissed = () => {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY));
    return ts && Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

const InstallPromptBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      // Chrome would otherwise show its mini-infobar; we want our own UI.
      e.preventDefault();
      if (recentlyDismissed()) return;
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch (err) {
      console.error('install prompt failed:', err);
    } finally {
      // Per spec the deferred prompt is single-use.
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setHidden(true);
  };

  if (hidden || !deferredPrompt) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Avayble"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[99] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg bg-paper-elev border border-line max-w-[92vw]"
      style={{ fontSize: 14 }}
    >
      <Download className="w-4 h-4 flex-shrink-0 text-[#B07A4E]" />
      <span className="text-slate-800">Add Avayble to your home screen.</span>
      <button
        onClick={handleInstall}
        className="font-semibold px-3 py-1 rounded bg-[#B07A4E] text-white hover:bg-[#8A5D36] focus:outline-none focus:ring-2 focus:ring-[#B07A4E]/60"
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default InstallPromptBanner;
