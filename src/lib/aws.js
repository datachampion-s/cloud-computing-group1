import "server-only";
import {
  EC2Client,
  RunInstancesCommand,
  AssociateAddressCommand,
  TerminateInstancesCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { nginxMonitoringHttpConfig, nginxMonitoringServerConfig, monitoringUserDataScript } from "./monitoring-userdata.mjs";

export const REQUIRED_AWS_ENV_KEYS = [
  "AWS_REGION",
  "AWS_ARTIFACTS_BUCKET",
  "AWS_GPU_AMI_ID",
  "AWS_GPU_SECURITY_GROUP",
  "AWS_GPU_INSTANCE_PROFILE",
  "AWS_LAB_DOMAIN",
  "AWS_LAB_EIP_ALLOCATION_ID",
  "AWS_LAB_PUBLIC_IP",
];

export function labHost(allocationId, domain = process.env.AWS_LAB_DOMAIN) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(String(allocationId || "")) ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(String(domain || ""))) throw new Error("INVALID_LAB_HOST");
  return `${allocationId}.${domain}`;
}

export function awsConfigured(env = process.env) {
  return REQUIRED_AWS_ENV_KEYS.every((k) => !!env?.[k]?.trim()) && credentialsConfigured(env);
}

function credentialsConfigured(env) {
  return env.VERCEL === "1"
    ? !!env.AWS_ROLE_ARN?.trim()
    : !!env.AWS_ACCESS_KEY_ID?.trim() && !!env.AWS_SECRET_ACCESS_KEY?.trim();
}

export function s3Configured(env = process.env) {
  return [
    "AWS_REGION",
    "AWS_ARTIFACTS_BUCKET",
  ].every((k) => !!env?.[k]?.trim()) && credentialsConfigured(env);
}

function credentialsFor(env) {
  return env.VERCEL === "1"
    ? awsCredentialsProvider({ roleArn: env.AWS_ROLE_ARN })
    : { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}) };
}

export const VALID_INSTANCE_TYPES = [
  "t3.small",
  "t3.medium",
  "g4dn.xlarge",
  "g5.xlarge",
  "g6.xlarge",
];

export function isValidBucketName(bucket) {
  return (
    typeof bucket === "string" &&
    bucket.length >= 3 &&
    bucket.length <= 63 &&
    !bucket.includes("..") &&
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket)
  );
}

export function isValidInstanceId(instanceId) {
  return typeof instanceId === "string" && /^i-[0-9a-f]{8,17}$/i.test(instanceId);
}

export function isValidArtifactFilename(filename) {
  return (
    typeof filename === "string" &&
    filename.length > 0 &&
    filename.length <= 255 &&
    filename !== "." &&
    !filename.startsWith("-") &&
    !filename.includes("..") &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    /^[a-zA-Z0-9._-]+$/.test(filename)
  );
}

export function getEc2Client(env = process.env) {
  return new EC2Client({
    region: env.AWS_REGION,
    credentials: credentialsFor(env),
  });
}

export function getS3Client(env = process.env) {
  return new S3Client({
    region: env.AWS_REGION,
    credentials: credentialsFor(env),
  });
}

export function buildUserDataScript({
  allocationId,
  sessionHours = 3,
  sessionEnd,
  jupyterToken = "",
  bucket = process.env.AWS_ARTIFACTS_BUCKET,
  labDomain = process.env.AWS_LAB_DOMAIN,
}) {
  if (!allocationId || !/^[a-zA-Z0-9_-]+$/.test(String(allocationId))) {
    throw new Error("INVALID_ALLOCATION_ID");
  }
  const safeBucket = String(bucket || "").trim();
  if (!isValidBucketName(safeBucket)) {
    throw new Error("INVALID_BUCKET_NAME");
  }
  const host = labHost(allocationId, labDomain);
  const safeToken = String(jupyterToken || "").replace(/[^a-zA-Z0-9._-]/g, "");
  const parsedHours = Number(sessionHours);
  const clampedHours = Number.isFinite(parsedHours) && parsedHours > 0
    ? Math.min(12, parsedHours)
    : 3;
  const endDate = sessionEnd ? new Date(sessionEnd) : new Date(Date.now() + clampedHours * 3600000);
  if (!Number.isFinite(endDate.getTime())) throw new Error("INVALID_SESSION_END");
  const expiry = endDate.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  const appOrigin = new URL(process.env.APP_URL || "http://localhost:3000");
  if (!["https:", "http:"].includes(appOrigin.protocol)) throw new Error("INVALID_APP_URL");
  const returnTo = new URL("/compute", appOrigin.origin).href;
  const redirectScript = Buffer.from(`(function check(){const left=${endDate.getTime()}-Date.now();if(left<=0){location.replace(${JSON.stringify(returnTo)});return;}setTimeout(check,Math.min(left,30000));})();`).toString("base64");

  return `#!/bin/bash
set -euo pipefail

WORKSPACE="/home/ubuntu/workspace"
mkdir -p "$WORKSPACE/notebooks" "$WORKSPACE/data" "$WORKSPACE/outputs"
chown -R ubuntu:ubuntu "$WORKSPACE"

cat <<'EOF' > /etc/systemd/system/dcs-expire.service
[Unit]
Description=Stop DCS GPU session at deadline
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'systemctl disable --now dcs-export.timer; /sbin/shutdown -h now'
EOF
cat <<'EOF' > /etc/systemd/system/dcs-export.timer
[Unit]
Description=End DCS session at its allocated deadline
[Timer]
OnCalendar=${expiry}
Persistent=true
Unit=dcs-expire.service
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now dcs-export.timer

apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot
systemctl stop nginx || true
for attempt in 1 2 3 4 5; do
  certbot certonly --standalone --non-interactive --agree-tos --register-unsafely-without-email -d '${host}' && break
  [ "$attempt" -eq 5 ] && exit 1
  sleep 30
done
mkdir -p /usr/local/share/dcs
printf '%s' '${redirectScript}' | base64 -d > /usr/local/share/dcs/expiry.js
cat <<'EOF' > /etc/nginx/conf.d/dcs-jupyter.conf
map $http_upgrade $dcs_connection_upgrade {
  default upgrade;
  '' close;
}
${nginxMonitoringHttpConfig(allocationId)}
server {
  listen 443 ssl;
  server_name ${host};
  ssl_certificate /etc/letsencrypt/live/${host}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${host}/privkey.pem;
  ${nginxMonitoringServerConfig()}
  location = /dcs-expiry.js {
    alias /usr/local/share/dcs/expiry.js;
    default_type application/javascript;
    add_header Cache-Control 'no-store';
  }
  location / {
    proxy_pass http://127.0.0.1:8889;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $dcs_connection_upgrade;
    proxy_set_header Accept-Encoding '';
    proxy_read_timeout 3600s;
    sub_filter_once on;
    sub_filter '</head>' '<script src="/dcs-expiry.js"></script></head>';
  }
}
EOF
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if ! command -v jupyter &> /dev/null; then
  if ! command -v pip3 &> /dev/null && ! command -v pip &> /dev/null; then
    apt-get update -y && apt-get install -y python3-pip || true
  fi
  python3 -m pip install --no-cache-dir jupyterlab || true
fi

if [ "$(date +%s)" -lt "${Math.floor(endDate.getTime() / 1000)}" ]; then
  su - ubuntu -c "export PATH=/usr/local/bin:/home/ubuntu/.local/bin:\$PATH; nohup jupyter lab --ip=127.0.0.1 --port=8889 --no-browser --ServerApp.allow_remote_access=True --ServerApp.token='${safeToken}' --ServerApp.root_dir='/home/ubuntu/workspace' --ServerApp.autosave_interval=15 > /home/ubuntu/jupyter.log 2>&1 &"
fi

( set -e
${monitoringUserDataScript({ allocationId, region: process.env.AWS_REGION || "us-east-1" })}
) > /var/log/dcs-monitoring-setup.log 2>&1 &

`;
}

export async function launchComputeSession({
  allocationId,
  instanceType = "g4dn.xlarge",
  ebsGb = 75,
  sessionHours = 3,
  sessionEnd,
  jupyterToken,
  ec2Client,
}) {
  if (!awsConfigured()) throw new Error("AWS_UNAVAILABLE");
  if (!VALID_INSTANCE_TYPES.includes(instanceType)) {
    throw new Error("INVALID_INSTANCE_TYPE");
  }
  const parsedEbs = Number(ebsGb);
  const safeEbsGb =
    Number.isFinite(parsedEbs) && parsedEbs >= 20 && parsedEbs <= 2000
      ? Math.max(75, Math.round(parsedEbs))
      : 75;
  const requestedHours = Number(sessionHours);
  const durationHours = Number.isFinite(requestedHours) && requestedHours > 0 ? Math.min(12, requestedHours) : 3;
  const deadline = sessionEnd || new Date(Date.now() + durationHours * 3600000).toISOString();
  if (!Number.isFinite(Date.parse(deadline))) throw new Error("INVALID_SESSION_END");
  const userDataScript = buildUserDataScript({
    allocationId,
    sessionHours,
    sessionEnd: deadline,
    jupyterToken,
    bucket: process.env.AWS_ARTIFACTS_BUCKET,
  });

  const client = ec2Client || getEc2Client();
  const command = new RunInstancesCommand({
    ImageId: process.env.AWS_GPU_AMI_ID,
    InstanceType: instanceType,
    MinCount: 1,
    MaxCount: 1,
    ClientToken: `dcs-${allocationId}`,
    InstanceInitiatedShutdownBehavior: "stop",
    SecurityGroupIds: [process.env.AWS_GPU_SECURITY_GROUP],
    IamInstanceProfile: { Name: process.env.AWS_GPU_INSTANCE_PROFILE },
    MetadataOptions: {
      HttpTokens: "required",
      HttpPutResponseHopLimit: 1,
      HttpEndpoint: "enabled",
    },
    BlockDeviceMappings: [
      {
        DeviceName: "/dev/sda1",
        Ebs: {
          VolumeSize: safeEbsGb,
          VolumeType: "gp3",
          Encrypted: true,
          DeleteOnTermination: false,
        },
      },
    ],
    TagSpecifications: [
      {
        ResourceType: "instance",
        Tags: [
          { Key: "Project", Value: "dcs-hpc" },
          { Key: "AllocationId", Value: String(allocationId) },
          { Key: "DCSPhase", Value: "gpu" },
          { Key: "DCSEndEpoch", Value: String(Math.floor(Date.parse(deadline) / 1000)) },
        ],
      },
      {
        ResourceType: "volume",
        Tags: [
          { Key: "Project", Value: "dcs-hpc" },
          { Key: "AllocationId", Value: String(allocationId) },
        ],
      },
    ],
    UserData: Buffer.from(userDataScript).toString("base64"),
  });

  const response = await client.send(command);
  const instance = response?.Instances?.[0] || {};
  if (!instance.InstanceId) throw new Error("AWS_LAUNCH_FAILED");
  return {
    instanceId: instance.InstanceId || null,
    privateIp: instance.PrivateIpAddress || null,
    publicIp: instance.PublicIpAddress || null,
  };
}

export async function associateLabAddress(instanceId) {
  if (!isValidInstanceId(instanceId)) throw new Error("INVALID_INSTANCE_ID");
  await getEc2Client().send(new AssociateAddressCommand({ AllocationId: process.env.AWS_LAB_EIP_ALLOCATION_ID, InstanceId: instanceId, AllowReassociation: true }));
}

export async function describeComputeInstance({ instanceId, ec2Client }) {
  if (!isValidInstanceId(instanceId)) throw new Error("INVALID_INSTANCE_ID");
  if (!ec2Client && !awsConfigured()) throw new Error("AWS_UNAVAILABLE");
  const client = ec2Client || getEc2Client();
  const command = new DescribeInstancesCommand({
    InstanceIds: [instanceId],
  });
  const response = await client.send(command);
  const instance = response?.Reservations?.[0]?.Instances?.[0] || {};
  return {
    instanceId: instance.InstanceId || instanceId,
    state: instance.State?.Name || "unknown",
    publicIp: instance.PublicIpAddress || null,
    privateIp: instance.PrivateIpAddress || null,
    instanceType: instance.InstanceType || null,
    lifecyclePhase: instance.Tags?.find((tag) => tag.Key === "DCSPhase")?.Value || null,
  };
}

export async function listExportWorkers({ ec2Client } = {}) {
  if (!ec2Client && !awsConfigured()) throw new Error("AWS_UNAVAILABLE");
  const client = ec2Client || getEc2Client();
  const response = await client.send(new DescribeInstancesCommand({
    Filters: [
      { Name: "tag:Project", Values: ["dcs-hpc-export"] },
      { Name: "instance-state-name", Values: ["pending", "running", "stopping"] },
    ],
  }));
  return (response?.Reservations || []).flatMap((reservation) => reservation.Instances || []).map((instance) => ({
    instanceId: instance.InstanceId || null,
    instanceType: instance.InstanceType || null,
    state: instance.State?.Name || "unknown",
    publicIp: instance.PublicIpAddress || null,
    privateIp: instance.PrivateIpAddress || null,
    launchTime: instance.LaunchTime ? new Date(instance.LaunchTime).toISOString() : null,
    allocationId: instance.Tags?.find((tag) => tag.Key === "AllocationId")?.Value || null,
    lifecyclePhase: instance.Tags?.find((tag) => tag.Key === "DCSPhase")?.Value || null,
    name: instance.Tags?.find((tag) => tag.Key === "Name")?.Value || null,
  }));
}

export async function getExportProgress(allocationId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(allocationId || ""))) throw new Error("INVALID_ALLOCATION_ID");
  try {
    const result = await getS3Client().send(new GetObjectCommand({
      Bucket: process.env.AWS_ARTIFACTS_BUCKET, Key: `${allocationId}/export-progress.json`,
    }));
    return JSON.parse(await result.Body.transformToString());
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || ["NoSuchKey", "NotFound"].includes(error?.name)) return null;
    throw error;
  }
}

export async function terminateComputeSession({ instanceId, ec2Client }) {
  if (!isValidInstanceId(instanceId)) throw new Error("INVALID_INSTANCE_ID");
  if (!ec2Client && !awsConfigured()) throw new Error("AWS_UNAVAILABLE");
  const client = ec2Client || getEc2Client();
  const command = new TerminateInstancesCommand({
    InstanceIds: [instanceId],
  });
  return client.send(command);
}

export async function generateArtifactDownloadUrl({
  allocationId,
  filename = "artifacts.zip",
  expiresIn = 3600,
  s3Client,
  signUrl = getSignedUrl,
}) {
  if (!allocationId || !/^[a-zA-Z0-9_-]+$/.test(String(allocationId))) {
    throw new Error("INVALID_ALLOCATION_ID");
  }
  if (!isValidArtifactFilename(filename)) {
    throw new Error("INVALID_ARTIFACT_FILENAME");
  }
  if (!s3Client && !s3Configured()) {
    throw new Error("AWS_UNAVAILABLE");
  }
  const client = s3Client || getS3Client();
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_ARTIFACTS_BUCKET,
    Key: `${allocationId}/${filename}`,
  });
  return signUrl(client, command, { expiresIn });
}

export async function listSessionArtifacts({ allocationId, s3Client }) {
  if (!allocationId || !/^[a-zA-Z0-9_-]+$/.test(String(allocationId))) {
    throw new Error("INVALID_ALLOCATION_ID");
  }
  if (!s3Client && !s3Configured()) {
    throw new Error("AWS_UNAVAILABLE");
  }
  const client = s3Client || getS3Client();
  const prefix = `${allocationId}/`;
  const command = new ListObjectsV2Command({
    Bucket: process.env.AWS_ARTIFACTS_BUCKET,
    Prefix: prefix,
  });
  const response = await client.send(command);
  const contents = response?.Contents || [];
  return contents
    .filter((item) => item.Key && item.Key !== prefix)
    .map((item) => ({
      key: item.Key,
      filename: item.Key.slice(prefix.length),
      bytes: item.Size ?? 0,
      lastModified: item.LastModified
        ? new Date(item.LastModified).toISOString()
        : null,
    }));
}

export async function isArtifactReady({ allocationId, s3Client }) {
  if (!allocationId || !/^[a-zA-Z0-9_-]+$/.test(String(allocationId))) {
    throw new Error("INVALID_ALLOCATION_ID");
  }
  if (!s3Client && !s3Configured()) throw new Error("AWS_UNAVAILABLE");
  const client = s3Client || getS3Client();
  try {
    await client.send(new HeadObjectCommand({
      Bucket: process.env.AWS_ARTIFACTS_BUCKET,
      Key: `${allocationId}/artifacts.ready`,
    }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}
