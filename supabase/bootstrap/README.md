# Empty-project schema and database proof

`schema.sql` is a public-safe DDL/ACL baseline for a **new, empty** Supabase project with PostgreSQL 17 and the managed Auth/Storage schemas already initialized. It contains no accounts, approved role identities, customer content, source corpus, object bytes or secrets. Its guard rejects existing application tables, accounts and application storage. Never apply it to production or use it to reset an existing project. Existing projects use reviewed forward migrations and their actual migration ledger.

The baseline represents the final application contracts, including private account metadata, protected membership, explicit public projections, transactional profile operations, owner revisions, runtime counters, bounded retrieval and media registration. New application objects require explicit browser grants. On a fresh Supabase installation, default grants must be revoked **before** importing the dump's explicit ACLs; otherwise default table privileges survive the import. The actor proof tests this with a newly created probe table and function.

From the repository, with Docker running and dependencies installed:

```sh
export NSSO_CI_DIR=/tmp/nsso-security-ci-example
node scripts/security/start-ci-database.mjs "$NSSO_CI_DIR"
export NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL=1
export NSSO_LOCAL_REHEARSAL_CONTAINER=supabase_db_nsso-security-ci-example
node scripts/security/verify-fresh-project.mjs \
  "$NSSO_CI_DIR/private/local-status.json" \
  "$NSSO_CI_DIR/private/evidence"
```

The startup script pins Supabase CLI 2.122.0, configures an isolated local project, enables local TOTP and disables automatic seeds. It refuses an existing stack and keeps local credentials/logs outside the repository in files with mode 0600. The proof imports this baseline, creates synthetic Auth actors, exercises real Auth/Data API/Storage authorization and restores a synthetic dump into a separate database for concurrent journal/retry/Undo/limiter tests. It never calls paid model providers or accepts remote API/database URLs.

Supported Auth deletion is a required positive regression test, including cleanup of public identity, profile collections, private settings, revisions, journal and media registry. Both operation-first and deletion-first schedules are forced locally. Runtime account/journal functions lock the Auth parent with `FOR KEY SHARE` before advisory locks719/730; only genuine missing-parent deletion cascades skip child journaling. Ordinary owner removal and Undo remain tested. No managed Auth deletion trigger is shipped, and cleanup API errors fail the gate rather than being ignored.

The negative control deliberately adds an unsafe anonymous avatar policy **only in that isolated stack**. The command below must fail with `NSSO_NEGATIVE_CONTROL: anonymous avatar upload bypassed ownership RLS`. The policy is removed in `finally`; CI requires both the failure and the marker rather than treating every process error as proof.

```sh
NSSO_TEST_UNSAFE_POLICY=avatar node scripts/security/verify-fresh-project.mjs \
  "$NSSO_CI_DIR/private/local-status.json" \
  "$NSSO_CI_DIR/private/negative-evidence" --existing
```

After verification, stop only this synthetic stack:

```sh
npx --yes supabase@2.122.0 stop --no-backup --workdir "$NSSO_CI_DIR"
```

The separate `rehearse-database.mjs` runner proves an upgrade from a restricted metadata-only current-catalog fixture; that private release fixture is not a CI dependency. `rehearse-profile-journal.mjs` supports both upgrade fixtures and the final fresh baseline. An expected source/registry deployment must precede the separate profile/media direct-write cutovers. A rollback ships a compatible application or forward SQL fix; it must not restore public private fields, writable roles or anonymous privileged functions.

The vector extension remains in `public` as a reviewed compatibility exception owned by Ramin, due for review by 2026-11-25. Browser roles cannot create objects in `public`, and corpus/retrieval access is service-only with fixed function paths and bounded inputs. Relocating the extension requires a dedicated migration and testing of qualified types, operators and every existing function signature; its schema location alone is not a demonstrated data disclosure.
