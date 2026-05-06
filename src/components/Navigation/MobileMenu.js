// Bottom-sheet mobile menu — replaces the old `block`/`hidden` drop-down.
// Sheet rises from the bottom edge with a drag handle, scrim, and
// swipe-down-to-dismiss. Thumb-first ergonomics; native iOS / wellness-app
// idiom. See plans/ for the design rationale (chose this over a side
// drawer because Avayble's brand voice and one-handed provider use case
// favor a bottom sheet).

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  X, LogOut,
  LayoutDashboard, Calendar, Clock, CalendarRange, MapPin, Sparkles,
  Users, Megaphone, Car, Settings,
  CalendarPlus, Package, ShoppingBag, User as UserIcon, Shield,
  Type,
} from 'lucide-react';
import useTextSize from '../../hooks/useTextSize';

// Maps a nav-link href to a Lucide icon. Falls back to a generic icon if
// nothing matches. Centralized here so both client + provider menus
// stay consistent and we can swap icons later in one place.
const ICON_BY_HREF = {
  '/provider':                LayoutDashboard,
  '/provider/appointments':   Calendar,
  '/provider/availability':   Clock,
  '/provider/schedule-template': CalendarRange,
  '/provider/locations':      MapPin,
  '/provider/services':       Sparkles,
  '/provider/clients':        Users,
  '/provider/weekly-outreach': Megaphone,
  '/provider/mileage':        Car,
  '/provider/settings':       Settings,
  '/book':                    CalendarPlus,
  '/my-bookings':             Calendar,
  '/my-packages':             Package,
  '/packages':                ShoppingBag,
  '/my-profile':              UserIcon,
  '/login':                   UserIcon,
  '/signup':                  UserIcon,
  '/privacy-policy.html':     Shield,
};

const iconFor = (href) => ICON_BY_HREF[href] || Sparkles;

const MobileMenu = ({ open, onClose, navLinks, user, onLogout }) => {
  const location = useLocation();
  const sheetRef = useRef(null);
  // Live drag offset (px) while the user is dragging down. 0 when at rest.
  const [dragY, setDragY] = useState(0);
  const dragState = useRef({ startY: 0, startT: 0, dragging: false });
  const { size: textSize, setSize: setTextSize, steps: textSizeSteps } = useTextSize();

  // Body scroll-lock + ESC-to-close while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Reset drag offset whenever the sheet closes so the next open starts clean.
  useEffect(() => { if (!open) setDragY(0); }, [open]);

  // ─── Drag-to-dismiss handlers ──────────────────────────────────────
  // Pure touch events; no framer-motion. Attached only to the handle +
  // identity-header rows so users can still scroll the body of the sheet
  // without accidentally dismissing it.
  const onTouchStart = (e) => {
    const t = e.touches[0];
    dragState.current = { startY: t.clientY, startT: Date.now(), dragging: true };
  };
  const onTouchMove = (e) => {
    if (!dragState.current.dragging) return;
    const dy = e.touches[0].clientY - dragState.current.startY;
    if (dy > 0) setDragY(dy); // only follow downward; ignore upward over-pull
  };
  const onTouchEnd = (e) => {
    if (!dragState.current.dragging) return;
    const sheetH = sheetRef.current?.offsetHeight || 600;
    const dy = dragY;
    const dt = Math.max(1, Date.now() - dragState.current.startT);
    const velocity = dy / dt; // px per ms
    dragState.current.dragging = false;
    // Past 30% of sheet height OR a fast flick → close. Else snap back.
    if (dy > sheetH * 0.3 || velocity > 0.5) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  // ─── Identity / role display ───────────────────────────────────────
  const fullName = user?.profile?.fullName || user?.email || 'Welcome';
  const isProvider = user?.accountType === 'PROVIDER';
  const businessName = user?.providerProfile?.businessName || '';
  const logoUrl = user?.providerProfile?.logoUrl || '';
  const initials = useMemo(() => {
    const s = fullName.trim();
    if (!s) return '?';
    const parts = s.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  }, [fullName]);
  const roleLabel = !user
    ? ''
    : isProvider
      ? (businessName ? `Provider · ${businessName}` : 'Provider')
      : 'Client';

  // ─── Active-route detection (matches Header.js conventions) ────────
  const isActive = (href) => location.pathname === href;

  // Sheet animates with two intermediate states so the open
  // transition actually slides instead of cutting in:
  //   1. mounted=true & open=false → sheet rendered at translateY(100%)
  //   2. on the next frame, open flips → CSS transitions translateY to 0
  // Returning null when closed used to skip step 1 entirely, so the
  // first frame after `open=true` was already at translateY(0) with no
  // "from" state to animate from. Now we keep the component mounted
  // (with pointer-events: none on the scrim when closed so it doesn't
  // intercept taps) and let the transform animate naturally.
  const sheetTransform = open
    ? `translateY(${dragY}px)`
    : 'translateY(100%)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      className="sm:hidden"
      aria-hidden={!open}
    >
      {/* Scrim — pointer-events disabled when closed so the page
          underneath stays tappable. Opacity transitions independently
          of the sheet for a slightly faster fade-in (220ms) so it
          grounds the layered surface before the sheet finishes. */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black transition-opacity duration-200"
        style={{
          opacity: open ? 0.4 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 bg-paper-elev rounded-t-2xl shadow-atelier-lg max-h-[85vh] flex flex-col motion-reduce:transition-none"
        style={{
          transform: sheetTransform,
          transition: dragState.current.dragging
            ? 'none'
            : 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Drag handle row — touch zone for swipe-to-dismiss */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing"
        >
          <span className="block w-10 h-1 rounded-full bg-[color:var(--ink-3)] opacity-40" />
        </div>

        {/* Identity header — also a drag-to-dismiss zone for finger reach */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="px-5 pt-2 pb-4 flex items-center gap-3 border-b border-line"
        >
          <div className="w-10 h-10 rounded-full bg-[color:var(--accent-soft)] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-[color:var(--accent)]">
                {initials}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-base text-ink truncate" style={{ lineHeight: 1.2, fontWeight: 500 }}>
              {fullName}
            </h2>
            {roleLabel && (
              <p className="text-xs text-ink-2 truncate mt-0.5">{roleLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-11 h-11 flex items-center justify-center rounded-full text-ink-2 hover:bg-paper-deep focus-visible:ring-2 focus-visible:ring-[#B07A4E]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable inside the sheet */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="av-eyebrow mb-3">Menu</div>
          <div className="grid grid-cols-2 gap-2">
            {navLinks.map((link) => {
              const Icon = iconFor(link.href);
              const active = isActive(link.href);
              const isExternal = link.href.startsWith('/privacy-policy');
              const cellClasses = `flex flex-col items-start gap-2 p-3 rounded-xl border transition-colors ${
                active
                  ? 'bg-[color:var(--accent-soft)] border-[#B07A4E]/40'
                  : 'bg-paper-deep border-transparent hover:border-line'
              }`;
              const iconColor = active ? 'text-[#B07A4E]' : 'text-ink-2';
              const labelColor = active ? 'text-[#B07A4E]' : 'text-ink';
              const inner = (
                <>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                  <span className={`text-sm font-medium ${labelColor}`}>{link.label}</span>
                </>
              );
              return isExternal ? (
                <a key={link.href} href={link.href} onClick={onClose} className={cellClasses}>
                  {inner}
                </a>
              ) : (
                <Link key={link.href} to={link.href} onClick={onClose} className={cellClasses}>
                  {inner}
                </Link>
              );
            })}
          </div>

          {user && (
            <>
              <div className="av-eyebrow mt-6 mb-3">Account</div>
              <div className="space-y-1">
                {user.accountType === 'CLIENT' && (
                  <Link
                    to="/my-profile"
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg ${
                      isActive('/my-profile')
                        ? 'bg-[color:var(--accent-soft)] text-[#B07A4E]'
                        : 'text-ink hover:bg-paper-deep'
                    }`}
                  >
                    <UserIcon className="w-5 h-5" />
                    <span className="text-sm font-medium">Profile</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => { onLogout(); onClose(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-red-700 hover:bg-red-50"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              </div>
            </>
          )}

          {/* Text size — accessibility for low-vision users. Each step
              scales the html root font-size; rem-based Tailwind utilities
              cascade through the whole app. Persisted to localStorage by
              the hook. Buttons render the letter "A" at the size each
              step would produce, so users see the change before
              committing. */}
          <div className="mt-6 pt-4 border-t border-line">
            <div className="av-eyebrow mb-3 flex items-center gap-2">
              <Type className="w-3.5 h-3.5" />
              <span>Text Size</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {textSizeSteps.map((step) => {
                const active = textSize === step.id;
                const sample = {
                  sm: 'text-xs',
                  default: 'text-sm',
                  lg: 'text-base',
                  xl: 'text-lg',
                }[step.id];
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setTextSize(step.id)}
                    aria-label={`${step.description} text size`}
                    aria-pressed={active}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-lg border-2 transition-colors ${
                      active
                        ? 'border-[#B07A4E] bg-[color:var(--accent-soft)] text-[#B07A4E]'
                        : 'border-line bg-paper-deep text-ink-2 hover:border-[#B07A4E]/40'
                    }`}
                  >
                    <span className={`${sample} font-semibold leading-none`}>
                      {step.label}
                    </span>
                    <span className="text-[10px] mt-1 opacity-70">
                      {step.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer — privacy + version, muted */}
          <div className="mt-6 pt-4 border-t border-line text-xs text-ink-3 flex items-center justify-between">
            <a href="/privacy-policy.html" className="hover:text-ink-2">Privacy Policy</a>
            <span>Avayble</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileMenu;
