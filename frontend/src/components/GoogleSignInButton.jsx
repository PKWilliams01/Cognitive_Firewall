import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API_BASE, { GOOGLE_CLIENT_ID } from '../config';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

// Load Google Identity Services once and share the promise across mounts.
let gsiPromise;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => {
        gsiPromise = undefined;
        reject(new Error('Google sign-in failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return gsiPromise;
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * "Continue with Google". Google renders the actual button (required for the
 * ID-token flow); we exchange the returned credential for our own JWT.
 */
export default function GoogleSignInButton({ onSuccess, onError, disabled }) {
  const slotRef = useRef(null);
  const handlersRef = useRef({ onSuccess, onError });
  const [status, setStatus] = useState(GOOGLE_CLIENT_ID ? 'loading' : 'unconfigured');

  handlersRef.current = { onSuccess, onError };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !slotRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            try {
              const res = await axios.post(`${API_BASE}/api/users/google`, { credential });
              handlersRef.current.onSuccess?.(res.data);
            } catch (err) {
              handlersRef.current.onError?.(
                err.response?.data?.message || 'Google sign-in failed. Please try again.'
              );
            }
          },
        });
        const width = Math.min(slotRef.current.offsetWidth || 360, 400);
        window.google.accounts.id.renderButton(slotRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          width,
        });
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'unconfigured' || status === 'error') {
    return (
      <button
        type="button"
        className="google-btn-fallback"
        disabled
        title={status === 'error' ? 'Google sign-in could not load' : 'Google sign-in is not configured yet'}
      >
        <GoogleMark /> Continue with Google
      </button>
    );
  }

  return (
    <div className={`google-btn-slot ${disabled ? 'is-disabled' : ''}`} aria-busy={status === 'loading'}>
      {status === 'loading' && (
        <div className="google-btn-fallback is-loading" aria-hidden="true">
          <GoogleMark /> Continue with Google
        </div>
      )}
      <div ref={slotRef} className="google-btn-target" />
    </div>
  );
}
