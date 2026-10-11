import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import Layout from "@/components/Layout";
import SplashScreen from "@/components/SplashScreen";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useDataLoaded } from "@/hooks/useDataLoaded";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/components/Auth";
import LoginPage from "@/components/LoginPage";
import {
  applyAccent,
  revealTheme,
  DEFAULT_ACCENT,
  DEFAULT_CUSTOM_COLOR,
  type ThemeMode,
} from "@/lib/themes";
import type { SetLocalStorageValue } from "@/hooks/useLocalStorage";

// Code split route components for better performance
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Transactions = React.lazy(() => import("./pages/Transactions"));
const Analytics = React.lazy(() => import("./pages/Analytics"));
const Budgets = React.lazy(() => import("./pages/Budgets"));
const Goals = React.lazy(() => import("./pages/Goals"));
const People = React.lazy(() => import("./pages/People"));
const MLInsights = React.lazy(() => import("./pages/MLInsights"));
const Settings = React.lazy(() => import("./pages/Settings"));
const ApiDocs = React.lazy(() => import("./pages/ApiDocs"));

export interface ThemeContextValue {
  theme: ThemeMode;
  toggle: () => void;
  /**
   * Toggle with a circular reveal that grows from the given viewport
   * point (the toggle button). Falls back to `toggle()`'s instant change
   * when the View Transitions API is missing or reduced motion is on.
   */
  toggleAt: (origin: { x: number; y: number }) => void;
  /** Accent id from `ACCENTS`, or `CUSTOM_ACCENT`. */
  accent: string;
  setAccent: (value: string | ((prev: string) => string)) => void;
  /** Hex color used when `accent === CUSTOM_ACCENT`. */
  customColor: string;
  setCustomColor: (value: string | ((prev: string) => string)) => void;
}

export const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {},
  toggleAt: () => {},
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
  customColor: DEFAULT_CUSTOM_COLOR,
  setCustomColor: () => {},
});

export function useTheme(): ThemeContextValue {
  const [theme, setTheme] = useLocalStorage<ThemeMode>("batua-theme", "light");
  const [accent, setAccent] = useLocalStorage<string>(
    "batua-accent",
    DEFAULT_ACCENT
  );
  const [customColor, setCustomColor] = useLocalStorage<string>(
    "batua-accent-custom",
    DEFAULT_CUSTOM_COLOR
  );

  // Reconciles the `dark` class with the stored theme. useLayoutEffect
  // (not useEffect) so the class is in place before the browser's next
  // paint — and, critically, before a View Transition captures its new
  // frame. A passive effect can land after that capture, which makes the
  // old and new frames identical and the browser skips the reveal.
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    // No flat color cross-fade here: the theme change is animated by the
    // circular reveal in `toggleAt` (View Transitions). A plain transition
    // on <html> would fight that reveal and double-animate every surface.
  }, [theme]);

  // Re-apply accent variables whenever the accent, custom color, or mode
  // changes so the colors stay tuned for light vs dark.
  React.useEffect(() => {
    applyAccent(accent, theme, customColor);
  }, [accent, theme, customColor]);

  const toggle = React.useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
    // Flip the class synchronously too — not just for this
    // render. `startViewTransition` snapshots the DOM right
    // after its update callback returns, which can be before
    // even useLayoutEffect has flushed; flipping here guarantees
    // the captured frame is the new theme.
    const root = document.documentElement;
    const next = theme === "dark" ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
  }, [setTheme, theme]);
  const toggleAt = React.useCallback(
    (origin: { x: number; y: number }) => revealTheme(toggle, origin),
    [toggle]
  );
  return { theme, toggle, toggleAt, accent, setAccent, customColor, setCustomColor };
}

/**
 * Routes behind the auth gate. Kept as a separate component so the
 * gate can swap the whole tree (LoginPage vs the app) without
 * unmounting theme state.
 */
function AppRoutes({ splashVisible }: { splashVisible: boolean }) {
  return (
    <ErrorBoundary>
      <React.Suspense
        fallback={
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center min-h-screen"
          >
            <span className="sr-only">Loading page</span>Loading...
          </div>
        }
      >
        <Routes>
          <Route element={<Layout splashVisible={splashVisible} />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/people" element={<People />} />
            {/* Reports merged into Analytics — keep old links working */}
            <Route path="/reports" element={<Navigate to="/analytics" replace />} />
            <Route path="/ml-insights" element={<MLInsights />} />
            <Route path="/settings" element={<Settings />} />
            {/* In-app API reference — themed, replaces the stock Swagger UI */}
            <Route path="/api-docs" element={<ApiDocs />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </React.Suspense>
    </ErrorBoundary>
  );
}

/**
 * Auth gate: while the boot probe is resolving the splash keeps the
 * screen covered (no flash of unauthenticated content); afterwards a
 * live session renders the app and anything else renders Login.
 */
function Gate({
  splashVisible,
  setSplashVisible,
}: {
  splashVisible: boolean;
  setSplashVisible: (v: boolean) => void;
}) {
  const { loading, user } = useAuth();
  // The logo stays on screen until the app's first data
  // (transactions / dashboard) has loaded, so the splash
  // covers the initial fetch instead of an empty page.
  const dataLoaded = useDataLoaded();

  if (loading) {
    return <SplashScreen onHide={() => setSplashVisible(false)} hold />;
  }
  if (!user) {
    return <LoginPage />;
  }
  return (
    <>
      <SplashScreen
        onHide={() => setSplashVisible(false)}
        hold={!dataLoaded}
      />
      <AppRoutes splashVisible={splashVisible} />
    </>
  );
}

export default function App() {
  const themeValue = useTheme();
  const [splashVisible, setSplashVisible] = useState(true);

  return (
    <ThemeContext.Provider value={themeValue}>
      <BrowserRouter>
        <AuthProvider>
          <Gate
            splashVisible={splashVisible}
            setSplashVisible={setSplashVisible}
          />
        </AuthProvider>
        <Toaster
          position="top-right"
          richColors
          theme={themeValue.theme}
          toastOptions={{ className: "font-sans" }}
        />
      </BrowserRouter>
    </ThemeContext.Provider>
  );
}
