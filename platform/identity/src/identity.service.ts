import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE } from "./database";

export interface PrincipalInput {
  id: string;
  issuer: string;
  subject: string;
  username?: string | undefined;
  email?: string | undefined;
  displayName?: string | undefined;
}

export interface Principal extends PrincipalInput {
  createdAt: string;
  lastSeenAt: string;
}

interface PrincipalRow extends Omit<PrincipalInput, "displayName"> {
  display_name?: string;
  created_at: Date;
  last_seen_at: Date;
}

@Injectable()
export class IdentityService {
  constructor(@Inject(DATABASE) private readonly database: Pool) {}

  async sync(input: PrincipalInput): Promise<Principal> {
    const result = await this.database.query<PrincipalRow>(
      `INSERT INTO identity.principals (id, issuer, subject, username, email, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (issuer, subject) DO UPDATE SET
         username = EXCLUDED.username,
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         last_seen_at = now(),
         updated_at = now()
       RETURNING id, issuer, subject, username, email, display_name, created_at, last_seen_at`,
      [
        input.id,
        input.issuer,
        input.subject,
        input.username ?? null,
        input.email ?? null,
        input.displayName ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Principal upsert returned no row");
    return {
      id: row.id,
      issuer: row.issuer,
      subject: row.subject,
      ...(row.username ? { username: row.username } : {}),
      ...(row.email ? { email: row.email } : {}),
      ...(row.display_name ? { displayName: row.display_name } : {}),
      createdAt: row.created_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
    };
  }
}
