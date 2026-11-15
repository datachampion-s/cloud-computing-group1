# EC2 session, export and cleanup

## Launch and access

When an eligible applicant launches from `/compute`, the backend calls EC2 with the selected instance type, base AMI, GPU instance profile and security group. Supported choices include `g4dn.xlarge` (T4), `g5.xlarge` (A10G), `g6.xlarge` (L4) and small CPU options intended for testing. Availability and quotas depend on region and account. Launch uses an allocation-specific EC2 client token to reduce duplicate creation. EC2 metadata requires IMDSv2 and root EBS is encrypted; the source volume is configured to survive instance termination until safe cleanup.

Bootstrap configures JupyterLab with `/home/ubuntu/workspace` as its root, Python 3.10, 15-second autosave, Nginx and a certificate for `<allocation-id>.<AWS_LAB_DOMAIN>`. Jupyter listens locally behind HTTPS. The EIP is attached after EC2 starts and portal polling verifies readiness. A browser countdown redirects the user at expiry, while an independent instance timer and scheduled controller enforce the deadline even if the browser closes. Browser timing alone is not a shutdown guarantee.

## State machine

The EventBridge-triggered Lambda reconciles tagged instances about once a minute, with a DynamoDB lock to reduce concurrent controller races. Typical tag phases are:

`gpu → stopping → detaching → worker-launch → attaching → exporting → verified → cleanup`

The worker may finish quickly enough for the controller to discover the ready marker while still in `attaching`. On errors or timeouts, phase `export-failed` records a reason and alerts the operator. State lives primarily in EC2 tags such as `Project`, `AllocationId`, `DCSPhase` and `DCSEndEpoch`. Inspect tags, CloudWatch logs and S3 together; web database state can lag reconciliation.

1. At the deadline the GPU instance is stopped. Stopping first reduces GPU runtime while keeping the EBS volume intact; the stopped instance can still incur EBS and other charges.
2. The original EBS root volume is detached and attached to an isolated `t3.micro` export worker in the same availability zone. The worker has its own encrypted, temporary root disk and limited IAM role.
3. The source volume is mounted read-only. The exporter streams a ZIP to private S3 and updates progress metadata. It then downloads the uploaded object to check SHA-256, writes a ready marker, and exits.
4. The controller verifies the ready marker and archive metadata before terminating the worker and GPU instance and cleaning up the source volume. On failure the source volume is retained for investigation/recovery; never assume it was deleted.

Phase timeouts and retries are safeguards, not delivery guarantees. The exporter has a four-hour timeout and some phases time out earlier. Network throughput, disk space, archive size and AWS capacity may delay or fail export; check the code for current limits.

## What is preserved

The exporter reads `/home/ubuntu/workspace`, not only `notebooks` and `outputs`. It excludes entries matching these names or patterns recursively:

- `data`, `dataset`, `datasets`;
- `*.cache*`, `*__pycache__*`, `*.pyc`, `.ipynb_checkpoints`;
- `venv`, `.venv`, `node_modules`.

Notebooks and checkpoints outside excluded paths are eligible, but `/home/ubuntu/workspace/data` is excluded. Content outside the workspace is not included. Check exclusions and symbolic-link behavior in `worker/export_workspace.py` when modifying the implementation.

Objects are stored under the allocation ID, including `artifacts.zip`, `export-progress.json` and `artifacts.ready`. Progress reports scanning, archiving, verifying, failure and ready states. Percentages and ETA are estimates based on work observed; they can pause or increase. The app generates a short-lived signed download URL only when the archive is ready and the allocation remains inside its access window.

The portal allows downloads for seven days from scheduled end. The bucket's object lifecycle expires objects seven days after creation, asynchronously. These are separate clocks, not an exact physical deletion timestamp.

## Cost implications

Stopping the GPU early avoids running it throughout a potentially long export. The worker, EBS, S3 storage/requests, data transfer, Elastic IP and monitoring can still incur charges. The exporter re-downloads the archive for checksum verification, so large workspaces add IO and time. A `t3.micro` has limited CPU, memory and root disk; large files or many small files can be slow. Configure budgets and monitor cleanup and retained failed volumes.
