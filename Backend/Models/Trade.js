const mongoose = require("mongoose");

const TradeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true // Optimises user-based queries
    },

    instrument: {
      type: String,
      required: true,
      trim: true
    },

    direction: {
      type: String,
      // Expanded to match both the Trade Wizard ('buy'/'sell') and the Journal ('Long'/'Short')
      enum: ["buy", "sell", "Long", "Short"],
      required: true
    },
    
    mood: {
      type: String,
      
      enum: ["Neutral", "Anxious", "Greedy", "Angry", "Euphoric", "Calm", "Calm & Collected", "Confident"],
      default: "Neutral"
    },
    
    riskPercentage: {
      type: Number,
      // Brokers don't report risk-as-%-of-account; only manual logs must have it.
      required: function () { return !this.source || this.source === 'manual'; },
      min: 0.01,
      max: 100
    },

    result: {
      type: String,
      enum: ["win", "loss", "breakeven"],
      required: true
    },

    pnl: {
      type: Number,
      required: true
    },

    followedPlan: {
      type: Boolean,
      required: true
    },

    // === BEHAVIOURAL METRICS FOUNDATION ===
    entryTime: {
      type: Date,
      required: true
    },

    exitTime: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return value >= this.entryTime;
        },
        message: "Exit time must be after entry time."
      }
    },

    notes: {
      type: String,
      maxLength: 500,
      default: ""
    },

    // Where the record came from: logged by hand, or imported from a broker.
    source: {
      type: String,
      enum: ["manual", "oanda", "alpaca", "binance", "mt-csv", "csv"],
      default: "manual"
    },

    // Broker-side trade id, used to de-duplicate imports.
    externalId: {
      type: String
    },

    // Imported trades arrive without psychology; the trader confirms plan
    // adherence and mood afterwards. Adherence is never pre-claimed.
    needsReview: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// One copy of each broker trade per user
TradeSchema.index(
  { userId: 1, source: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: "string" } } }
);

module.exports = mongoose.model("Trade", TradeSchema);