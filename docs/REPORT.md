# Project report and demo guide

## Required deliverables

1. A technical project report covering architecture, deployment steps, configuration and evidence of operational management.
2. A video demonstrating the online and working application, at most **10 minutes** long.

Maulana compiles the report and coordinates the video. Aufaa and Taufik provide and verify their respective cloud sections and evidence. Galih is not assigned report or demo production. See [assignments](ASSIGNMENT.md).

## Report outline and source material

| Section | Owner | Materials |
| --- | --- | --- |
| Background, objectives, free-access model and users | Maulana | [Architecture](ARCHITECTURE.md), [workflows](WORKFLOWS.md), public application pages |
| System architecture, frontend/backend and integrations | Maulana | [Architecture](ARCHITECTURE.md), [workflows](WORKFLOWS.md); ask an authorized project operator to explain any implementation not present here |
| Cloud setup and firewall | Aufaa | [AWS setup](aws/README.md), redacted VPC, security-group and IAM configuration evidence |
| Backup and restore | Taufik | [Operations](OPERATIONS.md), actual backup settings and isolated restore evidence |
| CPU/RAM monitoring and logging | Taufik | [AWS setup](aws/README.md), redacted CloudWatch metrics, log group and retention evidence |
| Storage, lifecycle, testing and results | Taufik and Aufaa, compiled by Maulana | [Architecture](ARCHITECTURE.md), [workflows](WORKFLOWS.md), redacted session/export and operations evidence |
| Deployment, findings, limitations and conclusion | Maulana with evidence from cloud engineers | Deployment documentation and observed test outcomes |

The required operational jobs are **firewall, database backup, monitoring and logging**. Describe what each does in this project, setup, test results and dated evidence. Mark backup and restore as unverified until actually tested. Do not publish secrets, personal data, signed URLs, real IP addresses or internal resource identifiers.

## Demo: suggested maximum-10-minute sequence

- 0:00–1:00: problem, free access model and architecture.
- 1:00–3:00: landing page and application.
- 3:00–4:30: admin review and scheduling.
- 4:30–6:30: compute access and research-file export/download.
- 6:30–8:30: firewall, database backup, CPU/RAM metrics and logs.
- 8:30–10:00: results, limitations and conclusion.

Use an authorized test account and redacted data. Long GPU startup or export can use clearly labelled previously captured footage; say what was shown live. The time allocation is a suggestion; the total must not exceed 10 minutes.
