import React, { useState } from 'react';
import axios from 'axios';
import { Brain, ArrowRight, Lock, Mail, AlertCircle } from 'lucide-react';
import './LoginScreen.css';
import API_BASE from '../config';

export default function LoginScreen({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin
      ? `${API_BASE}/api/users/login`
      : `${API_BASE}/api/users/register`;

    try {
      const res = await axios.post(endpoint, formData);
      onLoginSuccess(res.data);
    } catch (err) {
      console.error('Connection Error:', err);
      setError(err.response?.data?.message || 'Connection failed. Check your internet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-pill">
          <Brain size={16} /> Cognitive Firewall
        </div>

        <h1>{isLogin ? 'Sign in to your Terminal' : 'Create your Discipline Profile'}</h1>
        <p className="auth-lead">
          {isLogin
            ? 'Authenticate to access your behavioral dashboard and execution telemetry.'
            : 'Register to start tracking discipline, revenge risk, and trading behavior.'}
        </p>

        {error && (
          <div className="auth-error">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <label className="auth-field">
              <span className="auth-label">Username</span>
              <div className="auth-input-wrap">
                <input
                  type="text"
                  placeholder="Choose a username"
                  required
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
            </label>
          )}

          <label className="auth-field">
            <span className="auth-label">Email</span>
            <div className="auth-input-wrap">
              <Mail size={16} className="auth-input-icon" />
              <input
                type="email"
                placeholder="you@example.com"
                required
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <div className="auth-input-wrap">
              <Lock size={16} className="auth-input-icon" />
              <input
                type="password"
                placeholder="••••••••"
                required
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
          </label>

          <button type="submit" disabled={loading} className="auth-btn primary">
            {loading ? 'Processing…' : isLogin ? 'Login' : 'Create Account'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <button
          type="button"
          className="auth-toggle"
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
          }}
        >
          {isLogin ? 'Need an account? Register' : 'Have an account? Login'}
        </button>

        <p className="auth-footnote">
          This interface analyzes your executions and behavior. It does not place live trades or connect to broker accounts.
        </p>
      </div>
    </div>
  );
}