const express = require('express');
const router = express.Router();
const User = require('../Models/User');
const Trade = require('../Models/Trade');
const JournalEntry = require('../Models/JournalEntry');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { protect } = require('../Middleware/authMiddleware');
const { OAuth2Client } = require('google-auth-library');

// A secret key for signing tokens (In a real app, this goes in a .env file)
const JWT_SECRET = process.env.JWT_SECRET || "cognitive_firewall_super_secret_key_2026";

// Helper function to generate the secure digital passport
const generateToken = (id) => {
    return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
};

const googleClient = new OAuth2Client();

// Fields a user can see and edit about themselves (never password/googleId)
const SETTINGS_FIELDS = [
  'startingBalance', 'currency', 'maxRiskPercent', 'lockThreshold',
  'cooldownMinutes', 'strictConfluence', 'timezone', 'whyITrade',
];

const publicProfile = (user) => ({
  _id: user._id,
  username: user.username,
  email: user.email,
  avatarUrl: user.avatarUrl,
  authProvider: user.authProvider,
  hasPassword: Boolean(user.password),
  tradingPlanRules: user.tradingPlanRules,
  plannedDailyLimit: user.plannedDailyLimit,
  ...Object.fromEntries(SETTINGS_FIELDS.map((f) => [f, user[f]])),
  createdAt: user.createdAt,
});

// Shape returned to the client after any successful sign-in
const authResponse = (user) => ({
  ...publicProfile(user),
  token: generateToken(user._id)
});

const isValidTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Validates and whitelists a settings update. Returns { update } or { error }.
function buildSettingsUpdate(body = {}) {
  const update = {};
  const num = (v) => (v === '' || v === null ? NaN : Number(v));
  const range = (field, min, max, { integer = false } = {}) => {
    if (body[field] === undefined) return null;
    const n = num(body[field]);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      return `${field} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}`;
    }
    update[field] = n;
    return null;
  };

  const errors = [
    range('startingBalance', 1, 1e12),
    range('plannedDailyLimit', 1, 50, { integer: true }),
    range('maxRiskPercent', 0.1, 100),
    range('lockThreshold', 50, 100, { integer: true }),
    range('cooldownMinutes', 0, 1440, { integer: true }),
  ].filter(Boolean);

  if (body.username !== undefined) {
    const name = String(body.username).trim();
    if (!name || name.length > 60) errors.push('username must be 1–60 characters');
    else update.username = name;
  }
  if (body.currency !== undefined) {
    if (!['USD', 'GBP', 'EUR', 'JPY', 'AUD', 'CAD', 'CHF'].includes(body.currency)) errors.push('unsupported currency');
    else update.currency = body.currency;
  }
  if (body.strictConfluence !== undefined) update.strictConfluence = Boolean(body.strictConfluence);
  if (body.timezone !== undefined) {
    if (!isValidTimeZone(body.timezone)) errors.push('invalid timezone');
    else update.timezone = body.timezone;
  }
  if (body.whyITrade !== undefined) {
    const note = String(body.whyITrade);
    if (note.length > 400) errors.push('whyITrade must be 400 characters or fewer');
    else update.whyITrade = note;
  }
  if (body.tradingPlanRules !== undefined) {
    const rules = body.tradingPlanRules;
    if (!Array.isArray(rules) || rules.length > 30 || rules.some((r) => typeof r !== 'string' || !r.trim() || r.length > 160)) {
      errors.push('tradingPlanRules must be up to 30 non-empty rules of 160 characters or fewer');
    } else {
      update.tradingPlanRules = rules.map((r) => r.trim());
    }
  }

  return errors.length ? { error: errors.join('; ') } : { update };
}

// 1. SECURE REGISTER ROUTE
// Endpoint: POST http://localhost:5000/api/users/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    //Hash the password cryptographically
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user with the HASHED password
    const user = await User.create({
      username,
      email,
      password: hashedPassword, // No more plain text!
      tradingPlanRules: [], 
      plannedDailyLimit: 3  
    });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      token: generateToken(user._id) // Hand them their real JWT
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// 2. SECURE LOGIN ROUTE
// Endpoint: POST http://localhost:5000/api/users/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });

    // Accounts created with Google have no password to check
    if (user && !user.password) {
      return res.status(401).json({ message: 'This account uses Google sign-in. Continue with Google instead.' });
    }

    // Compare typed password against the database hash
    if (user && (await bcrypt.compare(password, user.password))) {
      res.json(authResponse(user));
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// 2b. GOOGLE SIGN-IN ROUTE
// Endpoint: POST http://localhost:5000/api/users/google
// Body: { credential } — the ID token from Google Identity Services.
// The token is verified server-side; the client is never trusted for identity.
router.post('/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ message: 'Google sign-in is not configured' });
  }

  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ message: 'Missing Google credential' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    payload = ticket.getPayload();
  } catch (error) {
    return res.status(401).json({ message: 'Google sign-in could not be verified' });
  }

  if (!payload || !payload.email || !payload.email_verified) {
    return res.status(401).json({ message: 'Your Google email address is not verified' });
  }

  try {
    let user = await User.findOne({ googleId: payload.sub });

    if (!user) {
      user = await User.findOne({ email: payload.email.toLowerCase() }) || await User.findOne({ email: payload.email });
      if (user) {
        // Link Google to an existing email/password account
        user.googleId = payload.sub;
        if (!user.avatarUrl && payload.picture) user.avatarUrl = payload.picture;
        await user.save();
      } else {
        user = await User.create({
          username: payload.name || payload.email.split('@')[0],
          email: payload.email.toLowerCase(),
          authProvider: 'google',
          googleId: payload.sub,
          avatarUrl: payload.picture,
          tradingPlanRules: [],
          plannedDailyLimit: 3
        });
        return res.status(201).json({ ...authResponse(user), isNewUser: true });
      }
    }

    res.json(authResponse(user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during Google sign-in' });
  }
});


// 2c. CURRENT USER — profile & settings
router.get('/me', protect, async (req, res) => {
  // req.user is loaded without the password hash, so re-read the record to
  // report hasPassword accurately.
  const user = await User.findById(req.user._id);
  res.json(publicProfile(user));
});

router.patch('/me', protect, async (req, res) => {
  const { update, error } = buildSettingsUpdate(req.body);
  if (error) return res.status(422).json({ message: error });
  try {
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true });
    res.json(publicProfile(user));
  } catch (err) {
    res.status(400).json({ message: 'Could not save settings' });
  }
});

// Change password — or set one for the first time on a Google-only account.
router.post('/me/password', protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(422).json({ message: 'New password must be at least 8 characters' });
  }
  try {
    const user = await User.findById(req.user._id);
    if (user.password) {
      const ok = typeof currentPassword === 'string' && (await bcrypt.compare(currentPassword, user.password));
      if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });
    }
    user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    await user.save();
    res.json({ message: user.authProvider === 'google' ? 'Password set' : 'Password changed' });
  } catch (err) {
    res.status(500).json({ message: 'Could not update password' });
  }
});

// Data export (right of access): everything stored about the user.
router.get('/me/export', protect, async (req, res) => {
  try {
    const [trades, journal] = await Promise.all([
      Trade.find({ userId: req.user._id }).sort({ entryTime: 1 }).lean(),
      JournalEntry.find({ userId: req.user._id }).sort({ timestamp: 1 }).lean(),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="cognitive-firewall-export-${stamp}.json"`);
    res.json({ exportedAt: new Date().toISOString(), profile: publicProfile(req.user), trades, journal });
  } catch (err) {
    res.status(500).json({ message: 'Export failed' });
  }
});

// Delete account and all associated data. Requires typing DELETE, plus the
// password for accounts that have one.
router.delete('/me', protect, async (req, res) => {
  const { confirm, password } = req.body || {};
  if (confirm !== 'DELETE') {
    return res.status(422).json({ message: 'Type DELETE to confirm' });
  }
  try {
    const user = await User.findById(req.user._id);
    if (user.password) {
      const ok = typeof password === 'string' && (await bcrypt.compare(password, user.password));
      if (!ok) return res.status(401).json({ message: 'Password is incorrect' });
    }
    await Promise.all([
      Trade.deleteMany({ userId: user._id }),
      JournalEntry.deleteMany({ userId: user._id }),
    ]);
    await User.deleteOne({ _id: user._id });
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete account' });
  }
});

// 3. UPDATE USER SETTINGS ROUTE
// Endpoint: PUT http://localhost:5000/api/users/:id
router.put('/:id', protect, async (req, res) => {
  try {
    // Ownership: a user may only update their own record
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Not authorized to update this user' });
    }

    // Whitelist updatable fields — never let the client mass-assign
    // password, email, _id, or any other field via the request body.
    const allowed = {};
    if (req.body.plannedDailyLimit !== undefined) allowed.plannedDailyLimit = req.body.plannedDailyLimit;
    if (req.body.tradingPlanRules !== undefined) allowed.tradingPlanRules = req.body.tradingPlanRules;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      allowed,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return a fresh token so the client's stored session isn't wiped
    // when it persists this response (it overwrites the saved user object).
    res.json(authResponse(updatedUser));
  } catch (error) {
    res.status(400).json({ message: 'Update failed' });
  }
});

module.exports = router;