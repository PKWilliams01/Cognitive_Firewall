const express = require("express");
const router = express.Router();
const metricsController = require("../Controllers/metricsController");
const { protect } = require("../Middleware/authMiddleware");

// Was unauthenticated: anyone could read any user's metrics by id.
router.get("/:userId", protect, metricsController.getUserMetrics);

module.exports = router;
