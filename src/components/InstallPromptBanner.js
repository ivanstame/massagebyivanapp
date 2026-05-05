import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// Surfaces an "Install Avayble" call-to-action two different ways
// depending on the platform:
//
// - Android / desktop Chrome / Edge: listen for `beforeinstallprompt`,
//   capture it, show a one-tap "Install" button. Calling `e.prompt()`
//   from a click handler launches the native dialog.
//
// - iOS Safari: there is no programmatic install API. Show an
//   instructional banner ("Tap the share icon, then Add to Home
//   Screen") with a visual cue. We only show this in actual iOS
//   Safari (skip iOS Chrome / Firefox / Edge — none of them can
//   install web apps to the home screen, so the instructions would
//   be misleading) and only when the page isn't already running in
//   standalone mode.
//
// Both flows share a 7-day dismiss cooldown stored in localStorage,
// keyed separately so dismissing one doesn't suppress the other on
// shared-device edge cases.

const DISMISS_KEY_STD = 'avayble.installPromptDismissedAt';
const DISMISS_KEY_IOS = 'avayble.installPromptIosDismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IOS_DELAY_MS = 4000; // wait a few seconds before nagging on iOS

const recentlyDismissed = (key) => {
  try {
    const ts = Number(localStorage.getItem(key));
    return ts && Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

// iOS Safari detection. `standalone` is the iOS-Safari-specific signal
// for "running as installed PWA" — not on the spec's display-mode
// query everywhere. We check both to be defensive.
const isStandalone = () => {
  if (typeof navigator !== 'undefined' && navigator.standalone) return true;
  if (typeof window !== 'undefined' && window.matchMedia) {
    try { if (window.matchMedia('(display-mode: standalone)').matches) return true; } catch {}
  }
  return false;
};

const isIosSafari = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/.test(ua);
  if (!isIos) return false;
  // Skip iOS Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS), Opera (OPiOS),
  // DuckDuckGo (DuckDuckGo). None can install to the home screen.
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua)) return false;
  return /Safari/.test(ua);
};

// Tiny SVG of the iOS share icon — square with arrow up. Inline so
// we don't depend on Lucide rendering an exact match. 16×16 viewBox
// keeps it crisp at any size.
const IosShareIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden="true">
    <path d="M8 1.5 V10" strokeLinecap="round" />
    <path d="M5 4 L8 1.5 L11 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.5 7 V13.5 H12.5 V7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InstallPromptBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  // Standard prompt path (Chrome / Edge / Android).
  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      if (recentlyDismissed(DISMISS_KEY_STD)) return;
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

  // iOS Safari path — schedule the hint after a short delay so we
  // don't ambush a first-time visitor before they've seen the page.
  useEffect(() => {
    if (!isIosSafari()) return;
    if (isStandalone()) return; // already installed
    if (recentlyDismissed(DISMISS_KEY_IOS)) return;
    const t = setTimeout(() => setShowIosHint(true), IOS_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch (err) {
      console.error('install prompt failed:', err);
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismissStd = () => {
    try { localStorage.setItem(DISMISS_KEY_STD, String(Date.now())); } catch {}
    setHidden(true);
  };
  const handleDismissIos = () => {
    try { localStorage.setItem(DISMISS_KEY_IOS, String(Date.now())); } catch {}
    setShowIosHint(false);
  };

  if (hidden) return null;

  // Standard browser prompt takes precedence if both are eligible
  // (shouldn't happen — iOS Safari never fires beforeinstallprompt —
  // but guard anyway).
  if (deferredPrompt) {
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
          onClick={handleDismissStd}
          aria-label="Dismiss install prompt"
          className="text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div
        role="dialog"
        aria-label="Install Avayble on iPhone"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[99] px-4 py-3 rounded-xl shadow-lg bg-paper-elev border border-line max-w-[92vw] w-[22rem]"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
            <Download className="w-4 h-4 text-[#B07A4E]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900 text-sm">Install Avayble</p>
            <p className="text-xs text-slate-600 mt-1 leading-snug">
              Tap{' '}
              <IosShareIcon className="inline-block w-3.5 h-3.5 -mt-0.5 mx-0.5 text-[#B07A4E]" />
              <span className="text-[11px] text-slate-500">(Share)</span> in Safari, scroll down,
              then tap <strong>Add to Home Screen</strong>.
            </p>
          </div>
          <button
            onClick={handleDismissIos}
            aria-label="Dismiss install hint"
            className="text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded -mt-1 -mr-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default InstallPromptBanner;
