# Team responsibilities and reading assignments

This guide assigns initial ownership and reading priorities for the DCS HPC team. Everyone should first read the [documentation index](README.md), [architecture](architecture.md), [workflows](workflows.md), and [security and monitoring](security-and-monitoring.md). These are the project responsibilities and reading priorities. Coordinate production changes and review them together. Cloud engineers share AWS ownership rather than depending on a single person.

## Galih Kusuma Wijaya — Backend Developer and Team Lead

**Responsibilities:** Built the website and its application/backend workflows independently and leads technical decisions. Maintains the existing application and coordinates technical integration. Galih is not assigned to write, compile or prepare evidence for the project report or demo; the other members use the existing repository and documentation as their starting materials.

**Read and be able to explain:**

1. [Backend implementation guide](backend.md) — API, transaction boundaries and how to extend a workflow.
2. [Database guide](database/README.md) and [Supabase setup](database/setup.md) — schema, migrations, RLS and recovery prerequisites.
3. [Configuration and deployment](configuration.md) and [Google, Gmail and Vercel setup](integrations.md).
4. [AWS architecture](aws/README.md), [IAM guide](aws/iam.md), [lifecycle](aws/lifecycle.md) and [operations](aws/operations.md).
5. [Development and tests](development.md).

## Maulana Anandyta Narayana — Frontend Developer and Full-stack Report Lead

**Responsibilities:** Lead and compile the project report and coordinate the maximum-10-minute demo. Cover the application from both frontend and backend perspectives: describe the problem, user/admin flow, architecture, application implementation, deployment, integration, test results and limitations. Collect the cloud engineers’ verified evidence and sections, edit them into one coherent report and prepare the demo script. Maintain frontend UI where assigned; do not imply he originally built the whole application.

**Read and be able to explain:**

1. [Project report and demo guide](project-report.md) — full outline, materials, evidence matrix and video plan.
2. [Frontend implementation guide](frontend.md) — project structure, local setup, pages and components.
3. [Workflows](workflows.md) — states users and admins actually experience.
4. [Backend implementation guide](backend.md) — endpoint contracts and error/loading boundaries.
5. [Configuration](configuration.md), [integrations](integrations.md) and [development and tests](development.md).
6. [AWS lifecycle](aws/lifecycle.md) — distinguish session expiry, export in progress, failure and download readiness.

## Aufaa Zakki Maulidan — Cloud Engineer

**Responsibilities:** own the report sections and actual setup/verification evidence for AWS networking, IAM, VPC/subnets, GPU EC2, security groups/firewall, Elastic IP and DNS. Explain why each is used, document setup steps and deliver dated, redacted screenshots and findings to Maulana. Coordinate shared cloud operations and verify changes in an isolated environment before production.

**Read and be able to explain:**

1. [AWS overview](aws/README.md), [IAM](aws/iam.md), and [networking, EC2 and DNS](aws/networking-ec2.md).
2. [Storage and lifecycle setup](aws/storage-lifecycle-setup.md) and [lifecycle internals](aws/lifecycle.md).
3. [AWS operations](aws/operations.md), [security and monitoring](security-and-monitoring.md).
4. [Deployment and integrations](integrations.md), [configuration](configuration.md) and [backend](backend.md).

## Taufik Dwi Ferdiansyah — Cloud Engineer

**Responsibilities:** own report sections and actual setup/verification evidence for EBS, S3, worker/CloudFormation deployment, EventBridge/Lambda, CloudWatch/SNS, monitoring, logging, backup/restore and recovery. Verify or implement the database backup requirement and a safe isolated restore; do not present workspace ZIP export as database backup. Provide dated, redacted evidence and findings to Maulana, and coordinate networking and IAM with Aufaa.

**Read and be able to explain:**

1. [AWS overview](aws/README.md), [storage and lifecycle setup](aws/storage-lifecycle-setup.md), and [lifecycle internals](aws/lifecycle.md).
2. [AWS operations](aws/operations.md) and [security and monitoring](security-and-monitoring.md).
3. [IAM](aws/iam.md) and [networking, EC2 and DNS](aws/networking-ec2.md).
4. [Database setup](database/setup.md), [configuration](configuration.md), [backend](backend.md), and [development and tests](development.md).

## Shared handover checklist

- Explain the end-to-end application-to-export flow without relying on a single team member.
- Identify which credentials, consoles and resources are required, and where to request access; never send secrets in chat or commit them.
- Demonstrate local development and relevant tests; agree on a reviewer for every production change.
- Know how to inspect alerts, identify a failed export and preserve the source volume before recovery.
- Record any change in resource ownership, setup, role permissions, environment variables or operational steps in the corresponding guide.

## Report deliverables

- **Maulana:** write and assemble the report; coordinate the demo and final submission. Use [project-report.md](project-report.md) for the required sections, links and evidence matrix.
- **Aufaa:** implement/verify and document firewall, networking, IAM and EC2; provide redacted evidence and configuration explanations.
- **Taufik:** implement/verify and document database backup and restore, CPU/RAM monitoring, application logging and storage/lifecycle; provide redacted evidence and results.
- **Galih:** no report, evidence collection or demo-production assignment.
- **Submission:** complete technical project report and an online working-application demo video no longer than 10 minutes. Do not mark backup, restore or any other requirement complete without actual verification.
