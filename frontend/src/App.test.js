import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios');

// recharts measures 0x0 in jsdom; render charts into a fixed box.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  return { ...actual, ResponsiveContainer: ({ children }) => React.cloneElement(children, { width: 600, height: 280 }) };
});

beforeEach(() => {
  axios.get.mockResolvedValue({ data: [] });
  localStorage.clear();
});

test('shows the landing page when no user is signed in', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: /trade your plan/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
});

test('"Get started" opens account creation, and Back returns to the landing', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /get started/i }));
  expect(screen.getByRole('heading', { name: /create your discipline profile/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /back/i }));
  expect(screen.getByRole('heading', { level: 1, name: /trade your plan/i })).toBeInTheDocument();
});

test('the nav "Sign in" opens the sign-in tab', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
});

describe('signed in', () => {
  const signIn = () =>
    localStorage.setItem('user', JSON.stringify({ _id: 'u1', username: 'Gee Trader', email: 'gee@example.com', token: 't' }));

  test('shows the app shell with dashboard, and the sidebar navigates between pages', async () => {
    signIn();
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByText('Gee Trader').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /journal/i })[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Journal' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /strategy/i })[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Strategy' })).toBeInTheDocument();
  });

  test('logging out returns to the landing page and clears the session', async () => {
    signIn();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    fireEvent.click(screen.getAllByRole('button', { name: /log out/i })[0]);
    expect(screen.getByRole('heading', { level: 1, name: /trade your plan/i })).toBeInTheDocument();
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('the operator\'s manual opens and closes with Escape', async () => {
    signIn();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    fireEvent.click(screen.getAllByRole('button', { name: /operator's manual/i })[0]);
    expect(screen.getByRole('dialog', { name: /operator's manual/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('settings and session handling', () => {
  const signIn = (extra = {}) =>
    localStorage.setItem('user', JSON.stringify({ _id: 'u1', username: 'Gee', email: 'g@x.com', token: 't', timezone: 'Europe/London', ...extra }));

  test('Settings is reachable from the navigation', async () => {
    signIn();
    axios.get.mockImplementation((url) =>
      Promise.resolve({ data: url.endsWith('/api/users/me') ? { _id: 'u1', username: 'Gee', email: 'g@x.com', startingBalance: 1000, currency: 'USD', plannedDailyLimit: 3, maxRiskPercent: 5, lockThreshold: 80, cooldownMinutes: 0, strictConfluence: true, timezone: 'Europe/London', whyITrade: '', hasPassword: true } : [] })
    );
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    fireEvent.click(screen.getAllByRole('button', { name: /settings/i })[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /firewall & risk/i })).toBeInTheDocument();
  });

  test('an expired session signs the user out with an explanation', async () => {
    signIn();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    act(() => { window.dispatchEvent(new CustomEvent('auth:expired')); });

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('execute while locked', () => {
  test('opens the cool-off screen instead of the trade wizard', async () => {
    localStorage.setItem('user', JSON.stringify({ _id: 'u1', username: 'Gee', token: 't', timezone: 'Europe/London', whyITrade: 'Discipline pays.' }));
    axios.get.mockImplementation((url) =>
      Promise.resolve({ data: url.includes('/metrics/') ? { hasTrades: true, revengeRisk: 90, isLocked: true, lockReason: 'revenge', lockThreshold: 80 } : [] })
    );
    render(<App />);
    await screen.findByText(/firewall locked/i);

    fireEvent.click(screen.getAllByRole('button', { name: /execution locked|locked/i })[0]);

    expect(await screen.findByRole('dialog', { name: /step away/i })).toBeInTheDocument();
    expect(screen.getByText(/discipline pays/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /pre-flight check/i })).not.toBeInTheDocument();
  });
});
