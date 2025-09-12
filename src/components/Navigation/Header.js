import React, { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../AuthContext';

const Header = () => {
  const { user, setUser } = useContext(AuthContext);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [debugInfo, setDebugInfo] = useState('');
  const [showDebug, setShowDebug] = useState(false);

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
        { href: '/signup', label: 'Sign Up' }
      ];
    }

    if (user.accountType === 'PROVIDER') {
      return [
        { href: '/provider', label: 'Dashboard' },
        { href: '/provider/appointments', label: 'Appointments' },
        { href: '/provider/availability', label: 'Availability' },
        { href: '/provider/clients', label: 'Clients' },
        { href: '/provider/analytics', label: 'Analytics' },
        { href: '/provider/settings', label: 'Settings' }
      ];
    }

    return [
      { href: '/book', label: 'Book Appointment' },
      { href: '/my-bookings', label: 'My Bookings' }
    ];
  };

  const navLinks = getNavLinks();
  const isActive = (path) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white shadow z-50">
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
          <div className="hidden sm:flex sm:space-x-8 sm:items-center">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`${
                  isActive(link.href)
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <>
                {user.accountType === 'CLIENT' && (
                  <Link
                    to="/my-profile"
                    className={`${
                      isActive('/my-profile')
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                  >
                    Profile
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="ml-2 inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-cyan-900"
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
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none"
            >
              <span className="sr-only">Open main menu</span>
              {!mobileMenuOpen ? (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${mobileMenuOpen ? 'block' : 'hidden'} sm:hidden`}>
        <div className="pt-2 pb-3 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`${
                isActive(link.href)
                  ? 'bg-blue-50 border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <>
              {user.accountType === 'CLIENT' && (
                <Link
                  to="/my-profile"
                  className={`${
                    isActive('/my-profile')
                      ? 'bg-blue-50 border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
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
                className="block w-full text-left pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>

      {/* Debug Button */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 z-50">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="bg-black/75 text-white p-2 rounded-full shadow-lg"
          >
            🐛
          </button>
          {showDebug && (
            <div className="absolute bottom-12 right-0 bg-black/75 text-white p-4 text-xs rounded-lg w-80 max-h-96 overflow-auto shadow-lg">
              <pre>{debugInfo}</pre>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Header;
