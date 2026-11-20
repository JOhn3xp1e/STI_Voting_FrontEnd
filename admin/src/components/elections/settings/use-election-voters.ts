"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getApiErrorMessage } from "@/services/api/error-message";
import { fetchVoterRows, type VoterRow } from "@/services/voters/voters.service";

/** How often to refresh while login emails are on their way. */
const POLL_MS = 4000;

export interface ElectionVoters {
  /** `null` until the first load. */
  rows: VoterRow[] | null;
  error: string | null;
  /** A reload is running (the first load, a refresh or a poll). */
  loading: boolean;
  refresh: () => Promise<void>;
  /** Replaces rows locally (e.g. after deactivating one) before the next refresh. */
  patch: (id: string, change: Partial<VoterRow>) => void;
}

/** The election's voters with their login status. Refreshes on its own while emails are queued or sending. */
export function useElectionVoters(electionId: string): ElectionVoters {
  const [rows, setRows] = useState<VoterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  /** Fetches into state (state only changes once the answer is back). */
  const load = useCallback(
    async (controller: AbortController) => {
      try {
        const next = await fetchVoterRows(electionId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRows(next);
        setError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(getApiErrorMessage(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [electionId],
  );

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    await load(controller);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    fetchVoterRows(electionId, { signal: controller.signal })
      .then((next) => {
        setRows(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(getApiErrorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [electionId]);

  // Live progress while the server sends (queued → sending → sent / failed).
  const inFlight = rows?.some((r) => r.emailStatus === "queued" || r.emailStatus === "sending") ?? false;
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [inFlight, refresh]);

  const patch = useCallback((id: string, change: Partial<VoterRow>) => {
    setRows((current) => current?.map((r) => (r.id === id ? { ...r, ...change } : r)) ?? current);
  }, []);

  return { rows, error, loading, refresh, patch };
}

/** Runs `task` for every item, a few at a time, reporting progress; failures are collected, not thrown. */
export async function runInBatches<T>(
  items: readonly T[],
  task: (item: T) => Promise<void>,
  onProgress: (done: number) => void,
  concurrency = 6,
): Promise<{ failed: { item: T; message: string }[] }> {
  const failed: { item: T; message: string }[] = [];
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await task(item);
      } catch (cause) {
        failed.push({ item, message: getApiErrorMessage(cause) });
      }
      onProgress(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { failed };
}
