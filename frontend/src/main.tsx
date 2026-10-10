import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Fail fast: this is a local-first app, so a failed
      // request almost always means "backend not running" —
      // retrying 5× with up to 10s backoff (~31s) only
      // delays the error the user needs to see.
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

if ((import.meta as any).env.DEV) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((ok) => {
          if (ok) console.log("[Service Worker] Unregistered dev SW:", registration.scope);
        });
      }
    });
  }
} else if ((import.meta as any).env.VITE_MOBILE_BUILD) {
  // Skip service worker on mobile (Capacitor WebView) — it causes stale-asset bugs
  console.log("[Service Worker] Skipped for mobile build");
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[Service Worker] Registered successfully", reg.scope))
      .catch((err) => console.error("[Service Worker] Registration failed", err));
  });
}
