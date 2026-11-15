# AWS architecture and setup

This guide explains each AWS component in the project and the general order for building an isolated environment. Production identifiers and credentials are intentionally omitted. Use current AWS and Vercel documentation when applying changes; creating resources can incur cost.

## Services used

| Service or feature | Purpose in DCS HPC |
| --- | --- |
| EC2 | Runs the GPU/Jupyter session and a temporary CPU export worker. |
| EBS | Encrypted disk holding the workspace; retained until export succeeds. |
| S3 | Private archive storage and a separate location for deployment packages. |
| IAM, STS and OIDC | Different roles for Vercel, GPU, Lambda and worker; Vercel assumes its role using short-lived credentials. |
| VPC, subnet and security groups | Network boundary and firewall rules for compute. |
| Elastic IP and DNS | Stable public lab address and per-session hostname. |
| EventBridge scheduled rule | Invokes the controller periodically; it is not an individual Scheduler schedule per user. |
| Lambda | Reconciles instance shutdown, disk handoff, export and cleanup. |
| DynamoDB | Conditional lock prevents simultaneous controller operations on the same instance. |
| CloudWatch | Agent metrics, instance access logs, controller logs and alarms. |
| SNS | Notifies operators of lifecycle failures when a subscription is confirmed. |
| CloudFormation | Creates and updates the lifecycle resources as a stack. |
| Service Quotas | Controls how many GPU-family vCPUs can be launched. |

## 1. Account, networking and quota

Select one AWS region and use it consistently for instances, AMIs, VPC, EIP and lifecycle resources. Verify GPU-family On-Demand vCPU quota and available capacity. Create or select a VPC and subnet with outbound internet/AWS service access. The worker must use the same Availability Zone as the EBS volume.

Create a GPU security group in the correct VPC: public HTTPS permits Jupyter access through the proxy, and HTTP permits certificate validation. Jupyter's own port is bound locally and should not be exposed publicly. Allocate a public IP and point the wildcard lab DNS name to it. The portal website has its own hosting and DNS configuration.

## 2. IAM and identity

A trust policy says which principal may assume a role; a permissions policy says which actions it may perform. Create an OIDC identity provider and a Vercel web role with trust restricted to the actual organization, project and production environment. Create an EC2 role and instance profile for the GPU's necessary logging/monitoring. The lifecycle CloudFormation stack creates distinct roles for Lambda and the worker. Scope permissions and `iam:PassRole` to the required resources; the web and GPU roles need reviewed policies beyond monitoring snippets. Never place credentials into this repository.

## 3. Storage and EC2 image

Create a private S3 artifact bucket with access blocked to the public, suitable encryption, object-expiration rules and cleanup of incomplete multipart uploads. Use a separate private bucket for lifecycle deployment packages. Select a compatible GPU base AMI in the chosen region; verify NVIDIA drivers, Python, root device mapping and bootstrap compatibility. Select a compatible CPU worker AMI in the same region. GPU bootstrapping installs/configures JupyterLab, Nginx, certificate issuance, a deadline timer and CloudWatch Agent.

## 4. Lifecycle and alerts

Create an SNS topic and confirm an operator subscription. Package the controller, worker bootstrap and exporter together and upload the versioned package to the infrastructure bucket. Deploy the lifecycle CloudFormation template with the artifact bucket, code package, VPC, worker AMI and SNS topic. Inspect the created Lambda, execution roles, worker profile, DynamoDB lock table, scheduled EventBridge rule and alarm. A CloudWatch alarm requires a configured alarm action if it should send notifications; the controller's separate SNS publish handles lifecycle failures.

At the scheduled deadline, the controller stops the GPU, moves the EBS source to the worker in the same Availability Zone, waits for a verified S3 archive and then cleans up. A failure retains the source disk. Confirm this behavior with an authorized, cost-bounded isolated test.

## 5. Monitoring and logging

CloudWatch Agent publishes supported CPU, RAM, disk and GPU metrics; inspect them in AWS CloudWatch rather than querying them from the application dashboard. Access and lifecycle logs are separate and support attendance review and troubleshooting. Set appropriate retention and role permissions, verify alert delivery and protect personal data. Both metrics and logs can incur charges.

## 6. Verify operational readiness

Check session launch, HTTPS, deadline enforcement, workspace archive, download, cleanup, log and alert delivery. Set billing alerts and inspect retained EBS, IP and S3 resources. Back up the separate Supabase database and verify restoration in a disposable environment; the workspace ZIP does not back it up.

References: [AWS EC2 security groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html), [Vercel OIDC for AWS](https://vercel.com/docs/oidc/aws), [AWS CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), and [Supabase backups](https://supabase.com/docs/guides/platform/backups).
