import { render, screen } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios');

beforeEach(() => {
  axios.get.mockResolvedValue({ data: [] });
  localStorage.clear();
});

test('shows the welcome landing when no user is signed in', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /trading discipline terminal/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /proceed to login/i })).toBeInTheDocument();
});
