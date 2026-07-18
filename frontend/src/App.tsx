import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import Layout from "@/components/Layout";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { applyAccent, DEFAULT_ACCENT, DEFAULT_CUSTOM_COLOR } from "@/lib/themes";

// Code split route components for better performance
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Transactions = React.lazy(() => import("./pages/Transactions"));
const Analytics = React.lazy(() => import("./pages/Analytics"));
const Budgets = React.lazy(() => import("./pages/Budgets"));
const Goals = React.lazy(() => import("./pages/Goals"));
const MLInsights = React.lazy(() => import("./pages/MLInsights"));
const Settings = React.lazy(() => import("./pages/Settings"));

export const ThemeContext = React.createContext<any>({
  theme: "light",
  toggle: () => {},
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
  customColor: DEFAULT_CUSTOM_COLOR,
  setCustomColor: () => {},
});

function useTheme() {
  const [theme, setTheme] = useLocalStorage("batua-theme", "light");
  const [accent, setAccent] = useLocalStorage("batua-accent", DEFAULT_ACCENT);
  const [customColor, setCustomColor] = useLocalStorage(
    "batua-accent-custom",
    DEFAULT_CUSTOM_COLOR
  );

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  // Re-apply accent variables whenever the accent, custom color, or mode
  // changes so the colors stay tuned for light vs dark.
  React.useEffect(() => {
    applyAccent(accent, theme, customColor);
  }, [accent, theme, customColor]);

  const toggle = React.useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [setTheme]
  );
  return { theme, toggle, accent, setAccent, customColor, setCustomColor };
}

export default function App() {
  const themeValue = useTheme();

  return (
    <ThemeContext.Provider value={themeValue}>
      <ErrorBoundary>
        <BrowserRouter>
          <React.Suspense fallback={<div role="status" aria-live="polite" className="flex items-center justify-center min-h-screen"><span className="sr-only">Loading page</span>Loading...</div>}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/goals" element={<Goals />} />
                {/* Reports merged into Analytics — keep old links working */}
                <Route path="/reports" element={<Navigate to="/analytics" replace />} />
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
