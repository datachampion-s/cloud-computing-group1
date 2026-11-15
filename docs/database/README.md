# Database and Supabase

## Initial schema and migrations

The repository's three incremental migrations assume earlier tables already exist. They are **not** a complete bootstrap by themselves. [`reference-initial-schema.sql`](reference-initial-schema.sql) preserves the initial SQL previously supplied for this project, for reference and reconstruction; it is not a verified full schema dump of the current production project. It includes legacy document storage objects and non-idempotent statements. Never run it over an existing populated project. For a fresh project, first compare a schema-only export of the actual source project, functions, policies, extensions and migration history; validate in a disposable project and back up data before applying anything.

The checked-in incremental migrations, in order, are:

1. [`20261024_portal_workflow.sql`](../../supabase/migrations/20261024_portal_workflow.sql)
2. [`20261025_application_notifications.sql`](../../supabase/migrations/20261025_application_notifications.sql)
3. [`20261114_portal_retention.sql`](../../supabase/migrations/20261114_portal_retention.sql)

Inspect each migration and the target database before executing it. Confirm SQL definitions and RLS policies rather than assuming a migration is safe to repeat.

## Data model

| Table | Responsibility |
| --- | --- |
| `applications` | Applicant identity, project, Drive links, preferences, submission and review status |
| `application_documents` | Historical storage document metadata; current application uses Drive links |
| `application_reviews` | Admin review decisions and notes |
| `compute_allocations` | Selected instance, scheduled window, status and reservation information |
| `availability_confirmations` | Hashed confirmation/decline tokens, expiry and responses |
| `access_grants` | Hashed one-time access tokens and expiry/revocation |
| `portal_sessions` | Hashed portal session credentials and expiry |
| `compute_sessions` | AWS instance/volume identifiers, Jupyter URL, state and timestamps |
| `artifacts` | Historical artifact metadata; current download flow checks S3 directly |
| `email_events` | Notification attempts, status, errors and delivery identifiers |
| `audit_logs` | Administrative events and attendance review/evidence |
| `portal_rate_limits` | Database-backed rate limit buckets |

Application submission, notification claim, reservation and token redemption rely on database functions/RPCs; inspect the migrations for exact transaction and authorization behavior. Application status is not a substitute for EC2 lifecycle phase: cloud reconciliation and portal database updates can happen at different times.

## Privacy and operations

Enable and inspect RLS and database function privileges. Keep the service-role key server-only; it bypasses normal RLS. Application details, token hashes, Jupyter URLs, reviews and audit records are sensitive. Use least privilege, protect backups and avoid copying production data into public logs or test fixtures. Deleting test data is destructive: establish ownership, dependencies and backups first. A database reset does not delete EC2, EBS or S3 resources.
