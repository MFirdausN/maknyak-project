CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS workspace;
CREATE SCHEMA IF NOT EXISTS audit;

COMMENT ON SCHEMA identity IS 'Owned exclusively by the Identity domain';
COMMENT ON SCHEMA workspace IS 'Owned exclusively by the Workspace domain';
COMMENT ON SCHEMA audit IS 'Append-only platform audit records';
