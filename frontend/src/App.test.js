import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios');

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
