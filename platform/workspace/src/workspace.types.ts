export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface Workspace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly role: WorkspaceRole;
  readonly createdAt: string;
}

export interface Project {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly createdAt: string;
}
