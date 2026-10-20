import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/theme.css";
import "./styles/ui.css";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Installable app: register the service worker in production builds only, so
// local development never serves a stale cached shell.
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/service-worker.js`).catch(() => {});
  });
}
