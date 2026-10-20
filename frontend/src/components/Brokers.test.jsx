import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { ToastProvider } from './Toast';
import BrokerConnections from './BrokerConnections';
import { ReflectiveJournal } from './ReflectiveJournal';

jest.mock('axios');

const wrap = (ui) => render(<ToastProvider>{ui}</ToastProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', token: 't' }));
});

const conn = (o = {}) => ({
  _id: 'c1', broker: 'alpaca', environment: 'practice', label: 'Alpaca PA123', keyHint: 'AKTE…1234',
  enforceLock: false, lockActive: false, status: 'connected', importedCount: 3, lastSyncAt: new Date().toISOString(), ...o,
});

describe('Connected brokers', () => {
  test('lists connections with demo badge and key hint only', async () => {
    axios.get.mockResolvedValue({ data: { configured: true, connections: [conn()] } });
    wrap(<BrokerConnections />);
    expect(await screen.findByText('Alpaca PA123')).toBeInTheDocument();
    expect(screen.getByText('DEMO')).toBeInTheDocument();
    expect(screen.getByText(/AKTE…1234/)).toBeInTheDocument();
  });

  test('warns when the server has brokers disabled', async () => {
    axios.get.mockResolvedValue({ data: { configured: false, connections: [] } });
    wrap(<BrokerConnections />);
    expect(await screen.findByText(/aren't enabled on this server/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect a broker/ })).toBeDisabled();
  });

  test('connect form sends only the selected broker credentials', async () => {
    axios.get.mockResolvedValue({ data: { configured: true, connections: [] } });
    axios.post.mockResolvedValueOnce({ data: conn({ broker: 'binance', label: 'Binance Futures' }) })
      .mockResolvedValue({ data: { added: 0, fetched: 0 } });
    wrap(<BrokerConnections />);
    fireEvent.click(await screen.findByRole('button', { name: /Connect a broker/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Binance Futures' }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'KEY' } });
    fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'SECRET' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify & connect/ }));
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/api\/brokers$/);
    expect(body).toEqual({ broker: 'binance', environment: 'practice', credentials: { apiKey: 'KEY', secret: 'SECRET' } });
  });

  test('toggling enforcement surfaces a lock refusal', async () => {
    axios.get.mockResolvedValue({ data: { configured: true, connections: [conn({ enforceLock: true })] } });
    axios.patch.mockRejectedValue({ response: { status: 423, data: { message: 'The firewall is locked.' } } });
    wrap(<BrokerConnections />);
    fireEvent.click(await screen.findByRole('switch', { name: /Enforce Hard Lock/ }));
    expect(await screen.findByText(/firewall is locked/)).toBeInTheDocument();
  });
});

describe('Journal — imported trade review', () => {
  const imported = {
    _id: 't1', instrument: 'SPY', direction: 'buy', pnl: -4, followedPlan: false, mood: 'Neutral', source: 'alpaca',
    needsReview: true, entryTime: new Date().toISOString(), exitTime: new Date().toISOString(),
  };

  test('shows a banner and saves the review', async () => {
    axios.patch.mockResolvedValue({ data: {} });
    const onTradeLogged = jest.fn();
    wrap(<ReflectiveJournal trades={[imported]} userId="u1" onTradeLogged={onTradeLogged} />);
    expect(screen.getByText(/waiting for review/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Review trade/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Followed plan/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Calm' }));
    fireEvent.click(screen.getByRole('button', { name: /Save review/ }));

    await waitFor(() => expect(onTradeLogged).toHaveBeenCalled());
    const [url, body] = axios.patch.mock.calls[0];
    expect(url).toMatch(/\/api\/trades\/t1$/);
    expect(body).toMatchObject({ followedPlan: true, mood: 'Calm' });
  });

  test('requires an adherence answer', async () => {
    wrap(<ReflectiveJournal trades={[imported]} userId="u1" onTradeLogged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Review trade/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save review/ }));
    expect(await screen.findByText(/follow your plan/)).toBeInTheDocument();
    expect(axios.patch).not.toHaveBeenCalled();
  });
});
