// config.js reads process.env.REACT_APP_API_URL at module load, so each test
// resets modules and re-requires it with a fresh environment.
describe('API_BASE', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('defaults to the local dev server when REACT_APP_API_URL is unset', () => {
    delete process.env.REACT_APP_API_URL;
    const API_BASE = require('./config').default;
    expect(API_BASE).toBe('http://localhost:5000');
  });

  test('uses REACT_APP_API_URL when provided', () => {
    process.env.REACT_APP_API_URL = 'https://cognitive-firewall-api.onrender.com';
    const API_BASE = require('./config').default;
    expect(API_BASE).toBe('https://cognitive-firewall-api.onrender.com');
  });
});
