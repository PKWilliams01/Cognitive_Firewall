import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UserRound, Gauge, Quote, KeyRound, ShieldCheck, Download, Trash2, Save, Undo2, Globe, Lock,
} from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useToast } from './Toast';
import './Settings.css';

const EDITABLE = [
  'username', 'startingBalance', 'currency', 'plannedDailyLimit', 'maxRiskPercent',
  'lockThreshold', 'cooldownMinutes', 'strictConfluence', 'timezone', 'whyITrade',
];

const CURRENCIES = ['USD', 'GBP', 'EUR', 'JPY', 'AUD', 'CAD', 'CHF'];
const COOLDOWNS = [
  { value: 0, label: 'Rest of the trading day' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
];

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'firewall', label: 'Firewall & risk', icon: Gauge },
  { id: 'cooloff', label: 'Cool-off note', icon: Quote },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'data', label: 'Data & privacy', icon: ShieldCheck },
];

const detectedTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

const allTimeZones = () => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch { /* fall through */ }
  return ['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'Asia/Tokyo', 'Australia/Sydney'];
};

const pick = (obj) => Object.fromEntries(EDITABLE.map((k) => [k, obj?.[k]]));

export default function Settings({ onUserUpdated, onAccountDeleted }) {
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/api/users/me')
      .then((res) => { if (alive) { setProfile(res.data); setForm(pick(res.data)); } })
      .catch((err) => alive && setLoadError(errorMessage(err, 'Could not load your settings.')));
    return () => { alive = false; };
  }, []);

  const changed = useMemo(() => {
    if (!profile || !form) return {};
    return Object.fromEntries(EDITABLE.filter((k) => String(form[k]) !== String(profile[k])).map((k) => [k, form[k]]));
  }, [profile, form]);
  const dirty = Object.keys(changed).length > 0;

  const set = (field) => (e) => {
    const t = e.target;
    const value = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.type === 'range' ? (t.value === '' ? '' : Number(t.value)) : t.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/api/users/me', changed);
      setProfile(res.data);
      setForm(pick(res.data));
      onUserUpdated?.(res.data);
      toast.success('Settings saved. Your firewall is using the new limits.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save settings.'));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <div className="card empty">{loadError}</div>;
  if (!form) return <div className="card empty" aria-busy="true">Loading settings…</div>;

  const tz = detectedTimeZone();
  const cooldownLabel = COOLDOWNS.find((c) => c.value === Number(form.cooldownMinutes))?.label || `${form.cooldownMinutes} minutes`;

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#settings-${s.id}`} className="settings-nav-item">
            <s.icon size={15} /> {s.label}
          </a>
        ))}
      </nav>

      <div className="settings-body">
        {/* ---------- Profile ---------- */}
        <section id="settings-profile" className="card settings-section">
          <SectionHead icon={UserRound} title="Profile" sub="How you appear in the terminal." />
          <div className="settings-profile">
            {profile.avatarUrl
              ? <img className="settings-avatar" src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
              : <span className="settings-avatar settings-avatar-initials">{(form.username || 'T').slice(0, 1).toUpperCase()}</span>}
            <div className="settings-grid">
              <Field label="Display name">
                <input className="input" value={form.username} maxLength={60} onChange={set('username')} />
              </Field>
              <Field label="Email" hint={profile.authProvider === 'google' ? 'Managed by Google' : undefined}>
                <input className="input" value={profile.email} disabled />
              </Field>
            </div>
          </div>
        </section>

        {/* ---------- Firewall & risk ---------- */}
        <section id="settings-firewall" className="card settings-section">
          <SectionHead icon={Gauge} title="Firewall & risk" sub="The boundaries the server enforces on every trade." />

          <div className="settings-grid">
            <Field label="Starting balance" hint="Your equity curve is measured against this.">
              <div className="input-group">
                <select className="input input-addon" value={form.currency} onChange={set('currency')} aria-label="Currency">
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input className="input" type="number" min="1" step="1" value={form.startingBalance} onChange={set('startingBalance')} aria-label="Starting balance" />
              </div>
            </Field>

            <Field label="Max trades per day" hint="Daily limit lock and Impulsivity Index use this.">
              <input className="input" type="number" min="1" max="50" step="1" value={form.plannedDailyLimit} onChange={set('plannedDailyLimit')} />
            </Field>

            <Field label="Max risk per trade (%)" hint="Pre-flights above this are refused by the server.">
              <input className="input" type="number" min="0.1" max="100" step="0.1" value={form.maxRiskPercent} onChange={set('maxRiskPercent')} />
            </Field>

            <Field label="Cool-off after a Hard Lock">
              <select className="input" value={form.cooldownMinutes} onChange={set('cooldownMinutes')}>
                {COOLDOWNS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="settings-threshold">
            <div className="settings-threshold-head">
              <label htmlFor="lockThreshold">Hard Lock threshold</label>
              <span className="mono settings-threshold-value">{form.lockThreshold}%</span>
            </div>
            <input
              id="lockThreshold"
              className="range"
              type="range"
              min="50"
              max="100"
              step="1"
              value={form.lockThreshold}
              onChange={set('lockThreshold')}
              style={{ '--fill': `${((form.lockThreshold - 50) / 50) * 100}%` }}
            />
            <div className="settings-threshold-scale mono"><span>50 · strict</span><span>100 · lenient</span></div>
            <p className="settings-hint">
              Lower values lock you out earlier in a tilt spiral — before a bad hour becomes a bad week.
            </p>
          </div>

          <Toggle
            checked={form.strictConfluence}
            onChange={set('strictConfluence')}
            title="Strict confluence mode"
            desc="Refuse any pre-flight until every rule in your strategy is confirmed. No 'trade anyway' button."
          />

          <Field label="Trading-day timezone" hint="Defines when 'today' starts for limits and locks.">
            <div className="input-group">
              <span className="input-addon input-addon-icon"><Globe size={15} /></span>
              <select className="input" value={form.timezone} onChange={set('timezone')}>
                {allTimeZones().map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
              </select>
              {form.timezone !== tz && (
                <button type="button" className="btn btn-ghost" onClick={() => setForm((f) => ({ ...f, timezone: tz }))}>
                  Use {tz.replace(/_/g, ' ')}
                </button>
              )}
            </div>
          </Field>

          <div className="settings-summary">
            <Lock size={15} />
            <span>
              Locks at <strong>{form.lockThreshold}%</strong> revenge risk or after <strong>{form.plannedDailyLimit}</strong> trades,
              cools off for <strong>{cooldownLabel.toLowerCase()}</strong>, caps risk at <strong>{form.maxRiskPercent}%</strong>.
            </span>
          </div>
        </section>

        {/* ---------- Cool-off note ---------- */}
        <section id="settings-cooloff" className="card settings-section">
          <SectionHead icon={Quote} title="Cool-off note" sub="Shown to you when the Hard Lock engages. Write it while you're calm." />
          <textarea
            className="input settings-note"
            maxLength={400}
            rows={4}
            placeholder="Why do you trade? What does protecting your account protect for you?"
            value={form.whyITrade}
            onChange={set('whyITrade')}
          />
          <div className="settings-count mono">{(form.whyITrade || '').length}/400</div>
        </section>

        {/* ---------- Security ---------- */}
        <section id="settings-security" className="card settings-section">
          <SectionHead
            icon={KeyRound}
            title={profile.hasPassword ? 'Change password' : 'Set a password'}
            sub={profile.hasPassword ? 'Use at least 8 characters.' : 'You sign in with Google. Add a password to also sign in with email.'}
          />
          <PasswordForm hasPassword={profile.hasPassword} onDone={() => setProfile((p) => ({ ...p, hasPassword: true }))} />
        </section>

        {/* ---------- Data ---------- */}
        <section id="settings-data" className="card settings-section">
          <SectionHead icon={ShieldCheck} title="Data & privacy" sub="Your behavioural data belongs to you." />
          <ExportData />
          <DeleteAccount hasPassword={profile.hasPassword} onDeleted={onAccountDeleted} />
        </section>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            className="settings-savebar"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <span>{Object.keys(changed).length} unsaved {Object.keys(changed).length === 1 ? 'change' : 'changes'}</span>
            <div className="settings-savebar-actions">
              <button className="btn btn-ghost" onClick={() => setForm(pick(profile))} disabled={saving}>
                <Undo2 size={15} /> Discard
              </button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Save size={15} /> {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionHead({ icon: Icon, title, sub }) {
  return (
    <header className="settings-section-head">
      <span className="settings-section-icon"><Icon size={17} /></span>
      <div>
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
    </header>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, title, desc }) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-title">{title}</span>
        <span className="toggle-desc">{desc}</span>
      </span>
      <span className={`toggle ${checked ? 'is-on' : ''}`}>
        <input type="checkbox" role="switch" checked={checked} onChange={onChange} aria-label={title} />
        <span className="toggle-knob" />
      </span>
    </label>
  );
}

function PasswordForm({ hasPassword, onDone }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const mismatch = confirm && next !== confirm;
  const canSubmit = next.length >= 8 && next === confirm && (!hasPassword || current) && !busy;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/api/users/me/password', { currentPassword: current, newPassword: next });
      toast.success(res.data?.message || 'Password updated');
      setCurrent(''); setNext(''); setConfirm('');
      onDone?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update password.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-grid" onSubmit={submit}>
      {hasPassword && (
        <Field label="Current password">
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
      )}
      <Field label="New password" hint="At least 8 characters.">
        <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Confirm new password" hint={mismatch ? 'Passwords don’t match' : undefined}>
        <input className={`input ${mismatch ? 'is-invalid' : ''}`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <div className="settings-form-actions">
        <button className="btn btn-outline" type="submit" disabled={!canSubmit}>
          <KeyRound size={15} /> {hasPassword ? 'Change password' : 'Set password'}
        </button>
      </div>
    </form>
  );
}

function ExportData() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get('/api/users/me/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `cognitive-firewall-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-row">
      <div>
        <div className="toggle-title">Export your data</div>
        <div className="toggle-desc">Profile, every trade and journal entry as a JSON file.</div>
      </div>
      <button className="btn btn-outline" onClick={download} disabled={busy}>
        <Download size={15} /> {busy ? 'Preparing…' : 'Download export'}
      </button>
    </div>
  );
}

function DeleteAccount({ hasPassword, onDeleted }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const canDelete = typed === 'DELETE' && (!hasPassword || password) && !busy;

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete('/api/users/me', { data: { confirm: typed, password } });
      toast.info('Your account and all its data have been deleted.');
      onDeleted?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete account.'));
      setBusy(false);
    }
  };

  return (
    <div className="settings-danger">
      <div className="settings-row">
        <div>
          <div className="toggle-title">Delete account</div>
          <div className="toggle-desc">Permanently removes your profile, trades and journal. This can’t be undone.</div>
        </div>
        {!open && (
          <button className="btn btn-outline settings-danger-btn" onClick={() => setOpen(true)}>
            <Trash2 size={15} /> Delete account
          </button>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className="settings-danger-confirm"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="settings-grid">
              <Field label="Type DELETE to confirm">
                <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </Field>
              {hasPassword && (
                <Field label="Your password">
                  <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              )}
            </div>
            <div className="settings-form-actions">
              <button className="btn btn-ghost" onClick={() => { setOpen(false); setTyped(''); setPassword(''); }} disabled={busy}>Cancel</button>
              <button className="btn btn-danger" onClick={remove} disabled={!canDelete}>
                <Trash2 size={15} /> {busy ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
