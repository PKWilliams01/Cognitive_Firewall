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

  // --- Prop-firm rule guard (locks before a daily/max-loss breach) ---
  propGuardEnabled: { type: Boolean, default: false },
  propFirm: { type: String, enum: ['ftmo', 'custom'], default: 'ftmo' },
  propAccountSize: { type: Number, default: 100000, min: 1 },
  propDailyLossPercent: { type: Number, default: 5, min: 0, max: 100 },
  propMaxLossPercent: { type: Number, default: 10, min: 0, max: 100 },
  propMaxLossType: { type: String, enum: ['static', 'trailing'], default: 'static' },
  // Lock this far short of the real limit: closed P/L can't see floating losses.
  propBufferPercent: { type: Number, default: 1, min: 0, max: 50 },
  propResetTimezone: { type: String, default: 'Europe/Prague' },
  // Only trades closed on/after this date count toward the challenge.
  propStartDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
