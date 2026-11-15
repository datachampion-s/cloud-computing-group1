# AWS operations and troubleshooting

Use read-only inspection first. Select the correct AWS account and `us-east-1` region; never paste access keys, tokens or signed URLs into tickets. The examples below require locally configured AWS CLI credentials and are non-mutating.

```sh
aws sts get-caller-identity
aws cloudformation describe-stacks --stack-name dcs-hpc-lifecycle --region us-east-1
aws ec2 describe-instances --region us-east-1 --filters Name=tag:Project,Values=dcs-hpc,dcs-hpc-export
aws events list-rules --region us-east-1
aws logs describe-log-groups --log-group-name-prefix /dcs-hpc --region us-east-1
aws s3api get-bucket-lifecycle-configuration --bucket <ARTIFACT_BUCKET> --region us-east-1
```

CloudFormation outputs identify the current controller and worker roles; generated suffixes can change after replacement. Inspect logs through CloudWatch or `aws logs tail <actual-log-group> --since 1h --region us-east-1`. Search by allocation/instance ID without exposing user information. Inspect SNS subscription status and CloudWatch alarm state; publishing to SNS does not prove delivery.

## Common issues

**Application cannot launch EC2.** Verify `AWS_LIFECYCLE_ENABLED`, OIDC trust and role permissions, region, AMI, instance profile, security group, subnet access, vCPU quota, capacity and CloudWatch/Vercel errors. Check whether EC2 already created an instance before retrying.

**EC2 runs but Jupyter is unavailable.** Check instance status, system/cloud-init logs, EIP association, wildcard DNS, security group ports 80/443, Let's Encrypt issuance and Nginx/Jupyter readiness. Confirm the time window and portal authorization. A web-domain DNS record does not automatically configure the lab wildcard. Certificate issuance depends on external CA policies and rate limits.

**Session expired but instance still runs.** Allow for the scheduled reconciliation interval, then inspect EventBridge target, Lambda logs/errors/permissions and instance lifecycle tags and deadline. Browser redirect does not prove backend stop completed. Investigate timers and cloud automation before intervening.

**GPU stopped but files are not ready.** This can be normal during detach, worker startup, ZIP upload and verification. Inspect `DCSPhase`, worker instances, source EBS attachment, worker/cloud-init logs and `export-progress.json`; use S3 metadata, not a public URL. A worker may fail to launch because of capacity, permission, subnet, AMI or AZ issues. Export can take time and ETA can increase.

**Export failed or source EBS remains.** Record the allocation ID, instance/volume/worker identifiers, tags, logs and exact errors. Ensure no worker is actively writing and preserve the source volume; check whether a verified archive already exists. An experienced operator can recover files from a snapshot or read-only mount on an isolated host in the same AZ, then verify contents before deletion. Snapshot, transfer, retention and investigation can cost money. Do not blindly rerun cleanup or delete a volume because the portal shows an error.

**Archive is missing files.** Compare paths against [lifecycle exclusions](lifecycle.md), workspace root and session timing. Data folders, datasets, caches and virtual environments are deliberately excluded. A running export is not a verified archive.

**CloudWatch metrics or admin IP evidence absent.** Check the instance profile, CloudWatch Agent, log group and retention, Vercel role CloudWatch/log/EC2 permissions, time range, deployment environment and dashboard refresh. Missing evidence does not demonstrate absence or abuse.

**Unexpected recurring costs.** Inspect running/stopped instances, retained EBS volumes, snapshots, EIPs, S3 objects and incomplete uploads, CloudWatch, SNS and networking resources. Confirm ownership and preservation requirements before deleting anything. S3 retention and volume cleanup are different mechanisms.

## Change management

Back up configuration and inspect CloudFormation changesets before stack updates. Test worker changes and application compatibility together in an isolated environment, then deploy the Lambda package/template and web application in a controlled order. Do not execute `worker/live_isolated_smoke.py` against production as a routine check: it provisions real resources and its assumptions may be stale. See [development](../development.md).
