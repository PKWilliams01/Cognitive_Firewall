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

// Restrict CORS to the known client origin(s). Set CLIENT_URL in the
// environment for production; defaults to the local dev frontend.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map(o => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json());

// Throttle auth endpoints to blunt brute-force / credential-stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,                  // 50 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
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

mongoose
  .connect(process.env.MONGO_URI, dbOptions)
  .then(() => console.log("✅ MongoDB connected (Hotspot Mode)"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

app.get("/", (req, res) => {
  res.send("Backend is running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});