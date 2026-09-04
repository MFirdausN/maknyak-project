"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

interface BriefResult {
  summary: string;
  targetUsers: string[];
  goals: string[];
  inScope: string[];
  outOfScope: string[];
  risks: string[];
  acceptanceCriteria: string[];
  nextSteps: string[];
}

interface Brief {
  id: string;
  title: string;
  modelId: string;
  result: BriefResult;
  evaluation: { score: number; evaluator: string } | null;
  feedback: { rating: number; comment?: string; updatedAt: string } | null;
  createdAt: string;
}

interface UsageSummary {
  runsToday: number;
  dailyRunLimit: number;
  running: number;
  maxConcurrentRuns: number;
  retentionDays: number;
}

interface BriefPage {
  items: Brief[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Model {
  id: string;
  displayName: string;
  provider: string;
}

interface Props {
  workspaceId: string;
  workspaceRole: "owner" | "admin" | "member" | "viewer";
  onSuccess(message: string): void;
  onError(error: unknown): void;
}

export function ProjectBriefPanel({
  workspaceId,
  workspaceRole,
  onSuccess,
  onError,
}: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BriefPage | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [generating, setGenerating] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    setPage(1);
    void loadModels();
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const [next, nextUsage] = await Promise.all([
          request<BriefPage>(
            `/api/ai/briefs?workspaceId=${workspaceId}&page=${page}`,
          ),
          request<UsageSummary>(`/api/ai/usage?workspaceId=${workspaceId}`),
        ]);
        if (active) {
          setData(next);
          setUsage(nextUsage);
        }
      } catch (error) {
        if (active) onError(error);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onError, page, workspaceId]);

  async function loadModels() {
    try {
      setModels(await request<Model[]>("/api/ai/models"));
    } catch (error) {
      onError(error);
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setGenerating(true);
    setStreamed("");
    try {
      const response = await fetch("/api/ai/briefs/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: form.get("title"),
          idea: form.get("idea"),
          modelId: form.get("modelId"),
        }),
      });
      if (!response.ok || !response.body) throw await responseError(response);
      await consumeEvents(response.body, {
        token: (value) => setStreamed((current) => current + String(value)),
        error: (value) => {
          throw new Error(messageFrom(value));
        },
      });
      target.reset();
      setStreamed("");
      setPage(1);
      setData(
        await request<BriefPage>(
          `/api/ai/briefs?workspaceId=${workspaceId}&page=1`,
        ),
      );
      setUsage(
        await request<UsageSummary>(`/api/ai/usage?workspaceId=${workspaceId}`),
      );
      onSuccess("Project brief berhasil dibuat.");
    } catch (error) {
      onError(error);
    } finally {
      setGenerating(false);
    }
  }

  async function rate(briefId: string, rating: number) {
    try {
      await mutate(`/api/ai/briefs/${briefId}/feedback`, "PUT", { rating });
      setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((brief) =>
                brief.id === briefId
                  ? {
                      ...brief,
                      feedback: { rating, updatedAt: new Date().toISOString() },
                    }
                  : brief,
              ),
            }
          : current,
      );
      onSuccess("Penilaian brief tersimpan.");
    } catch (error) {
      onError(error);
    }
  }

  return (
    <section className="brief-panel">
      <div className="brief-heading">
        <div>
          <small>AI VERTICAL SLICE</small>
          <h2>Project Brief Assistant</h2>
        </div>
        <span>{data?.total ?? 0} brief</span>
      </div>
      {usage && (
        <div className="usage-meter" aria-label="Pemakaian AI hari ini">
          <span>
            {usage.runsToday}/{usage.dailyRunLimit} generasi hari ini
          </span>
          <span>
            {usage.running}/{usage.maxConcurrentRuns} sedang berjalan
          </span>
          <span>Retensi {usage.retentionDays} hari</span>
        </div>
      )}
      <form onSubmit={generate} className="brief-form">
        <label>
          Judul
          <input name="title" required minLength={2} maxLength={120} />
        </label>
        <label>
          Model
          <select name="modelId" required disabled={models.length === 0}>
            {models.map((model) => (
              <option value={model.id} key={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="brief-idea">
          Ide atau masalah pengguna
          <textarea name="idea" required minLength={20} maxLength={8000} />
        </label>
        <button
          type="submit"
          disabled={
            generating || workspaceRole === "viewer" || models.length === 0
          }
        >
          {generating ? "Menyusun brief…" : "Buat project brief"}
        </button>
      </form>
      {streamed && (
        <pre className="stream-preview" aria-live="polite">
          {streamed}
        </pre>
      )}
      <div className="brief-table-wrap">
        <table className="brief-table">
          <thead>
            <tr>
              <th>Judul</th>
              <th>Ringkasan</th>
              <th>Model</th>
              <th>Kualitas</th>
              <th>Feedback</th>
              <th>Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((brief) => (
              <tr key={brief.id}>
                <td>{brief.title}</td>
                <td>
                  <details>
                    <summary>{brief.result.summary}</summary>
                    <BriefSection
                      title="Target pengguna"
                      items={brief.result.targetUsers}
                    />
                    <BriefSection title="Tujuan" items={brief.result.goals} />
                    <BriefSection
                      title="Dalam scope"
                      items={brief.result.inScope}
                    />
                    <BriefSection
                      title="Di luar scope"
                      items={brief.result.outOfScope}
                    />
                    <BriefSection title="Risiko" items={brief.result.risks} />
                    <BriefSection
                      title="Acceptance criteria"
                      items={brief.result.acceptanceCriteria}
                    />
                    <BriefSection
                      title="Langkah berikutnya"
                      items={brief.result.nextSteps}
                    />
                  </details>
                </td>
                <td>{brief.modelId}</td>
                <td>
                  {brief.evaluation ? `${brief.evaluation.score}/100` : "–"}
                </td>
                <td>
                  <div
                    className="brief-rating"
                    aria-label={`Nilai ${brief.title}`}
                  >
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        className={
                          brief.feedback?.rating === rating ? "active" : ""
                        }
                        onClick={() => void rate(brief.id, rating)}
                        aria-label={`${rating} dari 5`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </td>
                <td>{new Date(brief.createdAt).toLocaleString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && (
          <p className="muted">Belum ada project brief.</p>
        )}
      </div>
      <div className="pagination">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((current) => current - 1)}
        >
          Sebelumnya
        </button>
        <span>
          Halaman {data?.page ?? page} / {data?.totalPages ?? 1} · 10 per
          halaman
        </span>
        <button
          type="button"
          disabled={!data || page >= data.totalPages}
          onClick={() => setPage((current) => current + 1)}
        >
          Berikutnya
        </button>
      </div>
    </section>
  );
}

function BriefSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="brief-section">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

async function mutate<T>(
  url: string,
  method: "PUT",
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

async function responseError(response: Response): Promise<Error> {
  const payload = (await response.json()) as { message?: string };
  return new Error(payload.message ?? `Request failed (${response.status})`);
}

async function consumeEvents(
  stream: ReadableStream<Uint8Array>,
  handlers: { token(value: unknown): void; error(value: unknown): void },
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const part = await reader.read();
    buffer += decoder.decode(part.value, { stream: !part.done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const block of events) {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const raw = block.match(/^data: (.+)$/m)?.[1];
      if (!event || !raw) continue;
      const value = JSON.parse(raw) as unknown;
      if (event === "token") handlers.token(value);
      if (event === "error") handlers.error(value);
    }
    if (part.done) break;
  }
}

function messageFrom(value: unknown): string {
  return typeof value === "object" && value && "message" in value
    ? String(value.message)
    : "Generation failed";
}
