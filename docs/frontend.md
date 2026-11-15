# Frontend implementation guide

## Role in the project

The frontend guides applicants through proposal submission, schedule confirmation and a time-limited compute session; it also provides the admin review and monitoring interface. Server routes remain responsible for validation, authentication and access to secrets. Design and content are in English.

## Set up and run

1. Install Node.js compatible with the lockfile, run `npm install`, then create `.env.local` using the environment-variable guide.
2. Configure the development Supabase project and `APP_URL`; coordinate credentials and preview access with the backend owner. Keep real AWS lifecycle disabled for routine UI work.
3. Run `npm run dev` and open `http://localhost:3000/landing`. Use `/apply`, `/confirm`, `/compute` and `/admin` to inspect each flow; some states require valid records or non-production preview helpers.
4. Run `npm test` and `npm run build`. Verify desktop and mobile layouts, keyboard navigation, loading/errors and long text.

## Files and page responsibilities

| Page | Source and function |
| --- | --- |
| `/landing` | `src/app/landing/page.jsx`, `landing.css`: introduction, research guidance, FAQ and call to action |
| `/apply` | `src/app/apply/page.jsx`, `ApplicationForm.jsx`: identity, Drive links and availability |
| `/revise`, `/confirm` | `RevisionForm.jsx`, `ConfirmationCard.jsx`: token-based revision and explicit response |
| `/compute` | `PortalLogin.jsx`, `SessionClock.jsx`, `ExportProgress.jsx`: token, access window, launch and export state |
| `/admin` | `AdminApplicationsTable.jsx`, `AdminComputeMonitoring.jsx`: review list, standing, telemetry and export workers |
| `/admin/applications/[id]` | `AdminApplicationActions.jsx`, `AttendanceReviewForm.jsx`: decisions, scheduling and review |
| Shared | `Navbar.jsx`, `Footer.jsx`, `Brand.jsx`, `globals.css` and images under `public` |

## How to implement an interface change

1. Start from the real user/admin state in [workflows](workflows.md), then locate the page and components above. Review shared CSS before introducing new styles.
2. Keep the backend contract authoritative: display meaningful pending, success, expired and error states; never assume a browser countdown proves cloud cleanup or that progress is guaranteed to advance linearly.
3. Keep form labels, validation errors, focus states, keyboard interaction, contrast and responsive behavior usable. Avoid exposing tokens, personal data or implementation-only debug details.
4. Check applicable pages at desktop and mobile widths and run the relevant tests/build. Coordinate changed payloads or status values with the backend and cloud owners.

## Important states

A scheduled allocation does not necessarily mean the GPU is ready. Lab access ends at the deadline; export can still be scanning, archiving or verifying. Resource metrics are viewed in AWS CloudWatch; an unavailable metric is not zero usage, and IP/attendance flags are review signals, not proof of misconduct. Explain exclusions and the seven-day file access window consistently with [AWS lifecycle](aws/lifecycle.md).
