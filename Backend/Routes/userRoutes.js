const express = require('express');
const router = express.Router();
const User = require('../Models/User');
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

// Shape returned to the client after any successful sign-in
const authResponse = (user) => ({
  _id: user._id,
  username: user.username,
  email: user.email,
  avatarUrl: user.avatarUrl,
  tradingPlanRules: user.tradingPlanRules,
  plannedDailyLimit: user.plannedDailyLimit,
  token: generateToken(user._id)
});

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
    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      tradingPlanRules: updatedUser.tradingPlanRules,
      plannedDailyLimit: updatedUser.plannedDailyLimit,
      token: generateToken(updatedUser._id)
    });
  } catch (error) {
    res.status(400).json({ message: 'Update failed' });
  }
});

module.exports = router;