import { ForbiddenException } from "@nestjs/common";
import type { WorkspaceRole } from "./workspace.types";

const rank: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function requireRole(
  actual: WorkspaceRole | undefined,
  minimum: WorkspaceRole,
): void {
  if (!actual || rank[actual] < rank[minimum]) {
    throw new ForbiddenException("Insufficient workspace permission");
  }
}
