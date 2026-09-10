"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PortfolioResponse } from "@/lib/types";

const REFRESH_MS = 15_000;

export function usePortfolio() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Guards against two refreshes overlapping if the server is slow - without
  // this a 20s response would stack up requests every 15s.
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;

    inFlight.current = true;
    setIsRefreshing(true);

    try {
      const res = await fetch("/api/portfolio");
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

      setData((await res.json()) as PortfolioResponse);
      setError(null);
    } catch (err) {
      // Keep showing the last good data and surface the problem in a banner,
      // rather than replacing a working table with an error screen.
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      inFlight.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();

    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { data, error, isRefreshing, refresh: load };
}
