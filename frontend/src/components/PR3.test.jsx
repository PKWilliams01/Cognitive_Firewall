import { render, screen, fireEvent } from '@testing-library/react';
import axios from 'axios';
import DisciplineStreak from './DisciplineStreak';
import App from '../App';

jest.mock('axios');
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  return { ...actual, ResponsiveContainer: ({ children }) => React.cloneElement(children, { width: 600, height: 280 }) };
});

const day = (iso, followedPlan) => ({ entryTime: iso, followedPlan, pnl: 10 });

describe('DisciplineStreak', () => {
  const now = new Date('2026-06-10T12:00:00Z');

  test('shows the current and best streak and earned milestones', () => {
    const trades = ['01', '02', '03', '04', '05', '08', '09'].map((d) => day(`2026-06-${d}T09:00:00Z`, true));
    render(<DisciplineStreak trades={trades} timeZone="UTC" now={now} />);
    const region = screen.getByRole('region', { name: /discipline streak/i });
    expect(region).toHaveTextContent('7');
    expect(screen.getByTitle(/3-day streak — earned/i)).toBeInTheDocument();
    expect(screen.getByTitle(/7-day streak — earned/i)).toBeInTheDocument();
    expect(screen.getByTitle(/^14-day streak$/i)).toBeInTheDocument();
    expect(screen.getByText('7/14 days')).toBeInTheDocument();
  });

  test('the heatmap labels each day with its trades and adherence', () => {
    render(<DisciplineStreak trades={[day('2026-06-09T09:00:00Z', true), day('2026-06-09T10:00:00Z', false)]} timeZone="UTC" now={now} />);
    expect(screen.getByRole('grid', { name: /last 13 weeks/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tue 9 jun: 2 trades, 50% to plan/i)).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(13 * 7);
  });
});

describe('keyboard shortcuts and launch links', () => {
  const metrics = { hasTrades: false, revengeRisk: 0, isLocked: false, tradesRemaining: 3, dailyLimit: 3 };

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '/');
    localStorage.setItem('user', JSON.stringify({ _id: 'u1', username: 'Gee', token: 't', timezone: 'Europe/London', tradingPlanRules: [] }));
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/metrics/') ? metrics : [] }));
  });

  const ready = () => screen.findByRole('heading', { level: 1, name: 'Dashboard' });

  test('N opens the pre-flight', async () => {
    render(<App />);
    await ready();
    fireEvent.keyDown(window, { key: 'n' });
    expect(await screen.findByRole('heading', { name: /pre-flight check/i })).toBeInTheDocument();
  });

  test('G then J goes to the Journal, G then , to Settings', async () => {
    render(<App />);
    await ready();
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Journal' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: ',' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  test('? lists the shortcuts', async () => {
    render(<App />);
    await ready();
    fireEvent.keyDown(window, { key: '?' });
    expect(await screen.findByRole('dialog', { name: /keyboard shortcuts/i })).toHaveTextContent(/start a pre-flight/i);
  });

  test('Shift+/ (how some layouts report ?) also opens the list', async () => {
    render(<App />);
    await ready();
    fireEvent.keyDown(window, { key: '/', shiftKey: true });
    expect(await screen.findByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  test('shortcuts are ignored while typing', async () => {
    render(<App />);
    await ready();
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'j' });
    await screen.findByRole('heading', { level: 1, name: 'Journal' });
    const search = await screen.findByLabelText(/search trades/i);
    search.focus();
    fireEvent.keyDown(search, { key: 'n' });
    expect(screen.queryByRole('heading', { name: /pre-flight check/i })).not.toBeInTheDocument();
  });

  test('N while locked opens the cool-off screen instead', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/metrics/') ? { ...metrics, isLocked: true, lockReason: 'revenge', revengeRisk: 90 } : [] }));
    render(<App />);
    await ready();
    await screen.findByText(/firewall locked/i);
    fireEvent.keyDown(window, { key: 'n' });
    expect(await screen.findByRole('dialog', { name: /step away/i })).toBeInTheDocument();
  });

  test('the installed-app "Mood check-in" shortcut opens the check-ins tab', async () => {
    window.history.replaceState(null, '', '/?view=journal&tab=checkins');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Journal' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: /mood check-ins/i })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toBe('');
  });
});

describe('PWA', () => {
  const manifest = require('../../public/manifest.json');

  test('manifest is branded, standalone, and has install + maskable icons', () => {
    expect(manifest.name).toMatch(/cognitive firewall/i);
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#06080c');
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  test('the service worker never caches cross-origin (API) requests', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../public/service-worker.js'), 'utf8');
    expect(src).toMatch(/url\.origin !== self\.location\.origin\) return/);
  });
});
