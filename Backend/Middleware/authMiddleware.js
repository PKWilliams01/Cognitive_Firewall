const jwt = require('jsonwebtoken');
const User = require('../Models/User');

const JWT_SECRET = process.env.JWT_SECRET || "cognitive_firewall_super_secret_key_2026";

const protect = async (req, res, next) => {
    let token;

    // 1. Check if the request has an authorization header with a "Bearer" token
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // 2. Extract the token from the header (Format: "Bearer <token_string>")
            token = req.headers.authorization.split(' ')[1];

            // 3. Mathematically verify the token signature
            const decoded = jwt.verify(token, JWT_SECRET);

            // 4. Find the user in the database and attach them to the request (minus the password)
            req.user = await User.findById(decoded.id).select('-password');

            // 5. The token is valid! Let them pass through to the controller
            next();
        } catch (error) {
            console.error("Token Verification Failed:", error.message);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token provided' });
    }
};

module.exports = { protect };