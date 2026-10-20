import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import api, { AUTH_EXPIRED_EVENT, getStoredUser } from './api/client';
import Welcome from './pages/Welcome';
import LoginScreen from './components/LoginScreen';
import AppShell from './components/AppShell';
import Dashboard from './components/Dashboard';
import PageWrapper from './components/PageWrapper';
import { LOCK_THRESHOLD } from './components/RiskMeter';
import TradeExecutionWizard from './components/TradeExecutionWizard';
import StrategySettings from './components/StrategySettings';
import { ReflectiveJournal } from './components/ReflectiveJournal';
import Settings from './components/Settings';
import Guidebook from './components/Guidebook';
import { ToastProvider, useToast } from './components/Toast';

const browserTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
};

function App() {
  return (
    <ToastProvider>
      <CognitiveFirewall />
    </ToastProvider>
  );
}

function CognitiveFirewall() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [showWizard, setShowWizard] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [authStage, setAuthStage] = useState('welcome'); // 'welcome' | 'login'
  const [authMode, setAuthMode] = useState('login'); // which tab the auth screen opens on

  const fetchTradeHistory = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const [tradesRes, metricsRes] = await Promise.all([
        api.get(`/api/trades/user/${userId}`),
        api.get(`/api/trades/metrics/${userId}`),
      ]);
      setTradeHistory(tradesRes.data || []);
      setMetrics(metricsRes.data || {});
    } catch {
      // 401s are handled by the auth-expired listener; anything else leaves
      // the last known data on screen.
    }
  }, []);

  // Persist profile changes without losing the session token.
  const updateUser = useCallback((profile) => {
    setUser((prev) => {
      const next = { ...prev, ...profile, token: prev?.token };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    localStorage.removeItem('user');
    setTradeHistory([]);
    setMetrics(null);
    setView('dashboard');
    setShowWizard(false);
    setAuthStage('welcome');
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
      fetchTradeHistory(stored._id);
    }
  }, [fetchTradeHistory]);

  // Expired or revoked token anywhere in the app -> back to sign-in, with a reason.
  useEffect(() => {
    const onExpired = () => {
      signOut();
      setAuthMode('login');
      setAuthStage('login');
      toast.info('Your session has expired. Please sign in again.');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [signOut, toast]);

  // Users start on UTC; adopt the browser's zone once so "today" matches their clock.
  useEffect(() => {
    const tz = browserTimeZone();
    if (!user?._id || !tz || tz === 'UTC' || (user.timezone && user.timezone !== 'UTC')) return;
    api.patch('/api/users/me', { timezone: tz })
      .then((res) => { updateUser(res.data); fetchTradeHistory(res.data._id); })
      .catch(() => {});
  }, [user?._id, user?.timezone, updateUser, fetchTradeHistory]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    fetchTradeHistory(userData._id);
    if (userData.isNewUser) setShowGuide(true);
  };

  // --- AUTH FLOW: Welcome -> Login ---
  if (!user) {
    if (authStage === 'welcome') {
      return (
        <Welcome
          onContinue={(mode = 'login') => {
            setAuthMode(mode);
            setAuthStage('login');
          }}
        />
      );
    }
    return (
      <LoginScreen
        key={authMode}
        initialMode={authMode}
        onLoginSuccess={handleLoginSuccess}
        onBack={() => setAuthStage('welcome')}
      />
    );
  }

  // The server is authoritative; fall back to the score for older payloads.
  const firewallLocked = metrics?.isLocked ?? (metrics?.revengeRisk || 0) >= LOCK_THRESHOLD;

  return (
    <>
      <AppShell
        user={user}
        view={view}
        onNavigate={setView}
        onExecute={() => setShowWizard(true)}
        onOpenGuide={() => setShowGuide(true)}
        onLogout={signOut}
        firewallLocked={firewallLocked}
      >
        <AnimatePresence mode="wait">
          <PageWrapper key={view}>
            {view === 'dashboard' && (
              <Dashboard user={user} metrics={metrics} trades={tradeHistory} onExecute={() => setShowWizard(true)} />
            )}
            {view === 'strategy' && <StrategySettings user={user} onUpdate={updateUser} />}
            {view === 'journal' && (
              <ReflectiveJournal trades={tradeHistory} userId={user._id} onTradeLogged={() => fetchTradeHistory(user._id)} />
            )}
            {view === 'settings' && (
              <Settings
                onUserUpdated={(profile) => { updateUser(profile); fetchTradeHistory(user._id); }}
                onAccountDeleted={signOut}
              />
            )}
          </PageWrapper>
        </AnimatePresence>
      </AppShell>

      {showWizard && (
        <div className="wizard-overlay">
          <TradeExecutionWizard
            userId={user._id}
            user={user}
            firewall={metrics}
            revengeRisk={metrics?.revengeRisk || 0}
            onClose={() => setShowWizard(false)}
            onTradeSuccess={() => fetchTradeHistory(user._id)}
          />
        </div>
      )}

      <AnimatePresence>
        {showGuide && <Guidebook onClose={() => setShowGuide(false)} />}
      </AnimatePresence>
    </>
  );
}

export default App;
