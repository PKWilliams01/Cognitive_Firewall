import { render, screen, act, fireEvent } from '@testing-library/react';
import Welcome from './Welcome';

afterEach(() => {
  jest.useRealTimers();
});

test('demo gauge climbs through the tilt spiral and engages the Hard Lock', () => {
  jest.useFakeTimers();
  render(<Welcome onContinue={() => {}} />);

  expect(screen.getByText(/execution permitted/i)).toBeInTheDocument();

  // sequence is 14 -> 37 -> 62 -> 88, advancing every 2.2s
  act(() => { jest.advanceTimersByTime(2200 * 2); });
  expect(screen.queryByText(/hard lock engaged/i)).not.toBeInTheDocument();

  act(() => { jest.advanceTimersByTime(2200); });
  expect(screen.getByText(/hard lock engaged/i)).toBeInTheDocument();

  // and it loops back to a safe state
  act(() => { jest.advanceTimersByTime(2200); });
  expect(screen.getByText(/execution permitted/i)).toBeInTheDocument();
});

test('"Sign in" opens sign-in; the sign-up CTAs open account creation', () => {
  const onContinue = jest.fn();
  render(<Welcome onContinue={onContinue} />);

  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
  fireEvent.click(screen.getByRole('button', { name: /get started/i }));
  fireEvent.click(screen.getByRole('button', { name: /create your profile/i }));

  expect(onContinue).toHaveBeenNthCalledWith(1, 'login');
  expect(onContinue).toHaveBeenNthCalledWith(2, 'register');
  expect(onContinue).toHaveBeenNthCalledWith(3, 'register');
});
