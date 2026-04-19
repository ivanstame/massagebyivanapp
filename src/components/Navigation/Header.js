import React, { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../AuthContext';

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
        { href: '/provider/schedule-template', label: 'Template' },
        { href: '/provider/locations', label: 'Locations' },
        { href: '/provider/services', label: 'Services' },
        { href: '/provider/clients', label: 'Clients' },
        { href: '/provider/mileage', label: 'Mileage' },
        { href: '/provider/settings', label: 'Settings' }
      ];
    }

    return [
      { href: '/book', label: 'Book Appointment' },
      { href: '/my-bookings', label: 'My Bookings' },
      { href: '/privacy-policy.html', label: 'Privacy Policy' }
    ];
  };

  const navLinks = getNavLinks();
  const isActive = (path) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white shadow-sm border-b border-slate-200 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link to="/" className="block">
              <img
                src="/imgs/logo.png"
                alt="Massage by Ivan"
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

          {/* Mobile menu button */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#B07A4E] focus:ring-offset-2"
            >
              <span className="sr-only">Open main menu</span>
              {!mobileMenuOpen ? (
                <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${mobileMenuOpen ? 'block' : 'hidden'} sm:hidden border-t border-slate-200 bg-white`}>
        <div className="pt-2 pb-3 space-y-1">
          {navLinks.map((link) => {
            const isExternal = link.href.startsWith('/privacy-policy');
            const classes = `${
              isActive(link.href)
                ? 'bg-teal-50 border-[#B07A4E] text-[#B07A4E]'
                : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            } block pl-3 pr-4 py-3 border-l-4 text-base font-medium transition-colors`;

            return isExternal ? (
              <a key={link.href} href={link.href} className={classes} onClick={() => setMobileMenuOpen(false)}>
                {link.label}
              </a>
            ) : (
              <Link key={link.href} to={link.href} className={classes} onClick={() => setMobileMenuOpen(false)}>
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
                      ? 'bg-teal-50 border-[#B07A4E] text-[#B07A4E]'
                      : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  } block pl-3 pr-4 py-3 border-l-4 text-base font-medium transition-colors`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Profile
                </Link>
              )}
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left pl-3 pr-4 py-3 border-l-4 border-transparent text-base font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Header;
