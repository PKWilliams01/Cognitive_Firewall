import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from './config';
import { AnimatePresence } from 'framer-motion';
import Welcome from './pages/Welcome';
import LoginScreen from './components/LoginScreen';
import AppShell from './components/AppShell';
import Dashboard from './components/Dashboard';
import PageWrapper from './components/PageWrapper';
import { LOCK_THRESHOLD } from './components/RiskMeter';
import TradeExecutionWizard from './components/TradeExecutionWizard';
import StrategySettings from './components/StrategySettings';
import { ReflectiveJournal } from './components/ReflectiveJournal';
import Guidebook from './components/Guidebook';

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [showWizard, setShowWizard] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [authStage, setAuthStage] = useState('welcome'); // 'welcome' | 'login'
  const [authMode, setAuthMode] = useState('login'); // which tab the auth screen opens on

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser && storedUser !== "undefined") {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchTradeHistory(parsedUser._id);
    }
  }, []);

  const fetchTradeHistory = async (userId) => {
    if (!userId) return;

    // 1. Grab the VIP Badge (JWT) from local storage
    const storedUser = JSON.parse(localStorage.getItem('user'));
    const token = storedUser?.token;
    // 2. Create the Authorization Header
    const config = {
      headers: { Authorization: `Bearer ${token}` }
    };

    if (!userId) return;
    try {
      const [tradesRes, metricsRes] = await Promise.all([
        // ADD `, config` to the end of both of these lines!
        axios.get(`${API_BASE}/api/trades/user/${userId}`, config),
        axios.get(`${API_BASE}/api/trades/metrics/${userId}`, config)
      ]);
      setTradeHistory(tradesRes.data || []); 
      setMetrics(metricsRes.data || {});
    } catch (err) {
      console.error("Sync Error:", err);
    }
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    fetchTradeHistory(userData._id);
    if (userData.isNewUser) setShowGuide(true);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setTradeHistory([]);
    setMetrics(null);
    setAuthStage('welcome');
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

  const firewallLocked = (metrics?.revengeRisk || 0) >= LOCK_THRESHOLD;

  return (
    <>
      <AppShell
        user={user}
        view={view}
        onNavigate={setView}
        onExecute={() => setShowWizard(true)}
        onOpenGuide={() => setShowGuide(true)}
        onLogout={handleLogout}
        firewallLocked={firewallLocked}
      >
        <AnimatePresence mode="wait">
          <PageWrapper key={view}>
            {view === 'dashboard' && (
              <Dashboard user={user} metrics={metrics} trades={tradeHistory} onExecute={() => setShowWizard(true)} />
            )}
            {view === 'strategy' && <StrategySettings user={user} onUpdate={setUser} />}
            {view === 'journal' && (
              <ReflectiveJournal trades={tradeHistory} userId={user._id} onTradeLogged={() => fetchTradeHistory(user._id)} />
            )}
          </PageWrapper>
        </AnimatePresence>
      </AppShell>

      {showWizard && (
        <div className="wizard-overlay">
          <TradeExecutionWizard
            userId={user._id}
            user={user}
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