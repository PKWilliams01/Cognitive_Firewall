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
import CooldownScreen from './components/CooldownScreen';
import ShortcutsHelp from './components/ShortcutsHelp';
import useShortcuts from './hooks/useShortcuts';
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
  const [showCooldown, setShowCooldown] = useState(false);
  const [journalTab, setJournalTab] = useState('trades');
  const [showKeys, setShowKeys] = useState(false);
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
    setShowCooldown(false);
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

  // When the server reports the lock has lifted, close the cool-off screen.
  useEffect(() => {
    if (showCooldown && metrics && metrics.isLocked === false) {
      setShowCooldown(false);
      toast.success('Cool-off complete. The firewall has reopened — trade your plan.');
    }
  }, [showCooldown, metrics, toast]);

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

  const isLocked = metrics?.isLocked ?? (metrics?.revengeRisk || 0) >= LOCK_THRESHOLD;

  // Execute opens the wizard, or the cool-off screen while the firewall is locked.
  const openExecute = useCallback(
    () => (isLocked ? setShowCooldown(true) : setShowWizard(true)),
    [isLocked]
  );
  const navigate = useCallback((next) => {
    if (next === 'journal') setJournalTab('trades');
    setView(next);
  }, []);

  // Keyboard shortcuts (off while signed out or a dialog is open).
  useShortcuts({
    onExecute: openExecute,
    onNavigate: navigate,
    onHelp: () => setShowKeys(true),
    enabled: Boolean(user) && !showWizard && !showCooldown && !showGuide && !showKeys,
  });

  // Installed-app shortcuts (manifest): ?view=journal&tab=checkins, ?action=execute
  useEffect(() => {
    if (!user?._id || metrics === null) return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get('view');
    const action = params.get('action');
    if (!target && !action) return;
    if (['dashboard', 'journal', 'strategy', 'settings'].includes(target)) {
      setJournalTab(target === 'journal' && params.get('tab') === 'checkins' ? 'checkins' : 'trades');
      setView(target);
    }
    if (action === 'execute') openExecute();
    window.history.replaceState(null, '', window.location.pathname);
  }, [user?._id, metrics, openExecute]);

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
  const firewallLocked = isLocked;


  return (
    <>
      <AppShell
        user={user}
        view={view}
        onNavigate={navigate}
        onExecute={openExecute}
        onOpenGuide={() => setShowGuide(true)}
        onLogout={signOut}
        onShowShortcuts={() => setShowKeys(true)}
        firewallLocked={firewallLocked}
      >
        <AnimatePresence mode="wait">
          <PageWrapper key={view}>
            {view === 'dashboard' && (
              <Dashboard user={user} metrics={metrics} trades={tradeHistory} onExecute={openExecute} />
            )}
            {view === 'strategy' && <StrategySettings user={user} onUpdate={updateUser} firewallLocked={firewallLocked} />}
            {view === 'journal' && (
              <ReflectiveJournal
                key={journalTab}
                initialTab={journalTab}
                trades={tradeHistory}
                userId={user._id}
                onTradeLogged={() => fetchTradeHistory(user._id)}
              />
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
            user={user}
            firewall={metrics}
            onClose={() => setShowWizard(false)}
            onTradeSuccess={() => fetchTradeHistory(user._id)}
            onLocked={() => {
              setShowWizard(false);
              fetchTradeHistory(user._id);
              setShowCooldown(true);
            }}
          />
        </div>
      )}

      <AnimatePresence>
        {showCooldown && (
          <CooldownScreen
            firewall={metrics}
            user={user}
            onClose={() => setShowCooldown(false)}
            onUnlock={() => fetchTradeHistory(user._id)}
            onCheckIn={() => {
              setShowCooldown(false);
              setJournalTab('checkins');
              setView('journal');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGuide && <Guidebook onClose={() => setShowGuide(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showKeys && <ShortcutsHelp onClose={() => setShowKeys(false)} />}
      </AnimatePresence>
    </>
  );
}

export default App;
