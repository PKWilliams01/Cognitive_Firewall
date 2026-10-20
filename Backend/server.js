const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
require("dotenv").config();

// Route imports
const metricsRoutes = require("./Routes/metricsRoutes"); 
const tradeRoutes = require("./Routes/tradeRoutes");
const journalRoutes = require("./Routes/journalRoutes");
const userRoutes = require("./Routes/userRoutes");
const marketRoutes = require("./Routes/marketRoutes");

const app = express();

// --- SECURITY & CORE MIDDLEWARE ---
app.use(helmet()); // Secure HTTP response headers

// Restrict CORS to known client origins:
//  - explicit list from CLIENT_URL (comma-separated) for local dev and any
//    custom/production domains
//  - plus a pattern matching this project's Vercel deployments, whose
//    subdomain changes per deploy and per branch (production + previews),
//    so we don't have to chase a new URL on every deployment.
const explicitOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

const vercelDeployPattern = /^https:\/\/cognitive-firewall[a-z0-9-]*\.vercel\.app$/;

app.use(cors({
  origin: [...explicitOrigins, vercelDeployPattern],
  credentials: true
}));

app.use(express.json());

// Throttle auth endpoints to blunt brute-force / credential-stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,                  // 50 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  // The test suite registers many users; production is always limited.
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: "Too many attempts, please try again later." }
});

// API ROUTES (Only mount each once!)
app.use("/api/users", authLimiter, userRoutes);
app.use("/api/trades", tradeRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/market", marketRoutes);

const dbOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
};

app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Only connect to the DB and start listening when run directly
// (e.g. `node server.js`). When imported by the test suite, the app is
// exported without a listener so the tests control their own connection.
if (require.main === module) {
  mongoose
    .connect(process.env.MONGO_URI, dbOptions)
    .then(() => console.log("✅ MongoDB connected (Hotspot Mode)"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

module.exports = app;