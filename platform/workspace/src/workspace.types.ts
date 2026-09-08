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
export interface WorkspaceEntitlement {
  readonly workspaceId: string;
  readonly planKey: "free" | "team";
  readonly displayName: string;
  readonly status: "active" | "past_due" | "cancelled";
  readonly memberLimit: number;
  readonly dailyAgentJobLimit: number;
  readonly retentionDays: number;
  readonly updatedAt: string;
  readonly pendingPlanKey: "free" | "team" | null;
}

export interface SubscriptionChange {
  readonly id: string;
  readonly requestedPlan: "free" | "team";
  readonly status: "pending" | "applied" | "cancelled" | "failed";
  readonly requestedBy: string;
  readonly provider: string | null;
  readonly providerEventId: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface SubscriptionChangePage {
  readonly items: SubscriptionChange[];
  readonly page: number;
  readonly pageSize: 10;
  readonly total: number;
  readonly totalPages: number;
}
