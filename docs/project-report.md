# Project report and demo preparation

The course slide requires (1) a project report containing technical architecture, deployment steps, configuration and evidence of cloud operations and (2) a video demo of the online, working application, **maximum 10 minutes**. This guide is an evidence and writing plan, not a claim that every requirement has already been completed.

## Responsibility and evidence handoff

Maulana is responsible for compiling and writing the report as full-stack contributor and coordinating the demo. Aufaa prepares the AWS networking, IAM, EC2 and firewall sections and redacted evidence. Taufik prepares EBS/S3/lifecycle, backup, monitoring and logging sections and redacted evidence. Both cloud engineers must carry out or verify their assigned operational work, not merely write about it. Galih already built the web application and is **not assigned report writing, compilation, evidence collection or presentation production**. The team should use the repository, documentation and authorized console access as source material.

| Report section | Lead | Materials and evidence |
| --- | --- | --- |
| Background, problem, goals, users and free-access model | Maulana | [README](../README.md), [workflows](workflows.md), `/landing` and `/apply` |
| Architecture, full-stack implementation and integration | Maulana | [architecture](architecture.md), [backend](backend.md), [frontend](frontend.md), [integrations](integrations.md); source files and redacted UI screenshots |
| Deployment and configuration | Maulana, with cloud details from both engineers | [configuration](configuration.md), [database setup](database/setup.md), [AWS setup](aws/README.md); redacted Vercel and Supabase screenshots |
| Firewall/security groups and EC2 networking | Aufaa | [networking](aws/networking-ec2.md), [IAM](aws/iam.md); actual EC2 security group inbound/outbound rules, VPC and lab DNS |
| Database backup and restore | Taufik | [database backup instructions](database/setup.md#database-backup--required-operational-work); actual backup configuration and an isolated restore test |
| Monitoring and logging | Taufik | [monitoring setup](aws/storage-lifecycle-setup.md#cloudwatch-monitoring-and-logging), [security](security-and-monitoring.md); actual CloudWatch CPU/RAM, log group/retention and dashboard evidence |
| Lifecycle, EBS, S3 and operational results | Taufik, with Aufaa | [storage/lifecycle setup](aws/storage-lifecycle-setup.md), [lifecycle](aws/lifecycle.md), [operations](aws/operations.md); redacted CloudFormation, EventBridge, S3 and expiry/export evidence |
| Testing, conclusion, limitations and future work | Maulana, using evidence from both engineers | Test results, working public site, screenshots, observed failures and fixes. Distinguish implemented, tested and pending work. |

## Four required operational jobs

| Requirement | DCS HPC application | Verification needed |
| --- | --- | --- |
| Firewall | GPU security group allows HTTPS 443 and certificate-validation HTTP 80; worker has separate group. | Aufaa verifies actual rules, VPC and exposure; capture redacted console evidence. |
| Database backup | Supabase PostgreSQL stores application and allocation data. Workspace ZIP is a different artifact. | Taufik verifies a supported managed backup or secure dump, retention and an isolated restore; current status is **unverified**, not complete. |
| Monitoring | CloudWatch Agent provides CPU/RAM and other available metrics in the AWS console; the admin dashboard shows session and access records. | Taufik demonstrates real CPU and RAM values from a controlled session and notes metric delays/gaps. |
| Logging | CloudWatch stores controller and application/access evidence; Vercel stores deployment/function logs as configured. | Taufik verifies real logs, retention and troubleshooting use; redact user and access details. |

## Suggested report structure

1. Title, team and roles; background, objectives and scope.
2. System requirements and user/admin workflows.
3. Architecture diagram and explanation of each service and integration.
4. Deployment: Vercel, Supabase, Google OAuth/Gmail, AWS setup, DNS and environment variable **names**.
5. Operational configuration: firewall, database backup/restore, monitoring and logging, with dated, redacted evidence and outcomes.
6. End-to-end test cases and results: application, admin review, scheduling, lab access, deadline, export/download and failure handling.
7. Costs, security/privacy, limitations, conclusions and future improvements; cite sources and record actual test dates.

Do not publish secrets, tokens, signed URLs, real applicant records, personal IP addresses or raw private configuration. Use fictitious/redacted data. An architecture diagram or screenshot shows configuration; explain what it proves and the date it was verified. Do not claim a restore succeeded unless it was actually tested.

## Demo video — maximum 10 minutes

Maulana coordinates the script and recording; Aufaa and Taufik provide their cloud portions. Suggested timing: 0:00–1:00 problem and architecture; 1:00–3:00 landing and application; 3:00–4:30 admin review and scheduling; 4:30–6:30 compute access and result/export; 6:30–8:30 firewall, backup, CPU/RAM monitoring and logs; 8:30–10:00 results and limitations. Timing is a guide, not a course-imposed breakdown. Use an authorized test session and redact personal information and credentials. GPU launch/export can take longer than the recording; use clearly labelled previously captured footage where necessary and make clear which steps were shown live.
