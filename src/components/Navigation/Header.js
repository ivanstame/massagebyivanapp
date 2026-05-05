import React, { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../AuthContext';
import MobileMenu from './MobileMenu';

const Header = () => {
  const { user, setUser } = useContext(AuthContext);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        setUser(null);
        window.location.replace('/login');
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getNavLinks = () => {
    if (!user) {
      return [
        { href: '/login', label: 'Login' },
        { href: '/signup', label: 'Sign Up' },
        { href: '/privacy-policy.html', label: 'Privacy Policy' }
      ];
    }

    if (user.accountType === 'PROVIDER') {
      return [
        { href: '/provider', label: 'Dashboard' },
        { href: '/provider/appointments', label: 'Appointments' },
        { href: '/provider/availability', label: 'Availability' },
        { href: '/provider/schedule-template', label: 'Weekly Hours' },
        { href: '/provider/locations', label: 'Locations' },
        { href: '/provider/services', label: 'Services' },
        { href: '/provider/clients', label: 'Clients' },
        { href: '/provider/weekly-outreach', label: 'Weekly Outreach' },
        { href: '/provider/mileage', label: 'Mileage' },
        { href: '/provider/settings', label: 'Settings' }
      ];
    }

    return [
      { href: '/book', label: 'Book Appointment' },
      { href: '/my-bookings', label: 'My Bookings' },
      { href: '/my-packages', label: 'My Packages' },
      { href: '/packages', label: 'Buy Packages' },
      { href: '/privacy-policy.html', label: 'Privacy Policy' }
    ];
  };

  const navLinks = getNavLinks();
  const isActive = (path) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 bg-paper-elev shadow-atelier-sm border-b border-line z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link to="/" className="block">
              <img
                src="/imgs/avayble_logo.png"
                alt="Avayble"
                className="h-12 w-auto"
              />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden sm:flex sm:space-x-6 sm:items-center">
            {navLinks.map((link) => {
              const isExternal = link.href.startsWith('/privacy-policy');
              const classes = `${
                isActive(link.href)
                  ? 'border-[#B07A4E] text-[#B07A4E]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`;

              return isExternal ? (
                <a key={link.href} href={link.href} className={classes}>
                  {link.label}
                </a>
              ) : (
                <Link key={link.href} to={link.href} className={classes}>
                  {link.label}
                </Link>
              );
            })}
            {user && (
              <>
                {user.accountType === 'CLIENT' && (
                  <Link
                    to="/my-profile"
                    className={`${
                      isActive('/my-profile')
                        ? 'border-[#B07A4E] text-[#B07A4E]'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}
                  >
                    Profile
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="ml-2 inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-[#B07A4E] hover:bg-[#8A5D36] transition-colors shadow-sm"
                >
                  Logout
                </button>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Mobile menu trigger — persistent peek-bar pinned to the
          bottom edge instead of a top-right hamburger. The drag
          handle pill is the universal "this opens" affordance, and
          its physical proximity to where the sheet emerges from
          keeps the cause-and-effect immediate. Tap (or drag the
          sheet itself) to expand. iPhone home-indicator safe-area
          padding included so we don't sit under it on notched
          devices. */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-paper-elev border-t border-line shadow-[0_-2px_10px_rgba(0,0,0,0.04)] flex flex-col items-center justify-center pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        aria-label="Open menu"
      >
        <span className="block w-10 h-1 rounded-full bg-slate-300 mb-1" />
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
          Menu
        </span>
      </button>

      {/* Mobile menu — bottom sheet, rendered as a sibling so it can
          escape the nav's max-w container. */}
      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        navLinks={navLinks}
        user={user}
        onLogout={handleLogout}
      />
    </nav>
  );
};

export default Header;
