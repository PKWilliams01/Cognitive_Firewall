import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/theme.css";
import App from "./App";

// ✅ Create root FIRST
const root = ReactDOM.createRoot(document.getElementById("root"));

// ✅ Render AFTER root exists
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
