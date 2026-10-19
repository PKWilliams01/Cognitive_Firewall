// Central API base URL for the backend.
//
// Override per environment with REACT_APP_API_URL (Create React App inlines
// REACT_APP_* variables at build time). Falls back to the local dev server so
// nothing changes for local development.
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default API_BASE;
