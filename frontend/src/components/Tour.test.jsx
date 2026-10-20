import { render, screen, fireEvent } from '@testing-library/react';
import Tour, { TOUR_STEPS } from './Tour';

beforeAll(() => { Element.prototype.scrollIntoView = jest.fn(); });

test('walks forward and back, switching pages as it goes', async () => {
  const onNavigate = jest.fn();
  render(<Tour onNavigate={onNavigate} onClose={() => {}} />);
  expect(screen.getByText(/STEP 1 \//)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Start/ }));
  expect(await screen.findByText(TOUR_STEPS[1].title)).toBeInTheDocument();
  expect(onNavigate).toHaveBeenLastCalledWith('strategy');
  fireEvent.click(await screen.findByRole('button', { name: /Next/ }));
  expect(onNavigate).toHaveBeenLastCalledWith('settings');
  fireEvent.click(await screen.findByRole('button', { name: /Back/ }));
  expect(await screen.findByText(TOUR_STEPS[1].title)).toBeInTheDocument();
});

test('the step list jumps straight to any step', async () => {
  render(<Tour onNavigate={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'All steps' }));
  fireEvent.click(screen.getByRole('button', { name: /Review and reflect/ }));
  expect(await screen.findByText(/STEP 9 \//)).toBeInTheDocument();
});

test('finish, skip and Escape all close it', () => {
  const onClose = jest.fn();
  const { unmount } = render(<Tour onNavigate={() => {}} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: /Skip tour/ }));
  fireEvent.keyDown(window, { key: 'Escape' });
  unmount();
  render(<Tour onNavigate={() => {}} onClose={onClose} initialStep={TOUR_STEPS.length - 1} />);
  fireEvent.click(screen.getByRole('button', { name: /Finish/ }));
  expect(onClose).toHaveBeenCalledTimes(3);
});
