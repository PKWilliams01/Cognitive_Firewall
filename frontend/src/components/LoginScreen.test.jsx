import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import LoginScreen from './LoginScreen';

jest.mock('axios');

beforeEach(() => {
  jest.clearAllMocks();
});

const fillCredentials = (email, password) => {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
};

test('defaults to sign-in and switches to create-account', async () => {
  render(<LoginScreen onLoginSuccess={() => {}} />);

  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /sign in/i })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByPlaceholderText(/choose a username/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: /create account/i }));

  expect(await screen.findByRole('heading', { name: /create your discipline profile/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/choose a username/i)).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /create account/i })).toHaveAttribute('aria-selected', 'true');
});

test('signing in posts to the login endpoint and reports the user', async () => {
  const userData = { _id: 'u1', email: 'a@b.com', token: 'jwt-token' };
  axios.post.mockResolvedValue({ data: userData });
  const onLoginSuccess = jest.fn();

  render(<LoginScreen onLoginSuccess={onLoginSuccess} />);
  fillCredentials('a@b.com', 'secret');
  fireEvent.click(screen.getByRole('button', { name: /^sign in/i }));

  await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(userData));
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/users/login'),
    expect.objectContaining({ email: 'a@b.com', password: 'secret' })
  );
});

test('creating an account posts to register and flags the user as new', async () => {
  const userData = { _id: 'u2', email: 'new@b.com', token: 'jwt' };
  axios.post.mockResolvedValue({ data: userData });
  const onLoginSuccess = jest.fn();

  render(<LoginScreen onLoginSuccess={onLoginSuccess} />);
  fireEvent.click(screen.getByRole('tab', { name: /create account/i }));
  fireEvent.change(await screen.findByPlaceholderText(/choose a username/i), { target: { value: 'newbie' } });
  fillCredentials('new@b.com', 'secret');
  // the tab has role "tab", so this matches only the submit button
  fireEvent.click(screen.getByRole('button', { name: /^create account/i }));

  await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith({ ...userData, isNewUser: true }));
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/users/register'),
    expect.objectContaining({ username: 'newbie', email: 'new@b.com' })
  );
});

test('shows an error message when authentication fails', async () => {
  axios.post.mockRejectedValue({ response: { data: { message: 'Invalid email or password' } } });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  render(<LoginScreen onLoginSuccess={() => {}} />);
  fillCredentials('a@b.com', 'wrong');
  fireEvent.click(screen.getByRole('button', { name: /^sign in/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
  console.error.mockRestore();
});

test('password visibility can be toggled', () => {
  render(<LoginScreen onLoginSuccess={() => {}} />);
  const pw = screen.getByPlaceholderText('••••••••');
  expect(pw).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: /show password/i }));
  expect(pw).toHaveAttribute('type', 'text');
});

test('Google button renders disabled when no client ID is configured', () => {
  render(<LoginScreen onLoginSuccess={() => {}} />);
  expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled();
});
