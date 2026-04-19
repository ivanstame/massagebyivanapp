import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import axios from 'axios';
import { AlertCircle, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { BrushStroke, AvMonogram } from './brush/BrushMotifs';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/auth/login',
        { email, password },
        {
          withCredentials: true,
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        }
      );

      if (response.data.user) {
        setUser(response.data.user);
        if (response.data.token) {
          localStorage.setItem('token', response.data.token);
        }

        const registrationStep = response.data.user.registrationStep || 1;

        if (response.data.user.isAdmin) {
          navigate('/admin');
        } else if (registrationStep === 1) {
          navigate('/profile-setup');
        } else if (registrationStep === 2) {
          navigate('/treatment-preferences');
        } else {
          navigate(response.data.user.accountType === 'PROVIDER' ? '/provider' : '/');
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="av-paper">
      <div className="max-w-md mx-auto w-full px-7 pt-16 pb-8">
        {/* Monogram */}
        <div className="flex justify-center mb-3">
          <AvMonogram size={64} ringColor="#1B7F84" inkColor="#2A2520" accent="#B07A4E" />
        </div>

        {/* Eyebrow + headline */}
        <div className="text-center mb-10">
          <div className="av-meta mb-1.5">Avayble · est. 2026</div>
          <h1 className="font-display text-[40px] leading-[1.05] tracking-tight m-0 mb-2 text-ink">
            A quiet hour,<br />
            <em className="not-italic" style={{ color: '#B07A4E', fontStyle: 'italic' }}>on your schedule.</em>
          </h1>
          <p className="text-sm text-ink-2 m-0">Sign in to tend to your appointments.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label htmlFor="email" className="av-meta block mb-1.5">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="block w-full px-3.5 py-3.5 bg-paper-elev border border-line rounded-btn
                text-[15px] text-ink placeholder-ink-3
                focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent
                transition-all"
            />
          </div>

          <div>
            <label htmlFor="password" className="av-meta block mb-1.5">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="block w-full px-3.5 py-3.5 pr-12 bg-paper-elev border border-line rounded-btn
                  text-[15px] text-ink placeholder-ink-3
                  focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent
                  transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-ink-3 hover:text-ink-2 transition"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 border border-red-200 bg-red-50 rounded-btn">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 py-3.5 px-5
              rounded-btn text-[15px] font-medium text-white bg-accent
              hover:bg-accent-ink transition
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0 rgba(176,122,78,0.22)' }}
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Entering...</>
            ) : (
              <>Enter <ArrowRight className="w-4 h-4" /></>
            )}
          </button>

          <div className="text-center text-[13px] text-ink-3 mt-2">
            <Link to="/forgot-password" className="hover:text-ink-2 transition">Forgot password?</Link>
            <span className="mx-2">·</span>
            <Link to="/signup" className="text-accent hover:text-accent-ink transition">Create account</Link>
          </div>
        </form>
      </div>

      {/* Brush accent at bottom */}
      <div className="flex justify-center pb-8">
        <BrushStroke width={120} height={12} color="#B07A4E" opacity={0.5} />
      </div>
    </div>
  );
};

export default Login;
