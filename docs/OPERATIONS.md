# Security, operations and recovery

## Four operational requirements

| Requirement | Project approach | Evidence or follow-up |
| --- | --- | --- |
| Firewall | GPU security group allows HTTPS and certificate-validation traffic; Jupyter binds locally behind a reverse proxy. A separate group applies to the export worker. | Authorized cloud engineer verifies actual rules and records redacted evidence. |
| Database backup | PostgreSQL is hosted in Supabase, separate from EC2 and S3 workspace files. | Verify backup method, protected storage, retention and a restore to a disposable project. Status is unverified until tested. |
| Monitoring | CloudWatch Agent collects CPU, RAM and supported GPU metrics; operators inspect the AWS console. | Record redacted CPU/RAM evidence from a controlled session. |
| Logging | CloudWatch receives lifecycle and access logs; application hosting also supplies runtime logs. | Verify retention and troubleshooting use; remove personal data from evidence. |

## Recovery principles

At session expiry the GPU stops and its encrypted source volume is passed to a temporary worker. The worker creates an archive and verifies its digest before cleanup. Failure must preserve the source volume for an operator. Before recovery, identify the affected allocation and disk, review logs and ensure no active process is using the disk; use a controlled read-only recovery or snapshot process. Never delete the source solely because the portal reports an error.

SNS can notify operators of lifecycle failures. A separate monitoring alarm requires an actual configured notification action; confirm alert subscription and delivery. CloudWatch logs, custom metrics and IP addresses have cost and privacy implications. Limit access and avoid publishing identifying details.

## Data and access

Keep source repositories, cloud credentials, private resource IDs, student records, signed URLs and database backups out of this public repository. A verified backup must cover the database and its relevant configuration; a research-file archive does not substitute for it.
