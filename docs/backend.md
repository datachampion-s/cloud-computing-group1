# Backend implementation guide

## What the backend does in this project

The Next.js App Router handles application submission, review, scheduling, token redemption and compute integration. Browser components call route handlers under `src/app/api`; server-side modules validate input, call Supabase RPCs and send email or invoke AWS. Supabase stores workflow records; Vercel does not run the long-lived lab process.

## Set up a working backend

1. Clone the repository, install the Node version compatible with the lockfile and run `npm install`.
2. Create `.env.local` using the environment-variable guide. Configure a separate development Supabase project, admin email, Gmail sender and `APP_URL=http://localhost:3000`; see [integrations](integrations.md) and [database setup](database/setup.md). Never expose the service-role key or Gmail tokens to the browser.
3. Keep `AWS_LIFECYCLE_ENABLED=false` unless a dedicated AWS test environment, quotas, budgets, lifecycle and permissions are ready. Local AWS integration reads explicit `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` and, for temporary credentials, `AWS_SESSION_TOKEN`; ordinary AWS CLI profiles are not automatically read by `credentialsFor`.
4. Run `npm run dev`; visit `/landing` and `/admin`. Run `npm test`, the Python worker tests and `npm run build` before proposing changes. See [development](development.md).

## Request and data flow

| Flow | Entry point | Main work |
| --- | --- | --- |
| Application | `POST /api/applications` | Validate form; `portal_submit_application` inserts application and email event atomically; asynchronous delivery claims the event. |
| Admin login | `/api/auth/google`, `/auth/callback` | Redirect through Supabase Google OAuth; server restricts admin actions by `ADMIN_EMAIL`. |
| Review/schedule | `/api/admin/applications/[id]` | Authenticated review, propose, finalize and attendance actions; database RPC prevents booking conflicts. |
| Schedule response | `/api/confirm` | Check confirmation or decline token and persist an explicit response via `portal_respond`. |
| Portal token | `POST /api/portal/redeem` | Hash token, atomically redeem via `portal_redeem`, issue a protected cookie. |
| Compute | `/api/portal/compute/session` | Check authorization and time, launch or poll EC2, associate lab EIP, and read export progress. |
| Download | `/api/portal/download` | Verify portal access, artifact readiness and retention; issue short-lived S3 signed access. |
| Monitoring | `/api/admin/monitoring` | Admin-only EC2 status, CloudWatch log evidence and worker view; resource metrics are viewed in AWS CloudWatch. |

`src/lib/server.js` centralizes privileged Supabase access, auth and limits; `validation.mjs` handles validation and standing; `aws.js` handles instance bootstrap/AWS calls; `monitoring.js` reads and records access logs; `mail.js` uses Gmail and templates. Never move server-only secrets into client components.

## How to change a workflow

1. Identify the page, API route, database function, email template and audit behavior involved. Read current code and migration definitions first.
2. Define valid states and authorization for every transition; validate inputs and fail safely on the server. Prefer transactional database RPCs where concurrent updates must be atomic.
3. Add a reviewed incremental migration if needed; validate it in a disposable database, including RLS, permissions, conflicts and retries. Do not edit historical migrations already applied in production.
4. Update the API and UI contract, preserve privacy in logs, and update transactional email and documentation when needed.
5. Run relevant tests, test the success and failure paths in staging, and coordinate deployment order with the cloud engineer. Inspect `email_events`, application logs and audit records if requests fail.

## Email and delivery

Gmail sender OAuth is separate from admin Google OAuth. New-application persistence and notification tracking are atomic, but mail is sent after the response and can fail independently. Inspect `email_events` and application logs. The code defines an artifacts-ready template but does not currently call it after export; do not document it as an active notification until it is wired and tested. See [integrations](integrations.md).
