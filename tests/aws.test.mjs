import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import vm from "node:vm";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const {
  REQUIRED_AWS_ENV_KEYS,
  VALID_INSTANCE_TYPES,
  awsConfigured,
  labHost,
  s3Configured,
  isValidBucketName,
  isValidInstanceId,
  isValidArtifactFilename,
  buildUserDataScript,
  launchComputeSession,
  describeComputeInstance,
  terminateComputeSession,
  generateArtifactDownloadUrl,
  listSessionArtifacts,
} = await import("../src/lib/aws.js");

const FULL_ENV = {
  AWS_REGION: "ap-southeast-1",
  AWS_ACCESS_KEY_ID: "EXAMPLEACCESSKEYVALUE",
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  AWS_ARTIFACTS_BUCKET: "dcs-hpc-artifacts-test",
  AWS_GPU_AMI_ID: "ami-0123456789abcdef0",
  AWS_GPU_SECURITY_GROUP: "sg-0123456789abcdef0",
  AWS_GPU_INSTANCE_PROFILE: "dcs-hpc-gpu-profile",
  AWS_LAB_DOMAIN: "lab.hpc.example.com",
  AWS_LAB_EIP_ALLOCATION_ID: "eipalloc-0123456789abcdef0",
  AWS_LAB_PUBLIC_IP: "192.0.2.1",
};

function withEnv(overrides, fn) {
  const backup = {};
  for (const key of [...REQUIRED_AWS_ENV_KEYS, "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
    backup[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  const restore = () => {
    for (const key of [...REQUIRED_AWS_ENV_KEYS, "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
      if (backup[key] === undefined) delete process.env[key];
      else process.env[key] = backup[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

test("awsConfigured checks all required AWS environment variables", () => {
  assert.equal(awsConfigured(FULL_ENV), true);
  for (const key of REQUIRED_AWS_ENV_KEYS) {
    assert.equal(awsConfigured({ ...FULL_ENV, [key]: "" }), false);
    assert.equal(awsConfigured({ ...FULL_ENV, [key]: "   " }), false);
  }
  assert.equal(s3Configured(FULL_ENV), true);
  assert.equal(s3Configured({ ...FULL_ENV, AWS_ARTIFACTS_BUCKET: "" }), false);
  assert.equal(awsConfigured({ ...FULL_ENV, VERCEL: "1", AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/test", AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "" }), true);
  assert.equal(awsConfigured({ ...FULL_ENV, VERCEL: "1", AWS_ROLE_ARN: "" }), false);
});

test("isValidArtifactFilename allows safe archive names and blocks path traversal", () => {
  assert.equal(isValidArtifactFilename("artifacts.tar.gz"), true);
  assert.equal(isValidArtifactFilename("dl-benchmark-checkpoints.tar.gz"), true);
  assert.equal(isValidArtifactFilename("../secrets.tar.gz"), false);
  assert.equal(isValidArtifactFilename("nested/artifacts.tar.gz"), false);
  assert.equal(isValidArtifactFilename("nested\\artifacts.tar.gz"), false);
  assert.equal(isValidArtifactFilename(""), false);
  assert.equal(isValidArtifactFilename("."), false);
  assert.equal(isValidArtifactFilename("-flag.tar.gz"), false);
});

test("lab host uses a validated session label and domain", () => {
  assert.equal(labHost("a1b2-test", "lab.hpc.example.com"), "a1b2-test.lab.hpc.example.com");
  assert.throws(() => labHost("x;touch-file", "lab.hpc.example.com"), /INVALID_LAB_HOST/);
  assert.throws(() => labHost("abc", "evil.com;touch-file"), /INVALID_LAB_HOST/);
});

test("buildUserDataScript blocks command injection in bucket, token, and allocationId", () => {
  assert.throws(
    () =>
      buildUserDataScript({
        allocationId: "alloc-123",
        bucket: "my-bucket\"; rm -rf / #",
      }),
    /INVALID_BUCKET_NAME/,
  );
  assert.throws(
    () =>
      buildUserDataScript({
        allocationId: "alloc-123; whoami",
        bucket: "dcs-hpc-artifacts-test",
      }),
    /INVALID_ALLOCATION_ID/,
  );
  const script = buildUserDataScript({
    allocationId: "alloc-123",
    sessionHours: 999,
    jupyterToken: "tok'$(whoami)`id`",
    bucket: "dcs-hpc-artifacts-test",
    labDomain: "lab.hpc.example.com",
  });
  assert.ok(script.includes("--ServerApp.token='tokwhoamiid'"));
  assert.ok(script.includes("OnCalendar="));
  assert.equal(isValidBucketName("dcs-hpc-artifacts-test"), true);
  assert.equal(isValidBucketName("BAD_BUCKET"), false);
  assert.equal(isValidInstanceId("i-0abc123def456"), true);
  assert.equal(isValidInstanceId("invalid-id"), false);
});

test("buildUserDataScript sets up workspace directories, JupyterLab token, and S3 export", () => {
  const script = buildUserDataScript({
    allocationId: "alloc-123",
    sessionHours: 3,
    jupyterToken: "tok_abc123",
    bucket: "dcs-hpc-artifacts-test",
    labDomain: "lab.hpc.example.com",
  });

  assert.ok(
    script.includes(
      'mkdir -p "$WORKSPACE/notebooks" "$WORKSPACE/data" "$WORKSPACE/outputs"',
    ),
  );
  assert.ok(script.includes("--ServerApp.token='tok_abc123'"));
  assert.ok(script.includes("--ServerApp.autosave_interval=15"));
  assert.ok(script.includes("--ip=127.0.0.1 --port=8889"));
  assert.ok(script.includes("listen 443 ssl"));
  assert.ok(script.includes("certbot certonly --standalone"));
  assert.ok(script.includes("sub_filter '</head>'"));
  assert.ok(script.includes("/dcs-expiry.js"));
  assert.ok(script.includes("python3 -m pip install --no-cache-dir jupyterlab"));
  assert.ok(script.includes("/usr/local/bin:/home/ubuntu/.local/bin"));
  assert.ok(script.includes("Persistent=true"));
  assert.ok(script.includes('/sbin/shutdown -h now'));

});

test("Jupyter deadline script redirects its own tab when time expires", () => {
  const end = Date.parse("2030-01-02T03:04:05Z");
  const script = buildUserDataScript({
    allocationId: "alloc-test", sessionEnd: new Date(end).toISOString(),
    bucket: "dcs-hpc-artifacts-test", jupyterToken: "test", labDomain: "lab.hpc.example.com",
  });
  const match = script.match(/printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d > \/usr\/local\/share\/dcs\/expiry\.js/);
  assert.ok(match);
  let destination;
  vm.runInNewContext(Buffer.from(match[1], "base64").toString("utf8"), {
    Date: { now: () => end },
    location: { replace: (value) => { destination = value; } },
    setTimeout: () => { throw new Error("expired script must not schedule another timer"); },
  });
  assert.equal(new URL(destination).pathname, "/compute");
});

test("launchComputeSession sends RunInstancesCommand with base64 user data and tags", async () => {
  await withEnv(FULL_ENV, async () => {
    let sentCommand = null;
    const mockEc2 = {
      send: async (cmd) => {
        if (cmd.constructor.name === "AssociateAddressCommand") return {};
        sentCommand = cmd;
        return {
          Instances: [
            {
              InstanceId: "i-0abc123def456",
              PrivateIpAddress: "10.0.1.25",
              PublicIpAddress: "54.169.10.20",
            },
          ],
        };
      },
    };

    const result = await launchComputeSession({
      allocationId: "alloc-gpu-001",
      instanceType: "g4dn.xlarge",
      ebsGb: 75,
      sessionHours: 4,
      jupyterToken: "jup-token-99",
      ec2Client: mockEc2,
    });

    assert.deepEqual(result, {
      instanceId: "i-0abc123def456",
      privateIp: "10.0.1.25",
      publicIp: "54.169.10.20",
    });

    const input = sentCommand.input;
    assert.equal(input.ImageId, FULL_ENV.AWS_GPU_AMI_ID);
    assert.equal(input.InstanceType, "g4dn.xlarge");
    assert.equal(input.MinCount, 1);
    assert.equal(input.MaxCount, 1);
    assert.deepEqual(input.SecurityGroupIds, [FULL_ENV.AWS_GPU_SECURITY_GROUP]);
    assert.deepEqual(input.IamInstanceProfile, {
      Name: FULL_ENV.AWS_GPU_INSTANCE_PROFILE,
    });
    assert.deepEqual(input.MetadataOptions, {
      HttpTokens: "required",
      HttpPutResponseHopLimit: 1,
      HttpEndpoint: "enabled",
    });
    assert.equal(input.BlockDeviceMappings[0].Ebs.Encrypted, true);
    assert.equal(input.BlockDeviceMappings[0].Ebs.DeleteOnTermination, false);
    const tags = Object.fromEntries(input.TagSpecifications[0].Tags.map(({ Key, Value }) => [Key, Value]));
    assert.equal(tags.Project, "dcs-hpc");
    assert.equal(tags.AllocationId, "alloc-gpu-001");
    assert.equal(tags.DCSPhase, "gpu");
    assert.ok(Number(tags.DCSEndEpoch) > Date.now() / 1000);

    const decodedUserData = Buffer.from(input.UserData, "base64").toString(
      "utf8",
    );
    assert.ok(
      decodedUserData.includes(
        "/sbin/shutdown -h now",
      ),
    );
    assert.ok(decodedUserData.includes("jup-token-99"));
  });
});

test("launchComputeSession throws AWS_UNAVAILABLE when AWS env is incomplete", async () => {
  await withEnv({}, async () => {
    await assert.rejects(
      () => launchComputeSession({ allocationId: "alloc-gpu-001" }),
      /AWS_UNAVAILABLE/,
    );
  });
});

test("terminateComputeSession sends TerminateInstancesCommand", async () => {
  let sentCommand = null;
  const mockEc2 = {
    send: async (cmd) => {
      sentCommand = cmd;
      return { TerminatingInstances: [{ InstanceId: "i-0abc123def456" }] };
    },
  };

  await terminateComputeSession({
    instanceId: "i-0abc123def456",
    ec2Client: mockEc2,
  });

  assert.deepEqual(sentCommand.input, {
    InstanceIds: ["i-0abc123def456"],
  });
});

test("VALID_INSTANCE_TYPES includes t3.small and t3.medium for test provisioning", async () => {
  assert.ok(VALID_INSTANCE_TYPES.includes("t3.small"));
  assert.ok(VALID_INSTANCE_TYPES.includes("t3.medium"));

  await withEnv(FULL_ENV, async () => {
    let sentCommand = null;
    const mockEc2 = {
      send: async (cmd) => {
        if (cmd.constructor.name === "AssociateAddressCommand") return {};
        sentCommand = cmd;
        return {
          Instances: [
            {
              InstanceId: "i-01122334455667788",
              PrivateIpAddress: "172.31.10.5",
              PublicIpAddress: "54.210.11.22",
            },
          ],
        };
      },
    };

    const res = await launchComputeSession({
      allocationId: "alloc-test-t3",
      instanceType: "t3.small",
      ebsGb: 30,
      sessionHours: 1,
      jupyterToken: "tok-t3",
      ec2Client: mockEc2,
    });

    assert.equal(sentCommand.input.InstanceType, "t3.small");
    assert.equal(res.instanceId, "i-01122334455667788");
  });
});

test("launchComputeSession supports production GPU instance types (g4dn, g5, g6)", async () => {
  for (const gpuType of ["g4dn.xlarge", "g5.xlarge", "g6.xlarge"]) {
    assert.ok(VALID_INSTANCE_TYPES.includes(gpuType));
    await withEnv(FULL_ENV, async () => {
      let sentCommand = null;
      const mockEc2 = {
        send: async (cmd) => {
          if (cmd.constructor.name === "AssociateAddressCommand") return {};
          sentCommand = cmd;
          return {
            Instances: [
              {
                InstanceId: `i-gpu-${gpuType.replace(".", "-")}`,
                PrivateIpAddress: "10.0.1.50",
                PublicIpAddress: "54.200.10.1",
              },
            ],
          };
        },
      };

      const res = await launchComputeSession({
        allocationId: `alloc-${gpuType.replace(".", "-")}`,
        instanceType: gpuType,
        ebsGb: 75,
        sessionHours: 4,
        jupyterToken: "tok-gpu",
        ec2Client: mockEc2,
      });

      assert.equal(sentCommand.input.InstanceType, gpuType);
      assert.equal(res.instanceId, `i-gpu-${gpuType.replace(".", "-")}`);
    });
  }
});

test("describeComputeInstance queries EC2 instance state and public IPv4", async () => {
  let sentCommand = null;
  const mockEc2 = {
    send: async (cmd) => {
      sentCommand = cmd;
      return {
        Reservations: [
          {
            Instances: [
              {
                InstanceId: "i-0abc123def456",
                State: { Name: "running" },
                PublicIpAddress: "3.85.100.200",
                PrivateIpAddress: "172.31.20.10",
                InstanceType: "t3.small",
              },
            ],
          },
        ],
      };
    },
  };

  const info = await describeComputeInstance({
    instanceId: "i-0abc123def456",
    ec2Client: mockEc2,
  });

  assert.deepEqual(sentCommand.input, {
    InstanceIds: ["i-0abc123def456"],
  });
  assert.deepEqual(info, {
    instanceId: "i-0abc123def456",
    state: "running",
    publicIp: "3.85.100.200",
    privateIp: "172.31.20.10",
    lifecyclePhase: null,
    instanceType: "t3.small",
  });
});

test("generateArtifactDownloadUrl produces a signed S3 URL for the allocation artifact", async () => {
  await withEnv(FULL_ENV, async () => {
    const signedUrl = await generateArtifactDownloadUrl({
      allocationId: "alloc-gpu-001",
      filename: "artifacts.tar.gz",
      expiresIn: 1800,
    });

    const parsed = new URL(signedUrl);
    assert.ok(parsed.hostname.includes("dcs-hpc-artifacts-test"));
    assert.ok(parsed.pathname.endsWith("/alloc-gpu-001/artifacts.tar.gz"));
    assert.equal(
      parsed.searchParams.get("X-Amz-Algorithm"),
      "AWS4-HMAC-SHA256",
    );
    assert.equal(parsed.searchParams.get("X-Amz-Expires"), "1800");
  });
});

test("listSessionArtifacts lists and maps objects under the allocation prefix", async () => {
  await withEnv(FULL_ENV, async () => {
    let sentCommand = null;
    const mockS3 = {
      send: async (cmd) => {
        sentCommand = cmd;
        return {
          Contents: [
            {
              Key: "alloc-gpu-001/artifacts.tar.gz",
              Size: 10485760,
              LastModified: new Date("2026-11-13T10:00:00.000Z"),
            },
          ],
        };
      },
    };

    const items = await listSessionArtifacts({
      allocationId: "alloc-gpu-001",
      s3Client: mockS3,
    });

    assert.equal(sentCommand.input.Bucket, "dcs-hpc-artifacts-test");
    assert.equal(sentCommand.input.Prefix, "alloc-gpu-001/");
    assert.deepEqual(items, [
      {
        key: "alloc-gpu-001/artifacts.tar.gz",
        filename: "artifacts.tar.gz",
        bytes: 10485760,
        lastModified: "2026-11-13T10:00:00.000Z",
      },
    ]);
  });
});
