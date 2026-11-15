# Applicant and admin workflows

## Applicant: application to compute

1. Visit `/landing` to read about access, preparation, Python 3.10 and usage guidance; `/` redirects there. Apply at `/apply`.
2. Provide name, student ID/NIM, study program, email and project details, Google Drive links to the student ID and proposal, and one to three preferred availability windows. Supported programs are Statistics and Data Science, Applied Statistical Computation, Mathematics, Mathematics Education and Other. Share Drive files so the reviewer can access them. The proposal template points to an externally configured Google Docs link.
3. Submission records the application and notification event transactionally. A background email notifies the admin. The interface states review may take up to three business days; this is a service expectation, not an automated deadline.
4. If requested, follow the revision link, update the proposal and submit it again. If rejected, the applicant receives a decision email.
5. For a proposed slot, use the emailed link to confirm or decline; declining allows alternative availability. Opening the link alone does not confirm the slot.
6. After the admin finalizes an accepted schedule, receive an access token and redeem it on `/compute`. An opaque HTTP-only cookie represents the authenticated portal session. Launch is allowed up to 15 minutes before the scheduled start.
7. Start the instance from the portal and wait for JupyterLab setup. Open the HTTPS lab link. Session end is enforced independently of the browser; the user is redirected to the portal at the deadline while export can continue after access ends.
8. **My research files** displays export state and progress when available. After verification, download the ZIP for up to seven days after the allocation's scheduled end. Keep your own copy; S3 cleanup is asynchronous.

## Admin: review and scheduling

1. Go directly to `/admin` (intentionally absent from public navigation). Sign in with Google using the exact `ADMIN_EMAIL`. Supabase Google provider and redirect URLs must be configured.
2. Review the application and Drive documents. Request revision, reject, or approve for scheduling. Email delivery problems must be checked separately from the database action.
3. Propose a GPU and schedule, accounting for Jakarta time and applicant preferences. The database prevents conflicting reservations with a 20-minute preparation buffer and a 30-minute post-session buffer. A confirmation request is emailed.
4. Once confirmed, finalize the allocation. This creates the access grant and sends the invitation token. The applicant launches the instance; finalizing alone does not create a running instance.
5. Monitor running sessions, IP evidence and export workers in the portal; view GPU/CPU/RAM/disk metrics in AWS CloudWatch. Review flags in context rather than treating an IP change or missing log as proof of abuse. Admins can record an attendance review and export the applications table as CSV.
6. If export fails, follow the [AWS recovery runbook](aws/operations.md). Do not delete the original volume before verifying a usable archive.

## Mail and reliability

Gmail OAuth credentials are separate from the Google OAuth client for admin sign-in in Supabase. The app sends new-application, revision, decision, availability, confirmation and invitation notifications. New-application delivery is claimed and attempted asynchronously; failure does not undo the application and there is no general scheduled email retry worker in this repository. Review `email_events` and logs. An `artifacts_ready` email template exists, but an automatic call after export is not wired in the inspected implementation; users should check the portal for files.

## Workspace behavior

Jupyter starts in `/home/ubuntu/workspace`. Eligible files throughout that workspace are exported automatically; it is not limited to `notebooks` and `outputs`. Directories named `data`, `dataset` or `datasets`, caches, virtual environments and certain generated files are excluded. Store valuable results outside excluded directories. Full patterns and failure behavior are in [AWS lifecycle](aws/lifecycle.md).

## Key operational details

- Application validation checks Drive/Docs HTTPS links and future preferred time windows; share permissions are not checked by the portal itself.
- Access-grant redemption and booking conflict checks use database functions, making concurrent requests safer than a client-side-only check. Access tokens are normalized before hashing; issued tokens and invitation URLs must be handled as secrets.
- Application and schedule emails are driven by server-side workflow actions. Check `email_events` and application logs when the recipient does not receive one; SMTP/Gmail delivery is not the same as successful application persistence.
- The compute portal session is short-lived, while research files have their own retention window. Follow the actual portal access and download rules rather than assuming the invitation token is a permanent login.
