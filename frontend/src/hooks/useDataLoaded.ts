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
      .some((q) => q.state.data !== undefined)
  );
}

export function useDataLoaded(): boolean {
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(() => hasCoreData(queryClient));

  useEffect(() => {
    if (loaded) return;
    // The queries resolve as the routed pages mount — re-check
    // whenever anything in the cache changes. Success and error
    // both count as "resolved": the pages render their own
    // empty/error states, so the splash must never hang on a
    // failing request.
    return queryClient.getQueryCache().subscribe(() => {
      if (hasCoreData(queryClient)) setLoaded(true);
    });
  }, [queryClient, loaded]);

  return loaded;
}
