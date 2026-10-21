import React from 'react';
import { ShieldHalf } from 'lucide-react';
import './PropGuardPanel.css';

const amount = (n) => `$${Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// One allowance bar: the real limit is the full track, the guard's lock
// point sits a buffer short of it.
function Allowance({ label, used, limit, buffer, room, hint }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const lockAt = limit ? Math.max(0, ((limit - buffer) / limit) * 100) : 100;
  const tone = used >= limit - buffer ? 'down' : pct >= lockAt * 0.5 ? 'warn' : 'up';
  return (
    <div className="pg-allow">
      <div className="pg-allow-head">
        <span>{label}</span>
        <span className="mono">{amount(used)} <span className="pg-dim">/ {amount(limit)}</span></span>
      </div>
      <div className="pg-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
        <span className={`pg-fill is-${tone}`} style={{ width: `${pct}%` }} />
        <span className="pg-lockmark" style={{ left: `${lockAt}%` }} title="Guard locks here" />
      </div>
      <div className="pg-allow-foot">
        <span className={tone === 'down' ? 'text-down' : 'pg-dim'}>{room > 0 ? `${amount(room)} room before the lock` : 'Locked'}</span>
        <span className="pg-dim">{hint}</span>
      </div>
    </div>
  );
}

export default function PropGuardPanel({ guard }) {
  return (
    <section className="card pg" aria-label="Prop-firm guard">
      <header className="pg-head">
        <span className="pg-icon"><ShieldHalf size={16} /></span>
        <div>
          <strong>{guard.firmLabel} guard</strong>
          <span className="pg-dim mono"> · {amount(guard.accountSize)} account · balance {amount(guard.balance)}</span>
        </div>
      </header>
      <div className="pg-grid">
        <Allowance
          label="Daily loss"
          used={guard.dailyUsed}
          limit={guard.dailyLimit}
          buffer={guard.buffer}
          room={guard.dailyRoom}
          hint={`resets midnight ${guard.resetTimezone.split('/').pop().replace('_', ' ')}`}
        />
        <Allowance
          label={`Max loss (${guard.maxLossType})`}
          used={guard.maxUsed}
          limit={guard.maxLimit}
          buffer={guard.buffer}
          room={guard.maxRoom}
          hint={`floor ${amount(guard.floor)}`}
        />
      </div>
      <p className="pg-note">Based on closed trades. Open positions' floating losses aren't visible here, which is what the {amount(guard.buffer)} buffer is for.</p>
    </section>
  );
}
