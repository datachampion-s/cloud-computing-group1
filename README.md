# DCS HPC — Cloud Computing Group 1

This public repository documents the architecture and course deliverables for DCS HPC, a proposal-based platform that currently offers free, time-limited cloud GPU access for student research.

This repository contains a sanitized source snapshot and architecture documentation. Operational credentials, environment files and deployment-specific identifiers are not included. It is separate from the production repository and is not automatically synchronized. No live resource IDs, passwords, keys, access tokens, private links or student records are needed to understand the design.

## Read the documentation

- [System architecture](docs/architecture.md)
- [Applicant and administrator workflows](docs/workflows.md)
- [AWS services and setup](docs/aws/README.md)
- [Security, operations and recovery](docs/OPERATIONS.md)
- [Team responsibilities and assigned reading](docs/ASSIGNMENT.md)
- [Project report and demo guide](docs/REPORT.md)

The diagrams describe the system architecture; live settings must be verified by authorized operators. Operational tasks and course requirements are not automatically complete merely because they are documented.

## Source snapshot

- `src/` and `public/`: Next.js application and public assets.
- `worker/`: lifecycle controller, worker, exporter and infrastructure template.
- `tests/` and worker tests: application and lifecycle verification.
- `supabase/migrations/`: incremental database changes; these require an existing base schema and are not a complete database bootstrap.
- `package.json`, `package-lock.json`, and Next.js configuration: dependencies and build configuration.

The public snapshot deliberately uses placeholder support contact information and removes production-specific default email and application origins. Configure your own environment and external services privately before attempting to run it; no environment file is supplied. Runtime behavior and integrations should be verified in a separate test environment.
