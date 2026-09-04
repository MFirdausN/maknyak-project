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

export interface Membership {
  readonly principalId: string;
  readonly role: WorkspaceRole;
  readonly createdAt: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  readonly id: string;
  readonly workspaceId: string;
  readonly email: string;
  readonly role: Exclude<WorkspaceRole, "owner">;
  readonly status: InvitationStatus;
  readonly invitedBy: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface CreatedInvitation extends Invitation {
  readonly token: string;
}

export interface AuditEvent {
  readonly id: string;
  readonly principalId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: string;
}
