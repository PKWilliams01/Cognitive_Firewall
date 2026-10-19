import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Brain, ArrowRight, ArrowLeft, Lock, Mail, User, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import './LoginScreen.css';
import API_BASE from '../config';
import GoogleSignInButton from './GoogleSignInButton';

const INSIGHTS = [
  { stat: '2.5×', text: 'more heat is added to your revenge-risk score when you re-enter within 15 minutes of a loss.' },
  { stat: '80%', text: 'revenge risk triggers the Hard Lock. Execution stops until you reset.' },
  { stat: '1 rule', text: 'broken is all it takes to dent your discipline score. Plans only work if you follow them.' },
];

export default function LoginScreen({ onLoginSuccess, onBack, initialMode = 'login' }) {
  const [isLogin, setIsLogin] = useState(initialMode !== 'register');
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const showError = (message) => {
    setError(message);
    setErrorKey((k) => k + 1); // re-trigger the shake on repeated errors
  };

  const switchMode = (login) => {
    setIsLogin(login);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin
      ? `${API_BASE}/api/users/login`
      : `${API_BASE}/api/users/register`;

    try {
      const res = await axios.post(endpoint, formData);
      onLoginSuccess(isLogin ? res.data : { ...res.data, isNewUser: true });
    } catch (err) {
      console.error('Connection Error:', err);
      showError(err.response?.data?.message || 'Connection failed. Check your internet.');
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (e) => setFormData({ ...formData, [field]: e.target.value });

  return (
    <div className="auth">
      <div className="grid-bg" aria-hidden="true" />

      <BrandPanel />

      <section className="auth-main">
        {onBack && (
          <button type="button" className="auth-back" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
        )}

        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="auth-mobile-brand">
            <span className="auth-logo"><Brain size={16} /></span> Cognitive Firewall
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Choose sign in or create account">
            {[
              { id: true, label: 'Sign in' },
              { id: false, label: 'Create account' },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={isLogin === tab.id}
                className={`auth-tab ${isLogin === tab.id ? 'is-active' : ''}`}
                onClick={() => switchMode(tab.id)}
              >
                {isLogin === tab.id && (
                  <motion.span layoutId="auth-tab-pill" className="auth-tab-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                )}
                <span className="auth-tab-label">{tab.label}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isLogin ? 'login-head' : 'register-head'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <h1>{isLogin ? 'Welcome back' : 'Create your discipline profile'}</h1>
              <p className="auth-lead">
                {isLogin
                  ? 'Sign in to your terminal and pick up where your discipline left off.'
                  : 'Two minutes to set up. A lifetime of trading your plan instead of your mood.'}
              </p>
            </motion.div>
          </AnimatePresence>

          <GoogleSignInButton onSuccess={onLoginSuccess} onError={showError} disabled={loading} />

          <div className="auth-divider"><span>or continue with email</span></div>

          <AnimatePresence>
            {error && (
              <motion.div
                key={errorKey}
                className="auth-error"
                role="alert"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="auth-error-inner">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form className="auth-form" onSubmit={handleSubmit}>
            <AnimatePresence initial={false}>
              {!isLogin && (
                <motion.div
                  key="username"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <Field label="Username" icon={User}>
                    <input
                      type="text"
                      placeholder="Choose a username"
                      autoComplete="username"
                      required
                      value={formData.username}
                      onChange={update('username')}
                    />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>

            <Field label="Email" icon={Mail}>
              <input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
                value={formData.email}
                onChange={update('email')}
              />
            </Field>

            <Field
              label="Password"
              icon={Lock}
              trailing={
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            >
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                value={formData.password}
                onChange={update('password')}
              />
            </Field>

            <motion.button
              type="submit"
              disabled={loading}
              className="auth-submit"
              whileTap={{ scale: 0.985 }}
            >
              {loading ? (
                <><span className="auth-spinner" aria-hidden="true" /> {isLogin ? 'Signing in…' : 'Creating account…'}</>
              ) : (
                <>{isLogin ? 'Sign in' : 'Create account'} <ArrowRight size={18} /></>
              )}
            </motion.button>
          </form>

          <p className="auth-footnote">
            <ShieldCheck size={13} /> Analytics only — Cognitive Firewall never places trades or connects to your broker.
          </p>
        </motion.div>
      </section>
    </div>
  );
}

function Field({ label, icon: Icon, trailing, children }) {
  return (
    <label className="auth-field">
      <span className="auth-label">{label}</span>
      <span className="auth-input-wrap">
        <Icon size={16} className="auth-input-icon" aria-hidden="true" />
        {children}
        {trailing}
      </span>
    </label>
  );
}

function BrandPanel() {
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % INSIGHTS.length), 4500);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <aside className="auth-brand" aria-hidden="true">
      <div className="glow-orb auth-orb" />
      <div className="auth-brand-top">
        <span className="auth-logo"><Brain size={18} /></span>
        <span className="auth-brand-name">COGNITIVE<span>FIREWALL</span></span>
      </div>

      <div className="auth-brand-body">
        <h2>
          Discipline is a system.
          <br />
          <span>Not a mood.</span>
        </h2>

        <div className="auth-shield">
          {[0, 1, 2].map((ring) => (
            <motion.span
              key={ring}
              className="auth-ring"
              animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], opacity: [0.5, 0.15, 0.5] }}
              transition={{ duration: 3.2, repeat: Infinity, delay: ring * 0.6, ease: 'easeInOut' }}
              style={{ inset: `${ring * 26}px` }}
            />
          ))}
          <span className="auth-shield-core"><ShieldCheck size={34} /></span>
        </div>

        <div className="auth-insight">
          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45 }}
            >
              <span className="auth-insight-stat mono">{INSIGHTS[i].stat}</span>
              <p>{INSIGHTS[i].text}</p>
            </motion.div>
          </AnimatePresence>
          <div className="auth-dots">
            {INSIGHTS.map((_, n) => (
              <span key={n} className={n === i ? 'is-active' : ''} />
            ))}
          </div>
        </div>
      </div>

      <div className="auth-brand-foot mono">
        <span className="live-dot" /> FIREWALL ONLINE
      </div>
    </aside>
  );
}
