"use client";

import React, {
  type FormEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";

const ProjectBriefPanel = lazy(() =>
  import("./project-brief-panel").then((module) => ({
    default: module.ProjectBriefPanel,
  })),
);

interface Session {
  authenticated: boolean;
  principal?: { username?: string; email?: string; name?: string };
}

interface Workspace {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  token?: string;
}

interface Membership {
  principalId: string;
  role: Workspace["role"];
}

interface Toast {
  kind: "success" | "error";
  message: string;
}

export function WorkspaceConsole() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<Workspace | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const showSuccess = useCallback((message: string) => {
    setToast({ kind: "success", message });
  }, []);

  const showError = useCallback((error: unknown) => {
    setToast({
      kind: "error",
      message: error instanceof Error ? error.message : "Terjadi kesalahan.",
    });
  }, []);

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (selected) void loadMembers(selected.id);
    else setMembers([]);
  }, [selected]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!session?.authenticated) return;
    let active = true;
    let refreshing = false;

    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const items = await api<Workspace[]>("/api/workspaces");
        if (!active) return;
        setWorkspaces(items);
        setSelected((current) =>
          current
            ? (items.find((item) => item.id === current.id) ?? items[0] ?? null)
            : (items[0] ?? null),
        );
        if (selected && items.some((item) => item.id === selected.id)) {
          const refreshedMembers = await api<Membership[]>(
            `/api/workspaces/${selected.id}/members`,
          );
          if (active) setMembers(refreshedMembers);
        }
        if (active) setLastSynced(new Date());
      } catch {
        // Background refresh is silent; user-triggered actions still show errors.
      } finally {
        refreshing = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(() => void refresh(), 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [session?.authenticated, selected?.id]);

  async function loadSession() {
    const current = await api<Session>("/api/session");
    setSession(current);
    if (current.authenticated) await loadWorkspaces();
  }

  async function loadWorkspaces() {
    const items = await api<Workspace[]>("/api/workspaces");
    setWorkspaces(items);
    setSelected((current) =>
      current
        ? (items.find((item) => item.id === current.id) ?? items[0] ?? null)
        : (items[0] ?? null),
    );
    setLastSynced(new Date());
  }

  async function loadMembers(workspaceId: string) {
    setMembers(
      await api<Membership[]>(`/api/workspaces/${workspaceId}/members`),
    );
  }

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    try {
      const form = new FormData(target);
      await api("/api/workspaces/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: form.get("token") }),
      });
      target.reset();
      showSuccess("Undangan diterima dan workspace sudah ditambahkan.");
      await loadWorkspaces();
    } catch (error) {
      showError(error);
    }
  }

  async function changeRole(member: Membership, role: Workspace["role"]) {
    if (!selected) return;
    try {
      await api(
        `/api/workspaces/${selected.id}/members/${member.principalId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ role }),
        },
      );
      showSuccess("Role anggota berhasil diperbarui.");
      await Promise.all([loadMembers(selected.id), loadWorkspaces()]);
    } catch (error) {
      showError(error);
      await loadMembers(selected.id);
    }
  }

  async function removeMember(member: Membership) {
    if (!selected) return;
    try {
      await api(
        `/api/workspaces/${selected.id}/members/${member.principalId}`,
        { method: "DELETE" },
      );
      showSuccess("Anggota berhasil dihapus.");
      await loadWorkspaces();
      try {
        await loadMembers(selected.id);
      } catch {
        setMembers([]);
      }
    } catch (error) {
      showError(error);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    try {
      const form = new FormData(target);
      await api("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          slug: form.get("slug"),
        }),
      });
      target.reset();
      showSuccess("Workspace berhasil dibuat.");
      await loadWorkspaces();
    } catch (error) {
      showError(error);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const target = event.currentTarget;
    try {
      const form = new FormData(target);
      await api(`/api/workspaces/${selected.id}/projects`, {
        method: "POST",
        body: JSON.stringify({ name: form.get("name") }),
      });
      target.reset();
      showSuccess("Project berhasil dibuat.");
    } catch (error) {
      showError(error);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const target = event.currentTarget;
    try {
      const form = new FormData(target);
      const created = await api<Invitation>(
        `/api/workspaces/${selected.id}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            role: form.get("role"),
          }),
        },
      );
      setInvitation(created);
      target.reset();
      showSuccess("Undangan dibuat. Bagikan token hanya kepada email tujuan.");
    } catch (error) {
      showError(error);
    }
  }

  return (
    <main>
      <nav>
        <span className="mark">M</span>
        <strong>Maknyak Platform</strong>
        <span className="status">
          <i /> Phase 1 · Secure tenancy
        </span>
      </nav>

      {!session ? (
        <section className="panel loading">Memeriksa sesi…</section>
      ) : !session.authenticated ? (
        <section className="hero">
          <p className="eyebrow">SECURE MULTI-TENANT CONTROL PLANE</p>
          <h1>
            Satu fondasi.
            <br />
            <em>Banyak produk.</em>
          </h1>
          <p className="lead">
            Masuk melalui OpenID Connect dengan Authorization Code dan PKCE
            untuk mengelola workspace secara aman.
          </p>
          <div className="actions">
            <a href="/api/auth/login">
              Masuk dengan Keycloak <span>→</span>
            </a>
          </div>
        </section>
      ) : (
        <>
          <header className="console-header">
            <div>
              <p className="eyebrow">WORKSPACE CONTROL PLANE</p>
              <h1>
                Halo,{" "}
                {session.principal?.name ??
                  session.principal?.username ??
                  "user"}
                .
              </h1>
            </div>
            <a className="quiet-link" href="/api/auth/logout">
              Keluar
            </a>
          </header>
          <section className="console-grid">
            <aside className="panel">
              <div className="panel-title">
                <h2>Workspace</h2>
                <small>
                  {workspaces.length} · Auto-sync
                  {lastSynced && ` ${formatTime(lastSynced)}`}
                </small>
              </div>
              <div className="workspace-list">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    className={selected?.id === workspace.id ? "selected" : ""}
                    onClick={() => setSelected(workspace)}
                  >
                    <strong>{workspace.name}</strong>
                    <span>
                      {workspace.role} · {workspace.slug}
                    </span>
                  </button>
                ))}
                {workspaces.length === 0 && (
                  <p className="muted">Belum ada workspace.</p>
                )}
              </div>
              <form onSubmit={createWorkspace}>
                <label>
                  Nama
                  <input name="name" required minLength={2} maxLength={100} />
                </label>
                <label>
                  Slug
                  <input
                    name="slug"
                    required
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  />
                </label>
                <button type="submit">Buat workspace</button>
              </form>
              <form onSubmit={acceptInvitation}>
                <h3>Terima undangan</h3>
                <label>
                  Token
                  <input name="token" required minLength={32} />
                </label>
                <button type="submit">Gabung workspace</button>
              </form>
            </aside>
            <section className="panel detail">
              {selected ? (
                <>
                  <div className="panel-title">
                    <div>
                      <small>{selected.role}</small>
                      <h2>{selected.name}</h2>
                    </div>
                    <code>{selected.id}</code>
                  </div>
                  <div className="forms-grid">
                    <form onSubmit={createProject}>
                      <h3>Project baru</h3>
                      <label>
                        Nama
                        <input
                          name="name"
                          required
                          minLength={2}
                          maxLength={100}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={selected.role === "viewer"}
                      >
                        Buat project
                      </button>
                    </form>
                    <form onSubmit={invite}>
                      <h3>Undang anggota</h3>
                      <label>
                        Email
                        <input name="email" type="email" required />
                      </label>
                      <label>
                        Role
                        <select name="role" defaultValue="member">
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </label>
                      <button
                        type="submit"
                        disabled={!["owner", "admin"].includes(selected.role)}
                      >
                        Buat undangan
                      </button>
                    </form>
                  </div>
                  {invitation?.token && (
                    <div className="token">
                      <small>Token undangan sekali tampil</small>
                      <code>{invitation.token}</code>
                    </div>
                  )}
                  <div className="member-list">
                    <h3>Anggota</h3>
                    {members.map((member) => (
                      <div className="member-row" key={member.principalId}>
                        <code>{member.principalId}</code>
                        <select
                          aria-label={`Role ${member.principalId}`}
                          value={member.role}
                          disabled={selected.role !== "owner"}
                          onChange={(event) =>
                            void changeRole(
                              member,
                              event.target.value as Workspace["role"],
                            )
                          }
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          className="danger"
                          disabled={selected.role !== "owner"}
                          onClick={() => void removeMember(member)}
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                  <Suspense
                    fallback={
                      <div className="brief-loading">
                        Memuat AI Project Brief…
                      </div>
                    }
                  >
                    <ProjectBriefPanel
                      workspaceId={selected.id}
                      workspaceRole={selected.role}
                      onSuccess={showSuccess}
                      onError={showError}
                    />
                  </Suspense>
                </>
              ) : (
                <div className="empty">
                  <h2>Pilih atau buat workspace</h2>
                  <p>Workspace adalah batas isolasi tenant Maknyak Platform.</p>
                </div>
              )}
            </section>
          </section>
        </>
      )}
      <footer>
        <span>MAKNYAK / PLATFORM</span>
        <span>Makassar, Indonesia</span>
      </footer>
      {toast && (
        <div
          className={`toast ${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span>{toast.kind === "success" ? "Berhasil" : "Gagal"}</span>
          <p>{toast.message}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Tutup"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new Error(payload.message ?? `Request failed (${response.status})`);
  return payload;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
