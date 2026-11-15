# AWS storage, scheduler, monitoring and lifecycle setup

This guide explains why each service is needed by DCS HPC, how it is configured and how to verify it. Setup involves chargeable resources; work in a separate environment and inspect changes before production.

## EBS: the student's disk

**In this project:** the GPU's encrypted gp3 root EBS volume contains `/home/ubuntu/workspace`. The app requests a minimum 75 GiB root volume and sets `DeleteOnTermination=false`. At expiry, the controller stops the GPU, detaches the volume and attaches it to an export worker in the **same Availability Zone**. The worker mounts it read-only. Only after successful export verification should cleanup delete the source volume. EBS is not S3: stopping/terminating compute alone does not prove the data was exported or that storage charges ended.

**Set up:** the volume is created by `RunInstances` in `src/lib/aws.js`; no permanent per-user volume has to be made manually. Verify the AMI root mapping is `/dev/sda1`, EBS encryption/KMS permissions, available volume quotas and allowed size, and the worker's access to the correct subnet/AZ. The controller needs tag-scoped detach, attach, delete and instance operations via the stack-managed role. In EC2 → Volumes, filter by `Project=dcs-hpc` and allocation tags to inspect size, attachment and state.

**Backup distinction:** an EBS snapshot can preserve a specific volume for recovery, but the project’s normal seven-day ZIP export is not a backup of Supabase PostgreSQL. For failed exports, preserve the volume and coordinate an encrypted snapshot/recovery; see [operations](operations.md). Verify snapshot ownership, retention, IAM and costs before relying on it.

## S3: artifacts and lifecycle code

**In this project:** a private artifact bucket stores `<allocation-id>/artifacts.zip`, `export-progress.json` and `artifacts.ready`. The worker streams the ZIP, checks its checksum and writes the marker. The web backend authorizes and signs downloads. A **separate** infrastructure bucket holds the Lambda ZIP. The observed artifact bucket is `<ARTIFACT_BUCKET>`.

**Set up the artifact bucket:**

1. S3 → **Create bucket**, select the deployment region and a globally unique name. Keep Block Public Access enabled and object ownership/encryption settings appropriate for the account. Record the name in `AWS_ARTIFACTS_BUCKET` and the CloudFormation `ArtifactBucket` parameter.
2. Bucket → **Management** → **Create lifecycle rule** covering the intended artifact objects. Configure current-object expiration after seven days and abort incomplete multipart uploads after one day, matching the observed deployment. If versioning is enabled, configure and verify noncurrent-version cleanup separately; current-object expiration does not automatically delete all historical versions.
3. Grant scoped object permissions to the worker and scoped reads/list to the web/controller roles. The lifecycle template supplies the worker and controller policy portions; the separately managed web role still needs its own permissions. Never make artifact files public.
4. Check an isolated export creates progress, ZIP and ready marker; check authorized download and retention. The portal cutoff is seven days after scheduled session end; S3 expiration counts from object creation and deletion is asynchronous.
5. Create or select a private **infrastructure** bucket for Lambda packages. Upload a versioned ZIP there; do not assume the artifact lifecycle applies to this bucket.

## CloudFormation: lifecycle infrastructure

**In this project:** `worker/lifecycle.yaml` is the source for the controller Lambda, its IAM role, worker role/profile and security group, DynamoDB lock table, EventBridge rule, Lambda invoke permission and CloudWatch alarm. It consumes existing VPC, SNS topic, buckets, worker AMI and uploaded ZIP. It does not set up Vercel, the GPU role, DNS, Supabase or Gmail.

**Set up:** package and upload the three Python files and create a reviewed change set using the command in [AWS overview](README.md#deploying-the-lifecycle-stack). In CloudFormation → stack → Parameters, set `ArtifactBucket`, `CodeBucket`, `CodeKey`, `VpcId`, `WorkerAmi`, `AdminAlertTopicArn`. Review replacements and IAM capability, execute the change set, wait for success, then record outputs and inspect the Events and Resources tabs. Use a unique ZIP object key on each code deployment. Note that stack parameters and resources contain environment-specific values.

## Lambda, EventBridge and DynamoDB: automatic scheduler

**In this project:** the periodic scheduler is an **EventBridge rule**, not a separate EventBridge Scheduler schedule per allocation. It invokes the controller Lambda once per minute. Lambda scans tagged GPU instances, looks at deadlines and lifecycle phases, and advances stop/detach/worker/export/cleanup. DynamoDB conditional locks reduce overlapping reconciliation. The GPU also has its own systemd expiry timer. The user does not need an admin to manually run the export.

**Set up and verify:** deploy the CloudFormation stack; in EventBridge → Rules confirm the generated rule is enabled, has `rate(1 minute)` and targets the stack's Lambda. In Lambda → Configuration verify handler `isolated_controller.handler`, role, environment and timeout; examine logs rather than manually changing stack-managed settings. In DynamoDB inspect the stack-created on-demand lock table and TTL configuration. Check EventBridge invocation permission on the Lambda. In a disposable allocation, observe tags and the rule-driven phase changes after expiry; do not assume one-minute scheduling means an exact one-minute export.

**Limits:** the controller Lambda has a 60-second invocation timeout; the worker performs the long-running ZIP, so Lambda is not expected to wait for the full export. The worker's own timeout and failure path are described in [lifecycle](lifecycle.md).

## SNS: lifecycle alerts

**In this project:** the controller publishes failure notifications to an SNS topic; operators need an actual confirmed subscription. The separate CloudWatch Lambda error alarm in the template does **not** define `AlarmActions`, so it is not automatically an email alert merely because it exists.

**Set up:** SNS → Topics → Create a standard topic → create an email subscription → open the confirmation email. Pass the topic ARN as `AdminAlertTopicArn` to CloudFormation. In SNS verify the subscription is **Confirmed**. If alarm-triggered email is required, configure and validate a separate CloudWatch alarm action through a reviewed infrastructure change; verify both lifecycle-message delivery and alarm delivery with controlled tests.

## CloudWatch: monitoring and logging

**In this project:** CloudWatch Agent on GPU publishes CPU, RAM, disk and supported GPU metrics; Nginx/Jupyter and portal access evidence feed `/dcs-hpc/jupyter-access`; the admin dashboard reads access logs while resource metrics are viewed in the AWS CloudWatch console. The controller uses Lambda log groups. These components enable operational troubleshooting, while missing telemetry remains **unknown**, not proof of zero usage.

**Set up:**

1. CloudWatch → Logs → Log groups → create/verify `/dcs-hpc/jupyter-access`; set a retention policy, observed at 30 days. Ensure the GPU instance role can create streams and publish events and the Vercel role can read evidence and write the portal stream. `monitoring-iam.json` supplies the monitoring portion of policies.
2. GPU user data installs/configures the CloudWatch Agent; verify its logs and a real `CWAgent` metric from an isolated GPU session in CloudWatch → Metrics. Confirm CPU and RAM as required by the project; GPU metrics depend on hardware/agent support.
3. Inspect `/aws/lambda/<controller-name>` for reconciliation logs and controller errors. Set/verify an appropriate retention policy for each relevant log group and an alarm/action route as needed.
4. Access `/admin` as an authorized admin to confirm recent access logs are attributable to the intended allocation; view resource metrics in CloudWatch. Redact IPs and personal identifiers when preparing public report evidence.

See [security and monitoring](../security-and-monitoring.md), [IAM](iam.md), and [operations](operations.md).
