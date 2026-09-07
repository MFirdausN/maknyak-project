"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

interface Job {
  id: string;
  goal: string;
  status: string;
  phase: string;
  attempt: number;
  maxAttempts: number;
  output: unknown;
  createdAt: string;
}
interface JobDetail extends Job {
  steps: Array<{ id: string; name: string; status: string; attempt: number }>;
  artifacts: Array<{
    id: string;
    name: string;
    checksumSha256: string;
    content: unknown;
  }>;
}
interface Props {
  workspaceId: string;
  workspaceRole: "owner" | "admin" | "member" | "viewer";
  onSuccess(message: string): void;
  onError(error: unknown): void;
}
interface Operations {
  queued: number;
  running: number;
  awaitingApproval: number;
  succeeded: number;
  failedLast24Hours: number;
  staleRunning: number;
  oldestQueuedSeconds: number | null;
}
interface Notification {
  id: string;
  jobId: string;
  kind: string;
  title: string;
  read: boolean;
  createdAt: string;
}

export function AgentJobsPanel({
  workspaceId,
  workspaceRole,
  onSuccess,
  onError,
}: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: Job[];
    totalPages: number;
    total: number;
  } | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const canApprove = workspaceRole === "owner" || workspaceRole === "admin";
  const refresh = useCallback(async () => {
    try {
      const next = await request<{
        items: Job[];
        totalPages: number;
        total: number;
      }>(`/api/ai/agent-jobs?workspaceId=${workspaceId}&page=${page}`);
      setData(next);
      if (canApprove) {
        const [metrics, notices] = await Promise.all([
          request<Operations>(
            `/api/ai/agent-jobs/operations?workspaceId=${workspaceId}`,
          ),
          request<Notification[]>(
            `/api/ai/agent-jobs/notifications?workspaceId=${workspaceId}`,
          ),
        ]);
        setOperations(metrics);
        setNotifications(notices);
      }
      if (detail)
        setDetail(await request<JobDetail>(`/api/ai/agent-jobs/${detail.id}`));
    } catch (error) {
      onError(error);
    }
  }, [canApprove, detail?.id, onError, page, workspaceId]);
  useEffect(() => {
    setPage(1);
    setDetail(null);
  }, [workspaceId]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const created = await mutate<Job>("/api/ai/agent-jobs", {
        workspaceId,
        agentKey: "project-planner-v1",
        goal: new FormData(form).get("goal"),
      });
      form.reset();
      setPage(1);
      setDetail(await request<JobDetail>(`/api/ai/agent-jobs/${created.id}`));
      await refresh();
      onSuccess("Agent job masuk antrean durable.");
    } catch (error) {
      onError(error);
    }
  }
  async function action(action: "approve" | "reject" | "cancel") {
    if (!detail) return;
    try {
      setDetail(
        await mutate<JobDetail>(
          `/api/ai/agent-jobs/${detail.id}/${action}`,
          {},
        ),
      );
      await refresh();
      onSuccess(`Agent job ${action} berhasil.`);
    } catch (error) {
      onError(error);
    }
  }
  const canWrite = workspaceRole !== "viewer";
  async function markRead(id: string) {
    try {
      await mutate(`/api/ai/agent-jobs/notifications/${id}/read`, {});
      setNotifications((items) =>
        items.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
    } catch (error) {
      onError(error);
    }
  }
  return (
    <section className="agent-panel">
      <div className="brief-heading">
        <div>
          <small>PHASE 3 · DURABLE EXECUTION</small>
          <h2>Project Planner Agent</h2>
        </div>
        <span>{data?.total ?? 0} job</span>
      </div>
      <form className="agent-goal" onSubmit={create}>
        <textarea
          name="goal"
          minLength={20}
          maxLength={4000}
          required
          placeholder="Jelaskan outcome yang ingin dicapai agent…"
        />
        <button disabled={!canWrite}>Jalankan agent</button>
      </form>
      {operations && (
        <div className="agent-metrics">
          <span>
            queued <strong>{operations.queued}</strong>
          </span>
          <span>
            running <strong>{operations.running}</strong>
          </span>
          <span>
            approval <strong>{operations.awaitingApproval}</strong>
          </span>
          <span>
            failed 24h <strong>{operations.failedLast24Hours}</strong>
          </span>
          <span>
            stale <strong>{operations.staleRunning}</strong>
          </span>
        </div>
      )}
      {notifications.length > 0 && canApprove && (
        <div className="agent-notifications">
          {notifications.slice(0, 5).map((notice) => (
            <button
              type="button"
              key={notice.id}
              className={notice.read ? "read" : ""}
              onClick={() =>
                notice.read
                  ? request<JobDetail>(`/api/ai/agent-jobs/${notice.jobId}`)
                      .then(setDetail)
                      .catch(onError)
                  : void markRead(notice.id)
              }
            >
              {notice.title}
              <small>{notice.kind.replaceAll("_", " ")}</small>
            </button>
          ))}
        </div>
      )}
      <div className="agent-layout">
        <div className="agent-jobs">
          {data?.items.map((job) => (
            <button
              type="button"
              className={detail?.id === job.id ? "active" : ""}
              key={job.id}
              onClick={() =>
                request<JobDetail>(`/api/ai/agent-jobs/${job.id}`)
                  .then(setDetail)
                  .catch(onError)
              }
            >
              <strong>{job.goal}</strong>
              <span>
                {job.status} · attempt {job.attempt}/{job.maxAttempts}
              </span>
            </button>
          ))}
        </div>
        <div className="agent-detail">
          {detail ? (
            <>
              <div className="agent-status">
                <strong>{detail.status}</strong>
                <span>phase: {detail.phase}</span>
              </div>
              <p>{detail.goal}</p>
              <ol>
                {detail.steps.map((step) => (
                  <li key={step.id}>
                    {step.name} — {step.status} (#{step.attempt})
                  </li>
                ))}
              </ol>
              {detail.status === "awaiting_approval" && canApprove && (
                <div className="tool-buttons">
                  <button type="button" onClick={() => void action("approve")}>
                    Approve & publish
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void action("reject")}
                  >
                    Reject
                  </button>
                </div>
              )}
              {["queued", "awaiting_approval"].includes(detail.status) &&
                canWrite && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void action("cancel")}
                  >
                    Cancel
                  </button>
                )}
              {detail.artifacts.map((artifact) => (
                <details key={artifact.id}>
                  <summary>Artifact: {artifact.name}</summary>
                  <small>SHA-256 {artifact.checksumSha256}</small>
                  <pre>{JSON.stringify(artifact.content, null, 2)}</pre>
                </details>
              ))}
            </>
          ) : (
            <p className="muted">
              Pilih job untuk melihat checkpoint dan artifact.
            </p>
          )}
        </div>
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

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<T>;
}
async function mutate<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<T>;
}
async function failure(response: Response) {
  const body = (await response.json()) as { message?: string };
  return new Error(body.message ?? `Request failed (${response.status})`);
}
