# Data backup and recovery

Status: local/preview baseline. Production scheduling and remote retention are
selected together with the first deployment target.

## Scope

The platform's durable data currently consists of PostgreSQL and the MinIO
agent-artifact bucket. Redis is cache/rate-limit state and NATS currently has no
durable JetStream contract, so neither is part of this backup set.

The backup command creates a PostgreSQL custom-format dump, mirrors MinIO
objects, and records SHA-256 checksums. Its default location is `.backups/` on
the repository filesystem, which is already on `/home` in the local setup and
is ignored by Git. To use the dedicated storage directory:

```bash
BACKUP_DIR=/home/workspace/doicker/maknyak-backups make backup
```

Do not place backups in `/`, `/var/lib/docker`, or a container writable layer.
Backups can contain customer data and must be encrypted before copying them to
remote storage.

## Restore drill

Run a drill against a selected backup:

```bash
make restore-drill BACKUP=/home/workspace/doicker/maknyak-backups/<timestamp>
```

The drill verifies every checksum, restores PostgreSQL into a uniquely named
temporary database, restores objects into a uniquely named temporary bucket,
compares the object trees, then removes both temporary targets. It never writes
into the active database or artifact bucket.

For a production recovery, first stop writers, preserve the failed environment,
restore into new data services, verify migrations and tenant-scoped records,
then switch application configuration to the recovered targets. Never test a
production restore by overwriting active data.

## Initial objectives

- Local/preview RPO: 24 hours after backup scheduling is enabled.
- Local/preview RTO drill objective: 60 minutes.
- Retention proposal: 7 daily and 4 weekly encrypted backups.
- A successful command is not sufficient; run and record a restore drill at
  least monthly and after a storage or schema migration change.

Production RPO, RTO, retention, encryption keys, off-site destination, and
alerting remain deployment decisions. They must be agreed before production
traffic is accepted.
