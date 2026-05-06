import React, { useState } from 'react';
import axios from 'axios';
import { Upload, Trash2, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

// Self-contained logo upload control. Uploads directly to Cloudinary via
// an unsigned upload preset, then persists the returned secure_url to
// the provider's profile via the same /api/users/provider/settings PUT
// the rest of the settings page uses (partial update — only logoUrl is
// sent, the spread on the server preserves every other field).
//
// Env vars (both public, exposed in the client bundle — fine for
// unsigned uploads, which Cloudinary designed for this exact case):
//   REACT_APP_CLOUDINARY_CLOUD_NAME           — your Cloudinary cloud name
//   REACT_APP_CLOUDINARY_LOGO_UPLOAD_PRESET   — name of the unsigned preset
//
// Configure the preset in Cloudinary Settings → Upload to enforce server-
// side limits (max ~2 MB, allowed formats png/jpg/svg/webp, target
// folder, auto-resize). The 2 MB / image-mime check below is a friendly
// client-side guard, not the security boundary.
const LogoUploader = ({ currentLogoUrl, onLogoChange }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const cloudName = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.REACT_APP_CLOUDINARY_LOGO_UPLOAD_PRESET;
  const configured = !!cloudName && !!uploadPreset;

  const persist = async (logoUrl) => {
    await axios.put(
      '/api/users/provider/settings',
      { settings: { logoUrl } },
      { withCredentials: true }
    );
    onLogoChange?.(logoUrl);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-upload of same file after removal
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be under 2 MB.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (!res.ok || !data.secure_url) {
        throw new Error(data.error?.message || 'Upload failed');
      }
      await persist(data.secure_url);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    setError(null);
    try {
      await persist(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not remove logo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        Business Logo
      </label>

      {!configured && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Logo upload isn't configured yet. Set{' '}
            <code>REACT_APP_CLOUDINARY_CLOUD_NAME</code> and{' '}
            <code>REACT_APP_CLOUDINARY_LOGO_UPLOAD_PRESET</code> on the deploy.
          </span>
        </div>
      )}

      {configured && (
        <>
          <div className="flex items-center gap-3 mb-2">
            {currentLogoUrl ? (
              <>
                <img
                  src={currentLogoUrl}
                  alt="Your business logo"
                  className="h-14 w-auto max-w-[200px] bg-white p-1 border border-line rounded"
                />
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-700 bg-white border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                No logo set — emails will show your business name as styled text.
              </p>
            )}
          </div>

          <label
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border cursor-pointer transition-colors ${
              uploading
                ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-line'
                : 'bg-white text-[#B07A4E] border-[#B07A4E]/30 hover:bg-[#B07A4E]/5'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {currentLogoUrl ? 'Replace logo' : 'Upload logo'}
              </>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />
          </label>

          {error && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          {savedFlash && (
            <p className="mt-1 text-xs text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Saved.
            </p>
          )}

          <p className="mt-2 text-xs text-slate-500">
            PNG with a transparent background works best. Max 2 MB.
            Logo shows up in your booking confirmation, reminder, and receipt
            emails — clients see your brand, not Avayble's.
          </p>
        </>
      )}
    </div>
  );
};

export default LogoUploader;
