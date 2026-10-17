import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * True once the app's core datasets have loaded at least once.
 *
 * The splash screen stays up until this flips so the first
 * thing the user sees is a populated app, not a flash of
 * empty lists that fill in a beat later. It watches the
 * react-query cache rather than each page's loading state —
 * the pages mount under the gate, so their queries are the
 * source of truth for "the app has loaded".
 *
 * Keys watched: the default transactions list and the
 * dashboard metrics. If a query errors, it still counts as
 * resolved (the app renders its own empty/error states), so
 * the splash never hangs on a failing request.
 */

const CORE_QUERY_PREFIXES = ["transactions", "dashboard_metrics"];

function hasCoreData(client: ReturnType<typeof useQueryClient>): boolean {
  const cache = client.getQueryCache();
  return CORE_QUERY_PREFIXES.some((prefix) =>
    cache
      .findAll({ queryKey: [prefix] })
      // Errors count as resolved — the pages render their own
      // error states, so the splash must never hang on a
      // failing request.
      .some((q) => q.state.data !== undefined || q.state.error !== undefined)
  );
}

// If the core queries somehow never settle (backend down with no
// error event, race in cache subscription), don't hold the splash
// hostage — release after this long. The app renders its own
// loading/error states underneath.
const HOLD_SAFETY_MS = 10000;

// Deep-linked routes (Settings, Analytics, Goals, …) never fetch the core
// datasets, so the subscribe/safety path above would hold the splash for the
// full safety timeout. If no core query exists this long after mount, the
// current route clearly doesn't need them — release immediately.
const NO_CORE_GRACE_MS = 1200;

export function useDataLoaded(): boolean {
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(() => hasCoreData(queryClient));

  useEffect(() => {
    if (loaded) return;
    const cache = queryClient.getQueryCache();
    // The queries resolve as the routed pages mount — re-check
    // whenever anything in the cache changes. Success and error
    // both count as "resolved": the pages render their own
    // empty/error states, so the splash must never hang on a
    // failing request.
    const unsubscribe = cache.subscribe(() => {
      if (hasCoreData(queryClient)) setLoaded(true);
    });
    // Release early when the current route doesn't fetch the core datasets.
    const graceTimer = setTimeout(() => {
      const hasCoreQuery = CORE_QUERY_PREFIXES.some(
        (prefix) => cache.findAll({ queryKey: [prefix] }).length > 0
      );
      if (!hasCoreQuery) setLoaded(true);
    }, NO_CORE_GRACE_MS);
    // Safety valve: even if no query event ever fires, release
    // the splash so the user always gets to the app.
    const timer = setTimeout(() => setLoaded(true), HOLD_SAFETY_MS);
    return () => {
      unsubscribe();
      clearTimeout(graceTimer);
      clearTimeout(timer);
    };
  }, [queryClient, loaded]);

  return loaded;
}
