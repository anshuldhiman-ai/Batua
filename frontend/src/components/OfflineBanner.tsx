import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, ServerOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, BACKEND_STATUS_EVENT, isBackendOnline } from "@/lib/utils-finance";

// Global "backend unreachable" notice. Portal-rendered to <body> so it is
// never offset by a transformed (framer-motion) ancestor.
export default function OfflineBanner() {
  const [online, setOnline] = useState(isBackendOnline);
  const [checking, setChecking] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const onStatus = (e: Event) => {
      const next = (e as CustomEvent<{ online: boolean }>).detail.online;
      setOnline(next);
      // Back online: refetch whatever failed while the server was down.
      if (next) queryClient.invalidateQueries();
    };
    window.addEventListener(BACKEND_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(BACKEND_STATUS_EVENT, onStatus);
  }, [queryClient]);

  // While offline, probe quietly so the banner clears on its own.
  useEffect(() => {
    if (online) return;
    const id = window.setInterval(() => {
      api.get("/").catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, [online]);

  const retry = async () => {
    setChecking(true);
    try {
      await api.get("/");
    } catch {
      /* status event already reflects the failure */
    } finally {
      setChecking(false);
    }
  };

  if (online) return null;

  return createPortal(
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[110] flex items-center justify-center gap-3 border-b border-destructive/30 bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-md"
    >
      <ServerOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Can't reach the Batua server. Make sure the backend is running.</span>
      <button
        type="button"
        onClick={retry}
        disabled={checking}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive-foreground/40 px-2.5 py-1 text-xs font-medium hover:bg-destructive-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive-foreground disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
        {checking ? "Checking…" : "Retry"}
      </button>
    </div>,
    document.body
  );
}
