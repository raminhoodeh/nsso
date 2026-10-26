-- Current application DDL is owned by postgres. Keep explicit service grants;
-- future app tables/functions require deliberate browser-role grants.
-- Supabase-managed owners/schemas and existing object ACLs are unchanged.
BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
-- Function PUBLIC EXECUTE is also an implicit global default. Per-schema
-- revocation alone cannot subtract it; remove the global default for app DDL.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
COMMIT;
