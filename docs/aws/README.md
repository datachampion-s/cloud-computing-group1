# AWS infrastructure and setup

## Overview

AWS supplies an on-demand GPU host, its persistent root EBS volume, a short-lived CPU export worker, S3 artifacts, logs and automated lifecycle orchestration. The Vercel backend uses AWS SDK v3 through OIDC, while EC2 instances and Lambda use their own IAM roles. These are separate principals with different responsibilities.

## Observed production snapshot — 14 November 2026

| Resource | Observed configuration |
| --- | --- |
| Region | `us-east-1`; AMIs, quotas, EIPs, subnets and EC2 resources are regional |
| GPU base AMI | `<GPU_AMI_ID>`: AWS Deep Learning Base OSS NVIDIA Driver GPU AMI, Ubuntu 22.04; app bootstrap configures JupyterLab and Python 3.10 |
| GPU role/profile | `<GPU_INSTANCE_ROLE>`, attached through the configured EC2 instance profile |
| GPU security group | `<GPU_SECURITY_GROUP_ID>` in `<VPC_ID>`; public TCP 80 and 443. Jupyter itself is behind local Nginx, not directly exposed on 8889 |
| Lab address | Elastic IP and wildcard DNS for `*.lab.hpc.example.org`; inspect current allocation and DNS before changes |
| Artifact bucket | `<ARTIFACT_BUCKET>`; seven-day object expiration, incomplete multipart uploads aborted after one day |
| Lifecycle stack | `dcs-hpc-lifecycle`, CloudFormation status observed `UPDATE_COMPLETE` |
| Worker AMI / type | `<WORKER_AMI_ID>`, Amazon Linux 2023 / `t3.micro`, same availability zone as source volume |
| Lifecycle trigger | EventBridge scheduled rule, enabled, `rate(1 minute)`; Lambda Python 3.13, 60-second timeout and 256 MB |
| Lifecycle locks and alerts | DynamoDB on-demand locks; SNS topic `dcs-hpc-lifecycle-alerts`; CloudWatch alarm |
| Monitoring log group | `/dcs-hpc/jupyter-access`, 30-day retention; CloudWatch Agent publishes telemetry |
| Vercel production IAM role | `<VERCEL_PRODUCTION_ROLE>`, trusted by `oidc.vercel.com/<TEAM_SLUG>` for project `web-hpc` and production environment |

The stack also uses a separate infrastructure code bucket. Artifact retention does **not** apply to the infrastructure bucket. Exact policies, subscriptions, AMI versions and resources may change: inspect CloudFormation, IAM and account settings. `monitoring-iam.json` illustrates monitoring permissions but is not a complete export of the policies attached to live roles.

## Setup order for a new environment

1. **Account and region:** use an AWS account with billing enabled. Select one region consistently. Request an On-Demand GPU instance-family vCPU quota in that region; four vCPUs cover one `g4dn.xlarge`, subject to actual capacity and the relevant quota. Other families have separate quotas. Set budgets and billing alerts before testing.
2. **Networking:** select a VPC and subnet with internet access, working DNS and outbound connectivity to AWS, package repositories and Let's Encrypt. Create a GPU security group allowing public 443 and 80 for HTTPS and certificate validation. Do not expose Jupyter's local port publicly. Confirm network controls suit your threat model.
3. **Artifact bucket:** create a private S3 bucket in the target region, block public access, enable appropriate encryption and configure expiration at seven days plus abort-incomplete-multipart cleanup. The portal's download window and S3 lifecycle timing are related but not identical.
4. **Roles:** create a GPU EC2 role and instance profile with only required S3/CloudWatch access; create a Vercel production role with OIDC trust restricted to the intended team, project, audience and environment, and permissions needed for the app's EC2, S3 and monitoring calls. The lifecycle template creates separate Lambda and worker roles. Restrict `iam:PassRole` to the exact roles needed. Review actual SDK operations, template and IAM evaluation.
5. **DNS and IP:** allocate an Elastic IP in the same region and create a wildcard A record for the lab domain pointing at it. Give the EIP allocation ID, public IP and lab suffix to the application. Let TCP 80 reach the instance for HTTP-01 certificate issuance. A shared EIP means this design supports one live lab host at a time; scheduler buffers prevent overlapping allocations.
6. **AMI and quota:** select a tested Ubuntu GPU AMI with compatible NVIDIA driver; verify AMI architecture, Jupyter, Python, root device, instance compatibility and bootstrap assumptions. Select a compatible regional Amazon Linux 2023 worker AMI. AMI IDs are not portable between regions.
7. **Lifecycle infrastructure:** create an SNS topic and confirm an operator email subscription. Package the current worker source as expected by the CloudFormation template, upload it to a private infrastructure code bucket, then deploy `worker/lifecycle.yaml` with `ArtifactBucket`, `CodeBucket`, `CodeKey`, `VpcId`, `WorkerAmi`, and `AdminAlertTopicArn`. Confirm outputs, Lambda environment, scheduled EventBridge target, DynamoDB lock table and alarms. See [lifecycle](lifecycle.md) and inspect the template for permissions and defaults.
8. **Application integration:** configure AWS variables in Vercel; ensure Vercel OIDC provider and role trust use the actual team/project/environment and audience. Only then set `AWS_LIFECYCLE_ENABLED=true`, deploy and run a controlled, cost-bounded end-to-end test including expiry, export, download, cleanup and failure alerting.
9. **Operational readiness:** document owners, recovery procedures, budget alerts, quotas, logs and subscription verification; confirm cleanup and retention against real resources. Maintain independent backups of important configuration.

Do not substitute AWS account IDs, role names, OIDC issuer or audience with literal placeholder text in live policies. CloudFormation does not create external prerequisites such as Vercel, DNS records or Google credentials.

## Auth and security

The production trust observed in IAM restricts the subject to `owner:<TEAM_SLUG>:project:web-hpc:environment:production` and audience to `https://vercel.com/<TEAM_SLUG>`. These strings are team-specific. For another deployment, get the real issuer, audience and subject from Vercel, create the matching IAM OIDC provider and role trust, and validate with an actual deployment. Avoid using root credentials or permanent access keys in the application.

## Deploying the lifecycle stack

The Lambda ZIP must contain `isolated_controller.py`, `isolated_worker.py` and `export_workspace.py` at its root: the controller imports the worker helper, which embeds the exporter in instance user data. Prepare and upload the ZIP to the separate infrastructure bucket, then use a reviewed CloudFormation change. Example from the repository root in PowerShell; replace every placeholder with the actual account-specific value:

```powershell
Compress-Archive -Path worker/isolated_controller.py,worker/isolated_worker.py,worker/export_workspace.py -DestinationPath lifecycle.zip
aws s3 cp lifecycle.zip s3://<INFRA_CODE_BUCKET>/lifecycle/<VERSION>.zip --region us-east-1
aws cloudformation deploy --stack-name dcs-hpc-lifecycle --template-file worker/lifecycle.yaml --capabilities CAPABILITY_IAM --region us-east-1 --no-execute-changeset --parameter-overrides ArtifactBucket=<ARTIFACT_BUCKET> CodeBucket=<INFRA_CODE_BUCKET> CodeKey=lifecycle/<VERSION>.zip VpcId=<VPC_ID> WorkerAmi=<WORKER_AMI_ID> AdminAlertTopicArn=<SNS_TOPIC_ARN>
```

Inspect the resulting change set in CloudFormation, including replacements, before executing it through your approved deployment process. Then check outputs, EventBridge invocation, Lambda logs and SNS. The code bucket and SNS topic must already exist. Use a unique versioned key so CloudFormation recognizes each package change. The template's Lambda error alarm has no `AlarmActions` configured; lifecycle code publishes failure alerts to SNS separately. Add and verify alarm notification routing if alarm-based notification is required.

## Service-by-service build guides

- [IAM roles, permissions and Vercel OIDC](iam.md)
- [VPC, security groups, EC2, Elastic IP and DNS](networking-ec2.md)
- [EBS, S3, CloudFormation, Lambda, EventBridge, DynamoDB, SNS and CloudWatch](storage-lifecycle-setup.md)
- [Supabase database backup and recovery](../database/setup.md)
