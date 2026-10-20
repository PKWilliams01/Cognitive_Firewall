import { render, screen, fireEvent } from '@testing-library/react';
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
