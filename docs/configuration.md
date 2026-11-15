# Configuration and deployment

Never publish actual secrets, tokens, signed URLs, applicant files or `.env` files. Values marked `NEXT_PUBLIC_` are bundled for browsers and must not contain secrets. Configure production variables in Vercel and redeploy after changing build-time variables.

## Environment variables

See the environment variable table below for variable names. Use `.env.local` locally and Vercel settings for the corresponding deployment environment.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Application origin, e.g. `http://localhost:3000` locally and `https://hpc.example.org` in production |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public project URL and anonymous key; the URL is the project root, not `/rest/v1` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged database access; also participates in deriving the Jupyter token. Rotating it requires care for active sessions |
| `ADMIN_EMAIL` | Exact allowlisted Google account for the admin UI |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Listed in the example; admin OAuth credentials are configured in the **Supabase Google provider**, not directly read by the app's Google redirect route |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` | Server-only OAuth client and account used by Gmail API |
| `APPLICATION_NOTIFICATION_EMAIL` | Recipient of new-application notifications |
| `NEXT_PUBLIC_PROPOSAL_TEMPLATE_URL` | Optional public Google Docs template link |
| `AWS_REGION`, `AWS_ARTIFACTS_BUCKET` | AWS region and private artifact bucket |
| `AWS_ROLE_ARN` | IAM role assumed by Vercel production via OIDC |
| `AWS_GPU_AMI_ID`, `AWS_GPU_SECURITY_GROUP`, `AWS_GPU_INSTANCE_PROFILE` | Regional GPU AMI, security group ID and EC2 instance profile **name** |
| `AWS_LAB_DOMAIN`, `AWS_LAB_EIP_ALLOCATION_ID`, `AWS_LAB_PUBLIC_IP` | Lab DNS suffix, Elastic IP allocation ID and public IP |
| `AWS_LIFECYCLE_ENABLED` | Enable real GPU launch only after the lifecycle controller is deployed and verified; example defaults to `false` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | Local application credentials; session token is needed for temporary credentials. Vercel production uses OIDC instead |
| `AWS_MONITORING_LOG_GROUP` | Optional log group override; implementation default is `/dcs-hpc/jupyter-access` |

## Google and Supabase

1. Create a Supabase project and record its project URL, anon key and server-only service-role key. Set up the database as explained in [database](database/README.md).
2. Create a Google OAuth **web application** client for admin login. In Google Cloud add the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback` to its authorized redirect URIs. In Supabase Authentication → Providers → Google enable Google and enter that client ID and secret.
3. In Supabase Authentication URL Configuration set the site URL for the environment and allow `http://localhost:3000/auth/callback` locally and `https://hpc.example.org/auth/callback` in production. Preview deployments also need permitted callbacks. Google OAuth consent/testing settings must permit the admin account.
4. Set `ADMIN_EMAIL` to the Google account allowed to administer the portal. Google authentication alone does not grant admin access to other users.
5. Separately enable Gmail API and configure a Gmail OAuth client, consent and refresh token for the sender and Gmail send scope. If using OAuth Playground, configure it to use that Gmail client's own credentials. Refresh-token availability depends on Google's consent and account policies. Do not share the token. Ensure Drive documents are accessible to reviewers without unnecessarily exposing sensitive files.

## Vercel deployment

1. Import/link the `web-hpc` repository as a Next.js project. Set production environment variables, enable Vercel OIDC and match AWS IAM trust to the team, project and environment.
2. Assign `hpc.example.org` to the production project and configure DNS according to Vercel settings. Separately configure wildcard lab DNS to the Elastic IP. Do not point the lab wildcard to Vercel.
3. Configure Supabase and Google redirects for the production host. Deploy, check the assigned production deployment and test login and application flows. A branch preview URL and a production domain can point to different deployments.
4. Verify AWS lifecycle, logging, alerts, quotas and cost controls before enabling GPU launches. Importing this repository does not provision the AWS stack.

The [AWS guide](aws/README.md) describes the observed infrastructure. Keep secrets in appropriate protected settings; they are intentionally absent from this repository.
