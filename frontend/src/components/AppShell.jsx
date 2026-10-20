import React from 'react';
import { motion } from 'framer-motion';
import {
  Brain, LayoutDashboard, BookOpen, SlidersHorizontal, Settings, Zap, LogOut, CircleHelp, Compass, Lock, Keyboard,
} from 'lucide-react';
import './AppShell.css';

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, subtitle: 'Your behavioural risk at a glance' },
  { id: 'journal', label: 'Journal', icon: BookOpen, subtitle: 'Every execution, with the psychology behind it' },
  { id: 'strategy', label: 'Strategy', icon: SlidersHorizontal, subtitle: 'The rules your firewall enforces' },
  { id: 'settings', label: 'Settings', icon: Settings, subtitle: 'Risk limits, cool-off, security and your data' },
];

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'T';

function Avatar({ user }) {
  if (user?.avatarUrl) {
    return <img className="shell-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  }
  return <span className="shell-avatar shell-avatar-initials">{initials(user?.username)}</span>;
}

function FirewallStatus({ locked }) {
  return (
    <span className={`shell-status ${locked ? 'is-locked' : ''}`} role="status">
      {locked ? <Lock size={13} /> : <span className="live-dot" />}
      {locked ? 'FIREWALL LOCKED' : 'FIREWALL ARMED'}
    </span>
  );
}

export default function AppShell({
  user, view, onNavigate, onExecute, onOpenGuide, onStartTour, onLogout, onShowShortcuts, firewallLocked = false, children,
}) {
  const current = NAV.find((n) => n.id === view) || NAV[0];
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="shell">
      <div className="grid-bg" aria-hidden="true" />

      {/* ---- Sidebar (desktop) ---- */}
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <span className="shell-logo"><Brain size={17} /></span>
          <span className="shell-brand-text">COGNITIVE<span>FIREWALL</span></span>
        </div>

        <button className={`btn ${firewallLocked ? 'btn-danger' : 'btn-primary'} shell-execute`} onClick={onExecute}>
          {firewallLocked ? <Lock size={16} /> : <Zap size={16} />}
          {firewallLocked ? 'Execution locked' : 'Execute trade'}
        </button>

        <nav className="shell-nav" aria-label="Main">
          <span className="shell-nav-label mono">TERMINAL</span>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`shell-nav-item ${view === item.id ? 'is-active' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {view === item.id && (
                <motion.span layoutId="shell-nav-active" className="shell-nav-active" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
              )}
              <item.icon size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="shell-sidebar-foot">
          {onStartTour && (
            <button className="shell-nav-item" onClick={onStartTour}>
              <Compass size={17} /> <span>Take the tour</span>
            </button>
          )}
          <button className="shell-nav-item" onClick={onOpenGuide}>
            <CircleHelp size={17} /> <span>Operator's manual</span>
          </button>
          {onShowShortcuts && (
            <button className="shell-nav-item" onClick={onShowShortcuts}>
              <Keyboard size={17} /> <span>Keyboard shortcuts</span> <kbd className="shell-kbd">?</kbd>
            </button>
          )}
          <div className="shell-user">
            <Avatar user={user} />
            <div className="shell-user-meta">
              <span className="shell-user-name">{user?.username || 'Trader'}</span>
              <span className="shell-user-email">{user?.email}</span>
            </div>
            <button className="shell-icon-btn" onClick={onLogout} aria-label="Log out" title="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ---- Main column ---- */}
      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-mobile-brand">
            <span className="shell-logo"><Brain size={15} /></span>
          </div>
          <div className="shell-title">
            <h1>{current.label}</h1>
            <p>{current.subtitle}</p>
          </div>
          <div className="shell-topbar-right">
            <span className="shell-date">{today}</span>
            <FirewallStatus locked={firewallLocked} />
            {onStartTour && (
              <button className="shell-icon-btn shell-mobile-only" onClick={onStartTour} aria-label="Take the tour">
                <Compass size={17} />
              </button>
            )}
            <button className="shell-icon-btn shell-mobile-only" onClick={onOpenGuide} aria-label="Operator's manual">
              <CircleHelp size={17} />
            </button>
            <button className="shell-icon-btn shell-mobile-only" onClick={onLogout} aria-label="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="shell-content">{children}</main>
      </div>

      {/* ---- Bottom tab bar (mobile) ---- */}
      <nav className="shell-tabbar" aria-label="Main mobile">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`shell-tab ${view === item.id ? 'is-active' : ''}`}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon size={19} />
            <span>{item.label}</span>
          </button>
        ))}
        <button className={`shell-tab shell-tab-execute ${firewallLocked ? 'is-locked' : ''}`} onClick={onExecute}>
          {firewallLocked ? <Lock size={19} /> : <Zap size={19} />}
          <span>{firewallLocked ? 'Locked' : 'Execute'}</span>
        </button>
      </nav>

    </div>
  );
}
