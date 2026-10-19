import axios from 'axios';
import API_BASE from '../config';

// 1. FETCH RAW DATA FROM BACKEND
export const getUserMetrics = async (userId) => {
    try {
        const response = await axios.get(`${API_BASE}/api/trades/metrics/${userId}`);
        return response.data; // Returns { disciplineScore: 50, overtradingIndex: 1.5, ... }
    } catch (error) {
        console.error("Error fetching metrics:", error);
        return null;
    }
};

// 2. GENERATE RICH WARNINGS (Your Logic)
export const generateBehaviourWarnings = (metrics) => {
    if (!metrics) return [];
    
    const warnings = [];

    // Rule 1: Overtrading
    if (metrics.overtradingIndex > 1.2) {
        warnings.push({
            type: "Overtrading",
            severity: "High",
            message: "You are trading more frequently than your planned limit. Consider stepping back."
        });
    }

    // Rule 2: Discipline
    if (metrics.disciplineScore < 60) {
        warnings.push({
            type: "Discipline Breakdown",
            severity: "High", // Changed to High for dissertation impact
            message: "Recent trades show repeated plan deviations."
        });
    }

    // Rule 3: House Money Effect
    if (metrics.houseMoneyFactor > 1.3) {
        warnings.push({
            type: "Risk Escalation",
            severity: "Medium",
            message: "Risk-taking increased after recent gains."
        });
    }

    // Rule 4: Loss Reactivity
    // Check if it exists and handles the string "High"
    if (metrics.lossReactivity === "High" || (metrics.lossReactivity && metrics.lossReactivity.includes("High"))) {
        warnings.push({
            type: "Revenge Trading",
            severity: "High",
            message: "Rapid re-entry after loss detected. Emotional trading risk."
        });
    }

    return warnings;
};