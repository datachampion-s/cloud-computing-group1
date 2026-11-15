# Google, Gmail, Vercel and domain setup

## What each integration does

- **Supabase Google OAuth** signs the administrator in; authorization is additionally restricted by `ADMIN_EMAIL`.
- **Gmail API OAuth** sends application and scheduling messages from the configured sender. Its OAuth client and refresh token can be separate from the admin sign-in client.
- **Google Drive/Docs** hosts applicant documents and the proposal template. The app stores links; it does not upload documents to Drive or automatically fix sharing permissions.
- **Vercel** hosts the Next.js web frontend and backend routes. Its OIDC identity assumes an AWS role for production cloud operations. Jupyter and the worker run on AWS, not Vercel.

## Admin Google login and Supabase

1. In Google Cloud Console select/create the project used for admin sign-in. Configure the OAuth consent screen and audience; if in testing, add the intended admin as a test user where required.
2. Create an OAuth client of type **Web application**. In authorized redirect URIs add the exact Supabase callback shown in Supabase Authentication → Providers → Google, typically `https://<project-ref>.supabase.co/auth/v1/callback`. The Google client ID is the full `...apps.googleusercontent.com` value, not the client display name.
3. In Supabase Authentication → Providers → Google enable the provider and enter this client ID and secret. Leave optional security settings at their intended defaults unless the integration requires a documented change.
4. In Supabase Authentication → URL Configuration set the production site URL and add `https://hpc.example.org/auth/callback` and, for local development, `http://localhost:3000/auth/callback`. A preview environment needs its own allowed callback. Google redirects first to Supabase; Supabase then redirects to the app.
5. Set `ADMIN_EMAIL` to the authorized Google account in the relevant app environment. Redeploy if necessary and test both authorized and unauthorized accounts. Never publish the OAuth secret. See [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls).

## Gmail sender setup

1. In the relevant Google Cloud project enable Gmail API and configure the OAuth consent screen. Create a web OAuth client for the sender. Record its ID and secret in secure storage; it may be a different client from admin login.
2. If using [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/), add `https://developers.google.com/oauthplayground` to that client's authorized redirect URIs. In Playground settings select **Use your own OAuth credentials** and enter the Gmail client ID and secret. Authorize the sender account with scope `https://www.googleapis.com/auth/gmail.send`, then exchange the authorization code for tokens.
3. Store the refresh token, client ID, secret and sender privately as `GMAIL_REFRESH_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_SENDER`; configure `APPLICATION_NOTIFICATION_EMAIL` for the admin notification destination. Do not paste tokens into screenshots, docs, issue trackers or chat.
4. If the consent screen is in testing, ensure the sender is an authorized test user and check Google's current refresh-token expiration rules; plan for reauthorization. Test through an isolated application and inspect `email_events` and server logs if delivery fails. Do not claim email is delivered solely because a database write succeeded.

## Drive links and proposal template

Put the Google Docs template URL in `NEXT_PUBLIC_PROPOSAL_TEMPLATE_URL`; ensure intended applicants can view or download it. Applicants submit HTTPS links to their student ID and proposal. They must grant reviewers access; the application does not verify Drive sharing. Keep sensitive student documents restricted to appropriate reviewers.

## Vercel and DNS

1. Import the Git repository into the `web-hpc` project. Configure the environment variables listed in [configuration](configuration.md), with secrets in Vercel environment settings and the correct production `APP_URL`.
2. Enable/configure Vercel OIDC for production and the corresponding IAM provider and role; use [IAM setup](aws/iam.md). Set `AWS_ROLE_ARN` and redeploy. Do not put long-lived AWS keys in Vercel production.
3. Project → Settings → Domains: add `hpc.example.org`; add the DNS records Vercel currently specifies at the authoritative DNS provider. Verify domain status and live resolution. The Vercel CNAME target can change; use the value shown for the actual project.
4. Separately configure wildcard `*.lab.hpc.example.org` to the EC2 Elastic IP as in [networking setup](aws/networking-ec2.md). Confirm both the public website and a controlled lab session over HTTPS.
5. Set the relevant Supabase redirect URLs, verify production domain points to the intended deployment, and test application, admin login and email using non-sensitive data.
