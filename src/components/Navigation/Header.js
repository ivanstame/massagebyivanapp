import React, { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronUp } from 'lucide-react';
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
          bottom edge. Solid accent fill (copper) so it reads as a
          deliberate action surface, not page chrome — earlier
          paper-on-paper version blended into footers. Chevron has a
          subtle infinite bounce to telegraph "tap me, I open
          something above." iPhone home-indicator safe-area padding
          retained. */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#B07A4E] hover:bg-[#8A5D36] active:bg-[#7A5230] transition-colors shadow-[0_-4px_16px_rgba(0,0,0,0.12)] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        aria-label="Open menu"
      >
        <span className="block w-10 h-1 rounded-full bg-white/40 mx-auto mt-2 mb-1" />
        <span className="flex items-center justify-center gap-2 pt-1 pb-2">
          <ChevronUp className="w-5 h-5 text-white animate-bounce" />
          <span className="text-base font-semibold text-white tracking-wide">
            Open Menu
          </span>
          <ChevronUp className="w-5 h-5 text-white animate-bounce" />
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
