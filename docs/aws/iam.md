# AWS IAM for DCS HPC

IAM controls **which identity may call which AWS API**. In this project, the web app, GPU instance, export worker and controller are different identities. A **trust policy** decides who can assume a role; a separate **permissions policy** decides what the assumed role can do. An **EC2 instance profile** is the container EC2 uses to attach a role to an instance. IAM roles do not open network ports; security groups do that.

## Roles in this system

| Identity | Purpose | Created by |
| --- | --- | --- |
| Vercel production role (`<VERCEL_PRODUCTION_ROLE>` in the observed account) | Vercel obtains short-lived credentials through OIDC to launch/describe EC2, associate EIP, inspect S3 and read/write required monitoring data | Operator; Vercel + IAM OIDC configuration |
| GPU instance role/profile (`<GPU_INSTANCE_ROLE>`) | GPU host publishes CloudWatch Agent metrics and access logs, plus any explicitly configured project storage access | Operator |
| Lifecycle controller role | Lambda reads and mutates lifecycle-tagged EC2 resources, works with S3, locks in DynamoDB and publishes SNS failures | `worker/lifecycle.yaml` |
| Export worker role/profile | Worker reads/writes the configured artifact bucket and aborts multipart uploads | `worker/lifecycle.yaml` |

This distinction matters: giving the Lambda role to the GPU or Vercel role would grant the wrong process permissions. `monitoring-iam.json` documents **only monitoring additions**, not the complete web/GPU policies.

## 1. Create the Vercel OIDC provider

1. In Vercel open the `web-hpc` project settings and inspect OIDC and issuer mode. Record the real team slug, project name, issuer and audience. The observed account used team issuer `https://oidc.vercel.com/<TEAM_SLUG>` and audience `https://vercel.com/<TEAM_SLUG>`.
2. In AWS IAM → **Identity providers** → **Add provider**, choose **OpenID Connect**, enter the issuer URL and audience from Vercel, and create it. Reuse an existing matching provider rather than making duplicates.
3. In IAM → **Roles** → **Create role**, select web identity and the provider/audience. Restrict the role trust to this project and production environment. If editing trust JSON manually, substitute the account ID and actual team/project in the example below; literal placeholders are invalid.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/oidc.vercel.com/<TEAM_SLUG>" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": { "StringEquals": {
      "oidc.vercel.com/<TEAM_SLUG>:aud": "https://vercel.com/<TEAM_SLUG>",
      "oidc.vercel.com/<TEAM_SLUG>:sub": "owner:<TEAM_SLUG>:project:<PROJECT_NAME>:environment:production"
    }}
  }]
}
```

4. Create the role, review **Trust relationships**, and record the role ARN for Vercel's `AWS_ROLE_ARN`. Trust grants no EC2/S3 permissions by itself. The condition-key prefix must match the provider host/path and issuer mode; use [Vercel's current AWS OIDC guide](https://vercel.com/docs/oidc/aws) if issuer mode differs.

## 2. Attach the web permissions

1. Examine the current deployment's IAM role **Permissions** tab and all inline/managed policies; export reviewed policies into your protected handover record. Existing deployment policies may be split across multiple policies and `monitoring-iam.json` is not the full set.
2. For a new account, inventory the AWS SDK calls in `src/lib/aws.js`, `src/lib/monitoring.js` and the admin/session routes. Generate and review a least-privilege permissions policy for EC2 launch/describe, EIP association, scoped `iam:PassRole` to the GPU role, artifact bucket list/read and CloudWatch Logs operations. Some EC2 describe actions require `Resource: *`; resource-specific operations should be scoped where AWS supports it.
3. IAM → Policies → create reviewed policy → attach it to the Vercel role. Apply the relevant `applicationRolePolicy` monitoring statements in `monitoring-iam.json`, replacing/scoping resource values as appropriate. Validate with IAM Access Analyzer and a controlled end-to-end test; do not attach administrator access as a shortcut.
4. Put the role ARN in Vercel production environment, redeploy, and test a controlled session. Trust failures and permission-denied failures are different: inspect both the trust condition and the denied operation.

**Fresh-account limitation:** the repository contains monitoring snippets and the lifecycle template, but not an authoritative, complete deployable policy for the web and GPU roles. Reconstruct/review those policies from an authorized export of the existing account and source-code API inventory. Do not treat snippets as sufficient.

## 3. Create GPU EC2 role and profile

1. IAM → Roles → Create role → **AWS service** → **EC2**. Name it for this project; the EC2 service trust lets the instance assume the role.
2. Attach a reviewed policy for the actual GPU bootstrap/monitoring operations. Use `instanceProfilePolicy` from `monitoring-iam.json` as the monitoring portion, scoping the log group and namespace. Include other required storage permissions only after checking the current code and configuration.
3. IAM normally creates an EC2 instance profile when a role is created through the console. Verify IAM → Roles / EC2 instance-profile details; if using CLI/API, create an instance profile and add the role separately. Set `AWS_GPU_INSTANCE_PROFILE` to the **profile name**, not its ARN. Wait for IAM propagation before testing.
4. Verify `/dcs-hpc/jupyter-access` exists with the intended retention and that an isolated GPU instance can publish metrics and logs. A role cannot compensate for missing network connectivity.

## 4. Controller and worker roles

Deploying `worker/lifecycle.yaml` creates these roles and the worker profile; do not manually create similarly named substitutes. The controller role's `iam:PassRole` is restricted to the worker role and EC2 service. Inspect CloudFormation resources and each role's permissions after deployment. Update stack-managed roles through the template/stack, not a console change that would drift.

## Troubleshooting

- **Invalid ARN account:** replace the account placeholder with the actual 12-digit account ID.
- **Unsupported condition key:** the key must be the exact OIDC provider host/path plus `:sub` or `:aud`; check issuer mode and spelling.
- **AccessDenied:** determine which identity made the call and which action/resource failed; inspect identity policy, trust, boundaries, organization and resource policies.
- **No metrics:** check GPU role *and* CloudWatch Agent, network, namespace and log group; an IAM role by itself does not install an agent.

References: [IAM web identity roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html), [Vercel AWS OIDC](https://vercel.com/docs/oidc/aws), and [EC2 instance profiles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html).
