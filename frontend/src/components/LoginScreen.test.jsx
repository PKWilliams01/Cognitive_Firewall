import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import LoginScreen from './LoginScreen';

jest.mock('axios');

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders the login form by default and toggles to register', () => {
  render(<LoginScreen onLoginSuccess={() => {}} />);

  expect(screen.getByRole('heading', { name: /sign in to your terminal/i })).toBeInTheDocument();
  // Username field only appears in register mode
  expect(screen.queryByPlaceholderText(/choose a username/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /need an account\? register/i }));

  expect(screen.getByRole('heading', { name: /create your discipline profile/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/choose a username/i)).toBeInTheDocument();
});

test('submitting credentials posts to the login endpoint and reports success', async () => {
  const userData = { _id: 'u1', email: 'a@b.com', token: 'jwt-token' };
  axios.post.mockResolvedValue({ data: userData });
  const onLoginSuccess = jest.fn();

  render(<LoginScreen onLoginSuccess={onLoginSuccess} />);
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: /^login/i }));

  await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(userData));
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/users/login'),
    expect.objectContaining({ email: 'a@b.com', password: 'secret' })
  );
});

test('shows an error message when authentication fails', async () => {
  axios.post.mockRejectedValue({ response: { data: { message: 'Invalid email or password' } } });

  render(<LoginScreen onLoginSuccess={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: /^login/i }));

  expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
});
