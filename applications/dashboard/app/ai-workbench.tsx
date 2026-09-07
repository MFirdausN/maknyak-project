"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}
interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
}
interface Memory {
  id: string;
  key: string;
  value: string;
}
interface ToolRequest {
  id: string;
  toolName: string;
  status: string;
  output?: unknown;
}
interface Props {
  workspaceId: string;
  workspaceRole: "owner" | "admin" | "member" | "viewer";
  onSuccess(message: string): void;
  onError(error: unknown): void;
}

export function AiWorkbench({
  workspaceId,
  workspaceRole,
  onSuccess,
  onError,
}: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tools, setTools] = useState<ToolRequest[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [page, memoryItems, toolItems] = await Promise.all([
        request<{ items: Conversation[] }>(
          `/api/ai/conversations?workspaceId=${workspaceId}&page=1`,
        ),
        request<Memory[]>(`/api/ai/memories?workspaceId=${workspaceId}`),
        request<ToolRequest[]>(
          `/api/ai/tool-requests?workspaceId=${workspaceId}`,
        ),
      ]);
      setConversations(page.items);
      setMemories(memoryItems);
      setTools(toolItems);
      setSelected(
        (current) =>
          page.items.find((item) => item.id === current?.id) ??
          page.items[0] ??
          null,
      );
    } catch (error) {
      onError(error);
    }
  }, [onError, workspaceId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    request<Message[]>(`/api/ai/conversations/${selected.id}/messages`)
      .then(setMessages)
      .catch(onError);
  }, [onError, selected]);

  async function createConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const created = await mutate<Conversation>(
        "/api/ai/conversations",
        "POST",
        { workspaceId, title: new FormData(form).get("title") },
      );
      form.reset();
      await refresh();
      setSelected(created);
      onSuccess("Conversation dibuat.");
    } catch (error) {
      onError(error);
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    try {
      const result = await mutate<{ user: Message; assistant: Message }>(
        `/api/ai/conversations/${selected.id}/messages`,
        "POST",
        { content: new FormData(form).get("content") },
      );
      setMessages((current) => [...current, result.user, result.assistant]);
      form.reset();
      onSuccess("Pesan diproses.");
    } catch (error) {
      onError(error);
    }
  }
  async function remember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await mutate("/api/ai/memories", "PUT", {
        workspaceId,
        key: data.get("key"),
        value: data.get("value"),
      });
      form.reset();
      await refresh();
      onSuccess("Memory disimpan.");
    } catch (error) {
      onError(error);
    }
  }
  async function requestTool(toolName: "conversation.stats" | "memory.list") {
    try {
      await mutate("/api/ai/tool-requests", "POST", {
        workspaceId,
        ...(selected ? { conversationId: selected.id } : {}),
        toolName,
        arguments: {},
      });
      await refresh();
      onSuccess("Tool menunggu approval admin.");
    } catch (error) {
      onError(error);
    }
  }
  async function toolAction(
    id: string,
    action: "approve" | "reject" | "execute",
  ) {
    try {
      await mutate(`/api/ai/tool-requests/${id}/${action}`, "POST", {});
      await refresh();
      onSuccess(`Tool ${action} berhasil.`);
    } catch (error) {
      onError(error);
    }
  }

  const canWrite = workspaceRole !== "viewer";
  const canApprove = workspaceRole === "owner" || workspaceRole === "admin";
  return (
    <section className="ai-workbench">
      <div className="brief-heading">
        <div>
          <small>TENANT MEMORY + SAFE TOOLS</small>
          <h2>AI Workbench</h2>
        </div>
        <span>{conversations.length} conversation</span>
      </div>
      <div className="workbench-grid">
        <div>
          <form className="inline-form" onSubmit={createConversation}>
            <input
              name="title"
              minLength={2}
              maxLength={120}
              placeholder="Conversation baru"
              required
            />
            <button disabled={!canWrite}>Buat</button>
          </form>
          <div className="conversation-list">
            {conversations.map((item) => (
              <button
                className={selected?.id === item.id ? "active" : ""}
                type="button"
                key={item.id}
                onClick={() => setSelected(item)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="message-list">
            {messages.map((item) => (
              <p key={item.id} className={item.role}>
                <strong>{item.role}</strong>
                {item.content}
              </p>
            ))}
          </div>
          <form className="inline-form" onSubmit={send}>
            <input
              name="content"
              maxLength={12000}
              placeholder="Tulis pesan…"
              required
            />
            <button disabled={!canWrite || !selected}>Kirim</button>
          </form>
        </div>
      </div>
      <div className="workbench-grid compact">
        <div>
          <h3>Memory pribadi dalam workspace</h3>
          <form className="stack-form" onSubmit={remember}>
            <input name="key" maxLength={80} placeholder="Kunci" required />
            <input
              name="value"
              maxLength={2000}
              placeholder="Nilai yang perlu diingat"
              required
            />
            <button disabled={!canWrite}>Simpan</button>
          </form>
          <ul>
            {memories.map((item) => (
              <li key={item.id}>
                <strong>{item.key}</strong>: {item.value}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Approval-gated tools</h3>
          <div className="tool-buttons">
            <button
              type="button"
              disabled={!canWrite || !selected}
              onClick={() => void requestTool("conversation.stats")}
            >
              Minta conversation.stats
            </button>
            <button
              type="button"
              disabled={!canWrite}
              onClick={() => void requestTool("memory.list")}
            >
              Minta memory.list
            </button>
          </div>
          {tools.map((item) => (
            <div className="tool-request" key={item.id}>
              <code>{item.toolName}</code>
              <span>{item.status}</span>
              {item.status === "pending" && canApprove && (
                <button onClick={() => void toolAction(item.id, "approve")}>
                  Approve
                </button>
              )}
              {item.status === "approved" && (
                <button onClick={() => void toolAction(item.id, "execute")}>
                  Execute
                </button>
              )}
              {item.output != null && (
                <small>{JSON.stringify(item.output)}</small>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<T>;
}
async function mutate<T>(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<T>;
}
async function failure(response: Response) {
  const payload = (await response.json()) as { message?: string };
  return new Error(payload.message ?? `Request failed (${response.status})`);
}
