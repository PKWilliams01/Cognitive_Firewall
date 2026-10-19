const express = require('express');
const router = express.Router();
const User = require('../Models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// A secret key for signing tokens (In a real app, this goes in a .env file)
const JWT_SECRET = process.env.JWT_SECRET || "cognitive_firewall_super_secret_key_2026";

// Helper function to generate the secure digital passport
const generateToken = (id) => {
    return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
};

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
    
    // Compare typed password against the database hash
    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        tradingPlanRules: user.tradingPlanRules,
        plannedDailyLimit: user.plannedDailyLimit,
        token: generateToken(user._id) // Hand them their real JWT
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});


// 3. UPDATE USER SETTINGS ROUTE
// Endpoint: PUT http://localhost:5000/api/users/:id
router.put('/:id', async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
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