"use client";

import { useCallback, useEffect, useState } from "react";

interface Change {
  id: string;
  requestedPlan: "free" | "team";
  status: "pending" | "applied" | "cancelled" | "failed";
  provider: string | null;
  providerEventId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface Page {
  items: Change[];
  page: number;
  total: number;
  totalPages: number;
}

export function BillingHistoryPanel({
  workspaceId,
  onError,
}: {
  workspaceId: string;
  onError(error: unknown): void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/subscription-changes?page=${page}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? `Request failed (${response.status})`);
      }
      setData((await response.json()) as Page);
    } catch (error) {
      onError(error);
    }
  }, [onError, page, workspaceId]);

  useEffect(() => {
    setPage(1);
  }, [workspaceId]);
  useEffect(() => {
    void refresh();
    const visible = () =>
      document.visibilityState === "visible" && void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  return (
    <section className="billing-history">
      <div className="brief-heading">
        <div>
          <small>COMMERCIAL · OWNER ONLY</small>
          <h2>Billing history</h2>
        </div>
        <span>{data?.total ?? 0} perubahan</span>
      </div>
      <div className="billing-list">
        {data?.items.map((change) => (
          <div key={change.id}>
            <span className={`billing-status ${change.status}`}>
              {change.status}
            </span>
            <strong>{change.requestedPlan === "team" ? "Team" : "Free"}</strong>
            <small>{formatDate(change.resolvedAt ?? change.createdAt)}</small>
            <code>{change.provider ?? "menunggu provider"}</code>
          </div>
        ))}
        {data?.items.length === 0 && (
          <p className="muted">Belum ada perubahan plan.</p>
        )}
      </div>
      <div className="pagination">
        <button
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Sebelumnya
        </button>
        <span>
          Halaman {page} / {data?.totalPages ?? 1} · 10 per halaman
        </span>
        <button
          disabled={!data || page >= data.totalPages}
          onClick={() => setPage((value) => value + 1)}
        >
          Berikutnya
        </button>
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
