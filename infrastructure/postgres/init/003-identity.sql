CREATE SCHEMA IF NOT EXISTS keycloak;

CREATE TABLE IF NOT EXISTS identity.principals (
  id uuid PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  username text,
  email text,
  display_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS principals_email_idx ON identity.principals(email);
