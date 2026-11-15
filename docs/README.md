# DCS HPC documentation

This documentation is for developers, administrators and infrastructure operators taking over the project. It explains the current implementation, external dependencies and operations. It is based on repository source and a read-only inspection of the AWS account on 14 November 2026. Resource IDs, versions and deployment state are a point-in-time snapshot.

## Suggested reading order

1. [Architecture](architecture.md): product boundaries, components and repository map.
2. [Workflows](workflows.md): applicant and admin journeys, session expiry and exports.
3. [Configuration](configuration.md): environment variables, Google, Supabase and Vercel.
4. [Database](database/README.md): tables, migrations and the initial-schema caveat.
5. [AWS setup](aws/README.md), [lifecycle](aws/lifecycle.md), and [operations](aws/operations.md).
6. [Security and monitoring](security-and-monitoring.md).
7. [Development](development.md).

## Handover notes

- The repository is application and infrastructure **source**, not a backup of AWS, Vercel, DNS, Google or Supabase. Preserve access to each service and its secrets separately.
- Checked-in Supabase migrations depend on an initial schema. We include the historical SQL for reference, but a new deployment must be validated against a real schema export. Never run the historical SQL over production.
- Resource settings can change independently of this repository. Confirm AWS state and deployment versions before operating the system.
- IAM roles, secrets, OAuth users, budgets, quotas, certificates and Drive sharing cannot all be recreated from application code alone.

## Role assignments and build guides

- [Team responsibilities and assigned reading](ASSIGNMENT.md)
- [Project report and demo preparation](project-report.md)
- [Backend implementation](backend.md) and [frontend implementation](frontend.md)
- [Google, Gmail, Vercel and domain setup](integrations.md)
- [Supabase setup and database backup](database/setup.md)
- [AWS IAM](aws/iam.md), [networking and EC2](aws/networking-ec2.md), and [storage, scheduler, monitoring and logging setup](aws/storage-lifecycle-setup.md)
