import React from 'react';
import { motion } from 'framer-motion';
import {
  Target, Activity, Scale, Wallet, Percent, Sparkles, ShieldCheck, ShieldAlert, Lock, Zap,
  TrendingUp, CircleCheck, CircleX, Flame, TriangleAlert,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import RiskMeter, { LOCK_THRESHOLD } from './RiskMeter';
import useCountUp from './useCountUp';
import './Dashboard.css';

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const greeting = (d = new Date()) => {
  const h = d.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const relativeTime = (value) => {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days < 7 ? `${days}d ago` : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const money = (n) =>
  `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Insight copy — logic unchanged from the original panel.
function generateStatisticalInsight(hasTrades, trades) {
  if (!hasTrades || trades.length < 3) {
    return 'Insufficient telemetry. System requires more execution data to formulate statistical behavioral correlations.';
  }
  const disciplined = trades.filter((t) => t.followedPlan);
  const impulsive = trades.filter((t) => !t.followedPlan);
  if (impulsive.length === 0) {
    return 'Optimal Behavioral State: You have a 100% plan adherence rate. Your statistical edge is fully protected.';
  }

  const discWins = disciplined.filter((t) => toNumber(t.pnl) > 0).length;
  const impWins = impulsive.filter((t) => toNumber(t.pnl) > 0).length;
  const discWinRate = disciplined.length ? (discWins / disciplined.length) * 100 : 0;
  const impWinRate = impulsive.length ? (impWins / impulsive.length) * 100 : 0;
  const rateDifference = Math.max(0, discWinRate - impWinRate).toFixed(1);
  const impulsiveCapitalLost = impulsive
    .filter((t) => toNumber(t.pnl) < 0)
    .reduce((acc, curr) => acc + Math.abs(toNumber(curr.pnl)), 0);

  if (discWinRate > impWinRate && impulsiveCapitalLost > 0) {
    return `Cognitive Deviation Penalty: Bypassing your pre-flight checklist degrades your win rate by ${rateDifference}%. You have leaked $${impulsiveCapitalLost.toFixed(2)} in capital strictly from unverified, impulsive execution.`;
  } else if (impulsiveCapitalLost > 0) {
    return `Warning: High variance in unverified executions. You have leaked $${impulsiveCapitalLost.toFixed(2)} to impulsive trades. Return to strict checklist adherence to stabilize your equity curve.`;
  }
  return 'Telemetry monitoring active. Ensure all confluences are checked prior to execution to maintain edge.';
}

const insightTone = (text) =>
  text.startsWith('Optimal')
    ? 'up'
    : text.startsWith('Cognitive Deviation') || text.startsWith('Warning')
      ? 'down'
      : 'neutral';

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: 0.05 * i, duration: 0.55, ease: [0.16, 1, 0.3, 1] } }),
};

export default function Dashboard({ user, trades = [], metrics, onExecute }) {
  const {
    hasTrades = false,
    disciplineScore = 100,
    revengeRisk = 0,
    impulsivityIndex = 0,
    dispositionRatio = '0.00',
    systemIntegrity = 100,
    netPnl = 0,
    winRate = 0,
    chartData = [],
    warnings = [],
    lockThreshold = LOCK_THRESHOLD,
    lockReason,
    lockedUntil,
    dailyLimit,
  } = metrics || {};

  // Server verdict first (it knows the user's threshold, cooldown and limit);
  // fall back to the score for older payloads.
  const locked = metrics?.isLocked ?? revengeRisk >= lockThreshold;
  const dailyLimitLock = locked && lockReason === 'daily_limit';
  const elevated = !locked && revengeRisk >= 50;
  const impulsivity = toNumber(impulsivityIndex);
  const disposition = toNumber(dispositionRatio);
  const pnl = toNumber(netPnl);
  const insight = generateStatisticalInsight(hasTrades, trades);
  const firstName = (user?.username || 'Trader').split(' ')[0];
  const untilLabel = lockedUntil
    ? new Date(lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const state = dailyLimitLock
    ? { icon: Lock, title: 'Daily limit reached', copy: `You've taken all ${dailyLimit ? `${dailyLimit} ` : ''}trades your plan allows today. The firewall reopens tomorrow — protect today's result.`, tone: 'down' }
    : locked
      ? { icon: Lock, title: 'Hard Lock engaged', copy: untilLabel ? `Revenge risk is critical. Execution is locked until ${untilLabel} — step away and reset.` : 'Revenge risk is critical. Execution is locked — step away, reset, and come back to your plan.', tone: 'down' }
      : elevated
        ? { icon: ShieldAlert, title: 'Tilt risk rising', copy: 'Your recent pattern looks reactive. Slow down and re-check your pre-flight before the next entry.', tone: 'warn' }
        : { icon: ShieldCheck, title: 'Composed and in control', copy: 'No signs of tilt. Execution protocols are active — trade your plan.', tone: 'up' };

  const integrityColor = systemIntegrity >= 70 ? 'var(--primary)' : systemIntegrity >= 40 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="dash">
      <motion.div className="dash-greeting" variants={rise} initial="hidden" animate="show">
        <h2>{greeting()}, {firstName}</h2>
        <p>{hasTrades ? 'Here’s how your discipline is holding up.' : 'Your firewall is armed and ready for your first session.'}</p>
      </motion.div>

      {/* ---- Hero: firewall state ---- */}
      <motion.section
        className={`card dash-hero t-${state.tone}`}
        variants={rise}
        initial="hidden"
        animate="show"
        custom={1}
        aria-label="Firewall status"
      >
        <div className="dash-hero-meter">
          <RiskMeter value={revengeRisk} threshold={lockThreshold} />
        </div>
        <div className="dash-hero-body">
          <span className={`badge badge-${state.tone}`}><state.icon size={12} /> Firewall status</span>
          <h3>{state.title}</h3>
          <p>{state.copy}</p>

          <div className="dash-integrity">
            <div className="dash-integrity-row">
              <span>System integrity</span>
              <span className="mono">{systemIntegrity}%</span>
            </div>
            <div className="meter" style={{ color: integrityColor }}>
              <span style={{ width: `${Math.max(0, Math.min(100, systemIntegrity))}%` }} />
            </div>
          </div>

          <button className={`btn ${locked ? 'btn-danger' : 'btn-primary'} dash-hero-cta`} onClick={onExecute}>
            {locked ? <><Lock size={16} /> View lock status</> : <><Zap size={16} /> Start pre-flight</>}
          </button>
        </div>
      </motion.section>

      {/* ---- KPIs ---- */}
      <div className="dash-kpis">
        <Kpi
          i={2} icon={Target} label="Discipline" value={disciplineScore} format={(v) => `${Math.round(v)}%`}
          sub="Plan adherence today" meter={disciplineScore}
          tone={disciplineScore >= 70 ? 'up' : disciplineScore >= 40 ? 'warn' : 'down'}
        />
        <Kpi
          i={3} icon={Activity} label="Impulsivity" value={impulsivity} decimals={2} format={(v) => `${v.toFixed(2)}×`}
          sub="of your daily trade limit" meter={Math.min(impulsivity, 1) * 100}
          tone={impulsivity < 1 ? 'up' : impulsivity === 1 ? 'warn' : 'down'}
        />
        <Kpi
          i={4} icon={Scale} label="Disposition" value={disposition} decimals={2} format={(v) => v.toFixed(2)}
          sub="Loss vs win hold time · aim < 1"
          tone={!hasTrades || disposition <= 1 ? 'up' : 'down'}
        />
        <Kpi
          i={5} icon={Wallet} label="Net P/L" value={pnl} decimals={2} format={money}
          sub="All-time outcome"
          tone={pnl > 0 ? 'up' : pnl < 0 ? 'down' : 'neutral'}
        />
        <Kpi
          i={6} icon={Percent} label="Win rate" value={winRate} format={(v) => `${Math.round(v)}%`}
          sub="Across all trades" meter={winRate}
          tone={!hasTrades ? 'neutral' : winRate >= 50 ? 'up' : 'warn'}
        />
      </div>

      {/* ---- Live alerts from the server ---- */}
      {warnings.length > 0 && (
        <motion.section className="card dash-alerts" variants={rise} initial="hidden" animate="show" custom={6.5} aria-label="Live alerts">
          <span className="card-title"><TriangleAlert size={14} /> Live alerts</span>
          <ul>
            {warnings.map((w) => (
              <li key={w.code} className={`dash-alert sev-${w.severity}`}>
                <span className="dash-alert-dot" aria-hidden="true" />
                {w.message}
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* ---- Insight ---- */}
      <motion.section
        className={`card dash-insight t-${insightTone(insight)}`}
        variants={rise}
        initial="hidden"
        animate="show"
        custom={7}
      >
        <span className="dash-insight-icon"><Sparkles size={18} /></span>
        <div>
          <span className="card-title">Insight engine</span>
          <p>{insight}</p>
        </div>
      </motion.section>

      {/* ---- Chart + activity ---- */}
      {hasTrades ? (
        <div className="dash-lower">
          <motion.section className="card dash-chart" variants={rise} initial="hidden" animate="show" custom={8}>
            <div className="card-header">
              <span className="card-title"><TrendingUp size={14} /> Net return</span>
              <EquityBadge data={chartData} />
            </div>
            <EquityCurve data={chartData} />
          </motion.section>

          <motion.section className="card dash-activity" variants={rise} initial="hidden" animate="show" custom={9}>
            <div className="card-header">
              <span className="card-title">Recent activity</span>
              <span className="badge badge-neutral">{trades.length} {trades.length === 1 ? 'trade' : 'trades'}</span>
            </div>
            <ul className="dash-trades">
              {trades.slice(0, 6).map((t, idx) => <TradeRow key={t._id || idx} t={t} />)}
            </ul>
          </motion.section>
        </div>
      ) : (
        <motion.section className="card dash-empty" variants={rise} initial="hidden" animate="show" custom={8}>
          <span className="dash-empty-icon"><Flame size={22} /></span>
          <h3>No trades logged yet</h3>
          <p>
            Run your first pre-flight check. Every trade you log sharpens your discipline score,
            revenge-risk model and insights.
          </p>
          <button className="btn btn-primary" onClick={onExecute}><Zap size={16} /> Run your first pre-flight</button>
        </motion.section>
      )}
    </div>
  );
}

function Kpi({ i, icon: Icon, label, value, decimals = 0, format, sub, meter, tone = 'neutral' }) {
  const animated = useCountUp(value, { decimals });
  return (
    <motion.div className={`card dash-kpi t-${tone}`} variants={rise} initial="hidden" animate="show" custom={i}>
      <div className="dash-kpi-head">
        <span className="dash-kpi-icon"><Icon size={15} /></span>
        <span className="dash-kpi-label">{label}</span>
      </div>
      <div className="dash-kpi-value mono" aria-label={`${label} ${format(value)}`}>{format(animated)}</div>
      {meter !== undefined && (
        <div className="meter dash-kpi-meter"><span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} /></div>
      )}
      <div className="dash-kpi-sub">{sub}</div>
    </motion.div>
  );
}

function EquityBadge({ data }) {
  const last = data.length ? toNumber(data[data.length - 1].growth) : 0;
  return (
    <span className={`badge ${last >= 0 ? 'badge-up' : 'badge-down'}`}>
      {last >= 0 ? '+' : ''}{last.toFixed(2)}%
    </span>
  );
}

function EquityCurve({ data }) {
  const last = data.length ? toNumber(data[data.length - 1].growth) : 0;
  const color = last >= 0 ? '#00e5a0' : '#ff4d6d';
  return (
    <div className="dash-chart-body">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1e2632" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4d5866' }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: '#4d5866' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={48} />
          <ReferenceLine y={0} stroke="#2b3545" />
          <Tooltip
            cursor={{ stroke: '#2b3545' }}
            contentStyle={{
              background: '#10151d', border: '1px solid #2b3545', borderRadius: 10, color: '#e6edf3',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            }}
            labelStyle={{ color: '#7d8a9c' }}
            formatter={(v) => [`${v}%`, 'Net return']}
          />
          <Area
            type="monotone" dataKey="growth" stroke={color} strokeWidth={2.5} fill="url(#equityFill)"
            dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TradeRow({ t }) {
  const pnl = toNumber(t.pnl);
  const long = t.direction === 'buy' || t.direction === 'Long';
  return (
    <li className="dash-trade">
      <span className={`badge ${long ? 'badge-up' : 'badge-down'}`}>{long ? 'Long' : 'Short'}</span>
      <div className="dash-trade-main">
        <span className="dash-trade-inst">{t.instrument || 'Asset'}</span>
        <span className="dash-trade-meta">
          {t.followedPlan
            ? <><CircleCheck size={12} className="text-up" /> Plan followed</>
            : <><CircleX size={12} className="text-down" /> Plan broken</>}
          {t.mood && <span className="dash-trade-mood">· {t.mood}</span>}
        </span>
      </div>
      <div className="dash-trade-right">
        <span className={`mono dash-trade-pnl ${pnl >= 0 ? 'text-up' : 'text-down'}`}>{money(pnl)}</span>
        <span className="dash-trade-time">{relativeTime(t.entryTime || t.timestamp)}</span>
      </div>
    </li>
  );
}
