# Storage recovery

Supabase database backups contain Storage catalog metadata, not file bytes. A complete recovery therefore needs both a matching database backup and an encrypted media snapshot. This tool never inserts or updates Storage catalog rows to repair ownership. Restore the database through the normal database recovery process first; the tool then restores bytes through the Storage API.

The version 2 encrypted manifest preserves original object IDs, paths, `owner`, `owner_id`, system metadata, custom `user_metadata`, timestamps/version, and bucket ownership/settings. Before byte restoration it checks the target's restored catalog against that snapshot. A missing or different owner row stops recovery; the tool does not silently recreate ownerless files using the service key.

After API restoration, it verifies SHA-256 hashes by downloading every object, rereads the catalog, and checks IDs, owners, custom metadata, MIME types, cache policies, sizes, and bucket settings. Storage API writes generate new storage versions and update system timestamps; these fields are retained historically in the snapshot but are not expected to remain identical in the running restored service. This adapter supports standard `max-age=N` cache policies and refuses unsupported policies.

## Capture and verify

Keep the 32-byte recovery key outside the snapshot directory and protect both with owner-only permissions. The script creates files with mode `0600` and directories with `0700`, refuses symlink files, and authenticates every encrypted payload with AES-256-GCM. Keep an independently secured copy of the key; a snapshot without its key cannot be recovered.

Use the existing server environment without echoing credentials:

```sh
node scripts/security/storage-recovery.mjs backup PRIVATE_SNAPSHOT_DIRECTORY PRIVATE_KEY_FILE
```

This first creates a version 1 byte snapshot. Capture the read-only `STORAGE_CATALOG_QUERY` exported by the script through an approved database connection or MCP query, encrypt the resulting `{objects:[...],buckets:[...]}` JSON envelope with `encryptPayload` and the same key, and attach it:

```sh
node scripts/security/storage-recovery.mjs attach-metadata PRIVATE_SNAPSHOT_DIRECTORY PRIVATE_KEY_FILE PRIVATE_CATALOG_ENC
node scripts/security/storage-recovery.mjs verify PRIVATE_SNAPSHOT_DIRECTORY PRIVATE_KEY_FILE
```

Attachment requires one-to-one object/bucket coverage and matching byte size, MIME type, and `updated_at`. It verifies the existing ciphertexts first, retains the original manifest as `manifest.v1.enc`, and atomically replaces `manifest.enc`. A mismatch means take a fresh coordinated snapshot; do not relax the checks. Pause writes or otherwise coordinate database/media capture if users might modify objects during the backup. The byte-only command cannot prove ownership restoration, and `verify` reports capture separately from successful target verification.

## Isolated local recovery

Set `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_ROLE_KEY` for the isolated local Storage service. Also set `TEST_SUPABASE_DB_CONTAINER` to the dedicated `supabase_db_nsso-security-rehearsal-*` container and `TEST_SUPABASE_DB_NAME` to its restored `nsso_*` database. The database must already contain the matching catalog and original Auth identities. Then run:

```sh
node scripts/security/storage-recovery.mjs restore-local PRIVATE_SNAPSHOT_DIRECTORY PRIVATE_KEY_FILE
```

The CLI restricts restoration to local addresses and reads the target catalog with a fixed SELECT query. `restore-bytes-local` is an explicit legacy diagnostic for version 1 snapshots; it reports `ownershipVerified:false` and must not be presented as a complete ownership recovery. Do not use it to replace an ownership-aware snapshot.

Run the opt-in synthetic integration proof after coordinating exclusive use of the primary local rehearsal stack:

```sh
NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL=1 node scripts/security/rehearse-storage-recovery.mjs PRIVATE_LOCAL_STATUS_JSON NEW_PRIVATE_EVIDENCE_DIRECTORY
```

The proof creates genuinely owned legacy uploads through Auth/Storage APIs, takes a whole-database dump, restores it to a dedicated local database, and applies the final forward contracts there. It starts separate recovered Data API and Storage containers, with an empty file backend, then restores every byte through the Storage API. It checks original ownership/custom metadata/bytes without directly changing catalog rows.

Under the final policies, **owners and foreign users both lose direct Storage INSERT/UPDATE**. Replacement uses the application boundary: validated JPEG bytes go to a new server-generated path, the service-only registry binds that object to the verified actor, and the owner's authenticated journal commits the new profile/project URL. The proof tests that path against the recovered database, rejects foreign mutations, retains old readable bytes and preserves verified legacy-owner DELETE. A one-path synthetic fixture policy is removed before the dump; final restored policies are never weakened to make replacement pass.

The drill cleans up only its own fixtures and temporary recovered database/containers. It never accepts a remote project or fabricates production user JWTs. API restoration may change system timestamps/version as described above; a successful byte restore alone does not prove that the current application mutation contracts still work.

## Official references

- [Storage ownership](https://supabase.com/docs/guides/storage/security/ownership): new service-key uploads have no user owner; `owner_id` is the current ownership field.
- [Storage schema](https://supabase.com/docs/guides/storage/schema/design): catalog tables are read-only for application operations; object operations use the API.
- [Backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) and [download objects](https://supabase.com/docs/guides/storage/management/download-objects): database metadata and stored files are separate recovery inputs.
