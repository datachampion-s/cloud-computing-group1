# Supabase database setup and recovery

## Why Supabase is used

Supabase provides PostgreSQL for applications, allocations, reviews and audit events, plus Google authentication for the admin. SQL functions enforce key transitions atomically, including application submission, token redemption and reservation conflicts. It is separate from AWS EBS and S3; exporting a student's workspace does **not** back up the database.

## Prepare a new project safely

1. Create a separate Supabase project for development/staging. Record the project URL (root `https://<ref>.supabase.co`), public anon key and server-only service-role key from project settings. Put them in `.env.local` or the correct Vercel environment, never Git.
2. Obtain a **schema-only export of the actual working project** and migration history, including SQL functions, policies, grants and extensions. Compare it against [the historical initial SQL](reference-initial-schema.sql) and [checked-in migrations](README.md#initial-schema-and-migrations). The historical SQL is user-supplied reference, not a verified complete reconstruction or an idempotent production reset.
3. In the disposable project, apply the verified base schema first, then the repository migrations in chronological order, reviewing each SQL file and any already-applied changes. Confirm tables, functions, grants and RLS through the Supabase dashboard and test expected access with separate users. Avoid applying this process blindly to an existing production database.
4. Set up Google admin sign-in using [integrations](../integrations.md), add the allowed redirect URLs and set `ADMIN_EMAIL`. Test sign-in with the correct Google account and rejection of a different account.
5. Run controlled application, review, scheduling, token, expiry and access tests. Inspect the relevant rows, `email_events` and audit records without leaking tokens or personal information.

## Database backup — required operational work

The course requires a database backup through snapshot or dump. **No verified database-backup configuration or restore test is established by the repository or prior inspection.** The team must verify the actual Supabase plan and project backup settings, choose a supported backup method and demonstrate restoration; do not claim completion based on an S3 workspace ZIP.

1. In Supabase Dashboard → project → Database/Backups, inspect available managed backup or point-in-time recovery options for the current plan. Check what is included, schedule, retention, project access and any costs. Use current [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) for plan-specific availability.
2. If using a logical PostgreSQL dump instead, follow the current [Supabase CLI backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Determine whether schema, data, roles, Auth-related objects and Storage metadata/objects are included; do not expose database passwords in command history, output or screenshots. Protect and encrypt dumps and restrict access.
3. Record owner, frequency, retention, protected storage location and recovery objectives. Restore a representative backup to a **separate disposable project** and verify schema, functions, sample data, Auth configuration and application behavior. Never restore over production as a test.
4. Capture redacted evidence of the backup configuration and successful restore for the report. Until verified, label backup and recovery as pending rather than complete.

Backups can contain personal information, token hashes, access URLs and secrets. Apply least privilege, secure storage and the team's retention policy.
