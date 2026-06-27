import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import Layout from "@/components/Layout";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Code split route components for better performance
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Transactions = React.lazy(() => import("./pages/Transactions"));
const Analytics = React.lazy(() => import("./pages/Analytics"));
const Budgets = React.lazy(() => import("./pages/Budgets"));
const Reports = React.lazy(() => import("./pages/Reports"));
const MLInsights = React.lazy(() => import("./pages/MLInsights"));
const Settings = React.lazy(() => import("./pages/Settings"));

export const ThemeContext = React.createContext({ theme: "light", toggle: () => {} });

function useTheme() {
  const [theme, setTheme] = useLocalStorage("batua-theme", "light");

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  const toggle = React.useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [setTheme]
  );
  return { theme, toggle };
}

export default function App() {
  const themeValue = useTheme();

  return (
    <ThemeContext.Provider value={themeValue}>
      <ErrorBoundary>
        <BrowserRouter>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/ml-insights" element={<MLInsights />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </React.Suspense>
        </BrowserRouter>
      </ErrorBoundary>
      <Toaster
        position="top-right"
        richColors
        theme={themeValue.theme}
        toastOptions={{ className: "font-sans" }}
      />
    </ThemeContext.Provider>
  );
}
