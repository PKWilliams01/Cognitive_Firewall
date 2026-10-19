const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  // Absent for accounts created via Google sign-in
  password: { type: String },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  googleId: { type: String, index: true, sparse: true },
  avatarUrl: { type: String },
  tier:     { type: String, default: 'Beginner' },
  tradingPlanRules: { type: [String], default: [] },
  plannedDailyLimit: { type: Number, default: 3 }
});

module.exports = mongoose.model('User', UserSchema);
