import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../AuthContext';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, MessageSquare } from 'lucide-react';

// Public claim page. Token in the URL; provider handed this link to the
// managed client. The client sets a password (and optionally an email +
// SMS consent) and takes over the account. After a successful POST the
// backend logs them in via session cookie, so we sync AuthContext and
// bounce to /my-bookings — same post-login experience as a fresh signup.
const ClaimAccount = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`/api/claim/${token}`);
        if (cancelled) return;
        setPreview(res.data);
      } catch (err) {
        if (cancelled) return;
        setPreviewError(err.response?.data?.message || 'Could not load claim link.');
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords don\'t match.');
      return;
    }
    if (preview?.needsEmail && !email.trim()) {
      setSubmitError('Please enter your email address so you can log in later.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`/api/claim/${token}`, {
        password,
        email: email.trim() || undefined,
        smsConsent,
      });
      setUser(res.data.user);
      navigate('/my-bookings', { replace: true });
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to claim account.');
      setSubmitting(false);
    }
  };

  if (loadingPreview) {
    return (
      <div className="av-paper pt-16 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-ink-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="av-paper pt-16 min-h-screen">
        <div className="max-w-md mx-auto px-7 pt-10 pb-8 text-center">
          <div className="flex justify-center mb-3">
            <img src="/imgs/avayble_icon.png" alt="" className="h-14 w-14" />
          </div>
          <h1 className="font-display text-[28px] leading-tight mb-3 text-ink">
            Link unavailable
          </h1>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-left">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{previewError}</p>
          </div>
          <p className="mt-4 text-sm text-ink-2">
            Ask your provider to send a new claim link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="av-paper pt-16 min-h-screen">
      <div className="max-w-md mx-auto px-7 pt-10 pb-8">
        <div className="flex justify-center mb-3">
          <img src="/imgs/avayble_icon.png" alt="" className="h-14 w-14" />
        </div>

        <div className="text-center mb-6">
          <div className="av-meta mb-1.5">Take over your account</div>
          <h1 className="font-display text-[30px] leading-[1.1] tracking-tight mb-2 text-ink">
            Hi, <em className="not-italic" style={{ color: '#B07A4E', fontStyle: 'italic' }}>{preview.clientName}</em>.
          </h1>
          <p className="text-sm text-ink-2 leading-relaxed">
            {preview.providerName} has been keeping your appointments on file. Set a password to
            manage your own bookings from now on.
          </p>
        </div>

        {/* On-file preview so the claimant can sanity-check this is their account */}
        <div className="mb-5 p-4 bg-paper-elev border border-line rounded-lg">
          <p className="text-[11px] uppercase tracking-wide text-ink-2 mb-2">On file for you</p>
          <dl className="text-sm space-y-1.5">
            {preview.clientPhone && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Phone</dt>
                <dd className="text-ink font-mono">{preview.clientPhone}</dd>
              </div>
            )}
            {preview.clientEmail && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Email</dt>
                <dd className="text-ink">{preview.clientEmail}</dd>
              </div>
            )}
            {preview.clientAddress && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2 flex-shrink-0">Address</dt>
                <dd className="text-ink text-right">{preview.clientAddress}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-ink-3">
            If that doesn't look like you, don't continue — this link was meant for someone else.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {preview.needsEmail && (
            <div>
              <label htmlFor="email" className="av-meta block mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="block w-full px-3.5 py-3.5 bg-paper-elev border border-line rounded-btn
                  text-[15px] text-ink placeholder-ink-3
                  focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all"
              />
              <p className="mt-1 text-xs text-ink-3">You'll use this to log in.</p>
            </div>
          )}

          <div>
            <label htmlFor="password" className="av-meta block mb-1.5">Create a password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="block w-full px-3.5 py-3.5 pr-12 bg-paper-elev border border-line rounded-btn
                  text-[15px] text-ink placeholder-ink-3
                  focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-ink-3 hover:text-ink-2 transition"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="av-meta block mb-1.5">Confirm password</label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type it again"
              className="block w-full px-3.5 py-3.5 bg-paper-elev border border-line rounded-btn
                text-[15px] text-ink placeholder-ink-3
                focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all"
            />
          </div>

          {preview.clientPhone && (
            <label className="flex items-start gap-3 p-3 bg-paper-elev border border-line rounded-btn cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-accent focus:ring-accent border-slate-300 rounded"
              />
              <div className="text-sm">
                <p className="text-ink font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Send me appointment reminders by text
                </p>
                <p className="text-xs text-ink-3 mt-0.5">
                  Reply STOP anytime to turn these off.
                </p>
              </div>
            </label>
          )}

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-btn flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-btn
              bg-accent text-white text-[15px] font-medium hover:bg-accent-ink transition
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Claiming account…</>
            ) : (
              <><CheckCircle className="w-4 h-4" /> Take over my account</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ClaimAccount;
