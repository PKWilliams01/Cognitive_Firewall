import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flame, Award, CalendarCheck } from 'lucide-react';
import { summariseDays, computeStreaks, nextMilestone, buildCalendar, MILESTONES } from '../utils/discipline';
import './DisciplineStreak.css';

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

const describe = (cell) => {
  const date = new Date(`${cell.key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (cell.future) return date;
  if (!cell.summary) return `${date}: no trades`;
  const s = cell.summary;
  return `${date}: ${s.trades} trade${s.trades === 1 ? '' : 's'}, ${s.discipline}% to plan`;
};

export default function DisciplineStreak({ trades = [], timeZone = 'UTC', now }) {
  const { streak, milestone, columns, cleanDays } = useMemo(() => {
    const days = summariseDays(trades, timeZone);
    const s = computeStreaks(days);
    const cols = buildCalendar(days, { weeks: 13, now: now || new Date(), timeZone });
    const clean = cols.flat().filter((c) => c.level === 'clean').length;
    return { streak: s, milestone: nextMilestone(s.current), columns: cols, cleanDays: clean };
  }, [trades, timeZone, now]);

  const monthLabels = columns.map((col, i) => {
    const first = col[0].key;
    const prev = i > 0 ? columns[i - 1][0].key : null;
    return !prev || first.slice(5, 7) !== prev.slice(5, 7)
      ? new Date(`${first}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
      : '';
  });

  return (
    <section className="card streak" aria-label="Discipline streak">
      <div className="streak-summary">
        <div className={`streak-flame ${streak.current > 0 ? 'is-lit' : ''}`}>
          <Flame size={26} />
        </div>
        <div className="streak-count">
          <span className="mono streak-number">{streak.current}</span>
          <span className="streak-label">day discipline streak</span>
        </div>

        <div className="streak-stats">
          <span><Award size={14} /> Best <strong className="mono">{streak.best}</strong></span>
          <span><CalendarCheck size={14} /> Clean days (13 wks) <strong className="mono">{cleanDays}</strong></span>
        </div>

        <div className="streak-next">
          {milestone.next ? (
            <>
              <div className="streak-next-label">
                <span>Next milestone</span>
                <span className="mono">{streak.current}/{milestone.next} days</span>
              </div>
              <div className="meter" style={{ color: 'var(--warning)' }}>
                <span style={{ width: `${Math.round(milestone.progress * 100)}%` }} />
              </div>
            </>
          ) : (
            <div className="streak-next-label"><span>Every milestone earned. Legendary discipline.</span></div>
          )}
          <ul className="streak-badges" aria-label="Milestones">
            {MILESTONES.map((m) => {
              const earned = milestone.earned.includes(m);
              return (
                <li key={m} className={earned ? 'is-earned' : ''} title={`${m}-day streak${earned ? ' — earned' : ''}`}>
                  <motion.span initial={false} animate={earned ? { scale: [1, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.5 }}>
                    {m}
                  </motion.span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="streak-cal-wrap">
        <div className="streak-cal" role="grid" aria-label="Daily discipline, last 13 weeks">
          <div className="streak-cal-days" aria-hidden="true">
            <span />
            {DAY_LABELS.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          {columns.map((col, w) => (
            <div key={col[0].key} className="streak-cal-col" role="row">
              <span className="streak-cal-month" aria-hidden="true">{monthLabels[w]}</span>
              {col.map((cell) => (
                <span
                  key={cell.key}
                  role="gridcell"
                  className={`streak-cell lvl-${cell.level} ${cell.future ? 'is-future' : ''} ${cell.today ? 'is-today' : ''}`}
                  title={describe(cell)}
                  aria-label={describe(cell)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="streak-legend" aria-hidden="true">
          <span><i className="streak-cell lvl-none" /> No trades</span>
          <span><i className="streak-cell lvl-broken" /> Plan broken</span>
          <span><i className="streak-cell lvl-mixed" /> Mixed</span>
          <span><i className="streak-cell lvl-clean" /> All to plan</span>
        </div>
      </div>
    </section>
  );
}
