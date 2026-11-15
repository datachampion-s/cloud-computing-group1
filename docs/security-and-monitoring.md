# Security, monitoring and attendance

## Trust boundaries

Applicants use single-use access grants and a portal session; admins use Google authentication through Supabase plus an `ADMIN_EMAIL` allowlist. Grants and portal tokens are hashed in the database. Cookies are HTTP-only and configured for production HTTPS. Public endpoints use database-backed rate limits. Confirm actual RLS and function privileges in each Supabase environment.

The portal creates a per-allocation Jupyter token using server-side secret material. Session URLs and application records can contain sensitive access information; restrict database, log and admin access and avoid sharing URLs. TLS protects the lab session in transit and helps prevent interception or tampering. The lab is not hosted inside Vercel.

Vercel assumes a restricted AWS role via OIDC; the GPU instance, export worker and controller have separate roles. Source EBS and worker root storage are encrypted. Worker source mounting is read-only. Keep secrets out of Git and use narrowly scoped, auditable credentials. Validate retention and backup policy with the organization.

## Dashboard observability

The admin dashboard queries EC2 and CloudWatch Logs for active/recent sessions, access records and export workers. CloudWatch Agent sends CPU, RAM, disk and GPU-related metrics when supported and installed; view these in the AWS CloudWatch console. The portal no longer requests resource metrics with GetMetricData. Metrics can be delayed, unavailable or unsupported; distinguish **no data** from zero utilization. The API limits how many allocations/sessions it inspects, so it is an operational view rather than a complete inventory.

Nginx/Jupyter access evidence and portal access records are written to `/dcs-hpc/jupyter-access` with the inspected 30-day retention. The dashboard can show client IPs and suggest review for multiple IPs in a short interval. These are investigative signals, not identity verification: mobile networks, VPNs, proxies, NAT and shared networks change the relationship between a person and an IP. Restrict access to this personal data and tell users how it is handled under organizational privacy policy.

## Attendance and review

Participant standing derives from historical attendance/access evidence and admin review in the audit log. Manual review is recorded separately and can resolve a flag; a flag does not automatically prove misuse. Collection depends on available CloudWatch evidence and dashboard processing of recent records. Logs expire, services can fail and not all dashboard history is necessarily revisited, so absence of a log entry must not be treated as conclusive proof a user was unattended. Check timestamps and evidence before deciding.

## Alerts and audit

Lifecycle failures are reported to the configured SNS topic and CloudWatch alarm. Confirm the subscription, alert routing and actual delivery. Lambda retries or partial failures can produce duplicate notifications. Review Lambda logs, S3 artifacts and EC2/EBS state together. Protect and periodically review admin access, service role policies, OAuth credentials and cloud spending. See [operations](aws/operations.md).
