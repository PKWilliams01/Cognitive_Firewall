const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, maxlength: 60 },
  email:    { type: String, required: true, unique: true },
  // Absent for accounts created via Google sign-in
  password: { type: String },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  googleId: { type: String, index: true, sparse: true },
  avatarUrl: { type: String },
  tier:     { type: String, default: 'Beginner' },

  // --- Strategy (Rule Builder) ---
  tradingPlanRules: { type: [String], default: [] },
  plannedDailyLimit: { type: Number, default: 3, min: 1, max: 50 },

  // --- Risk profile / firewall settings ---
  // Account size the equity curve is normalised against (VULN-02).
  startingBalance: { type: Number, default: 1000, min: 1 },
  currency: { type: String, default: 'USD', enum: ['USD', 'GBP', 'EUR', 'JPY', 'AUD', 'CAD', 'CHF'] },
  // Server-enforced cap on risk per trade (VULN-01).
  maxRiskPercent: { type: Number, default: 5, min: 0.1, max: 100 },
  // Revenge-risk score at which the Hard Lock engages.
  lockThreshold: { type: Number, default: 80, min: 50, max: 100 },
  // Cool-off after a revenge lock. 0 = locked for the rest of the trading day.
  cooldownMinutes: { type: Number, default: 0, min: 0, max: 1440 },
  // When true, a pre-flight with unchecked confluences is refused (VULN-04).
  strictConfluence: { type: Boolean, default: true },
  // IANA timezone that defines the user's trading day.
  timezone: { type: String, default: 'UTC' },
  // Personal reminder shown on the cool-off screen.
  whyITrade: { type: String, default: '', maxlength: 400 },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
