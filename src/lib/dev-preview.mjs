export function isDevPreviewAllowed(env = process.env.NODE_ENV) {
  return env !== "production";
}

export function getRedirectOrigin(request, url) {
  const parsedUrl = url
    ? url instanceof URL
      ? url
      : new URL(url)
    : request?.url
      ? new URL(request.url)
      : null;
  const getHeader = (name) =>
    (typeof request?.headers?.get === "function"
      ? request.headers.get(name)
      : request?.headers?.[name] || request?.headers?.[name.toLowerCase()]);
  const rawHost =
    getHeader("x-forwarded-host") ||
    getHeader("host") ||
    "localhost:3000";
  const host = String(rawHost).split(",")[0].trim().replace(/[^a-zA-Z0-9.:[\]-]/g, "") || "localhost:3000";
  const sanitizedHost = host.startsWith("[::]")
    ? host.replace("[::]", "localhost")
    : host;
  const rawProto =
    getHeader("x-forwarded-proto") ||
    (parsedUrl?.protocol ? parsedUrl.protocol.replace(/:$/, "") : "http");
  const proto = rawProto === "https" ? "https" : "http";
  return `${proto}://${sanitizedHost}`;
}

export function parseDevPreviewConfig(searchParams = new URLSearchParams()) {
  const get = (key) =>
    searchParams instanceof URLSearchParams
      ? searchParams.get(key)
      : searchParams?.[key];

  return {
    applicant_name: get("student") || "Galih Kencana",
    project_title:
      get("project") || "Deep Learning Benchmark",
    status: get("status") || "active",
    gpu_name: get("gpu") || "NVIDIA A10G (24GB)",
    workspace_ebs_gb: Number(get("workspace")) || 50,
    has_artifacts:
      get("artifacts") !== "false" && get("artifacts") !== "0",
  };
}

let devComputeSessionStore = new Map();

export function getDevPortalSession(rawConfig = {}) {
  let config = {};
  if (typeof rawConfig === "string") {
    try {
      config = JSON.parse(rawConfig);
    } catch {
      config = {};
    }
  } else if (typeof rawConfig === "object" && rawConfig !== null) {
    config = rawConfig;
  }

  const student = config.applicant_name || config.student || "Galih Kencana";
  const project =
    config.project_title || config.project || "Deep Learning Benchmark";
  const status = config.status || "active";
  const gpu = config.gpu_name || config.gpu || "NVIDIA A10G (24GB)";
  const workspaceGb =
    Number(config.workspace_ebs_gb || config.workspace) || 50;

  const now = Date.now();
  const proposedStart =
    config.proposed_start_at || new Date(now - 3600000).toISOString();
  const proposedEnd =
    config.proposed_end_at || new Date(now + 3 * 3600000).toISOString();
  const accessExpires =
    config.portal_access_expires_at ||
    new Date(now + 7 * 86400000).toISOString();

  const allocationId = config.allocation_id || "dev-allocation-001";
  const existingSession = devComputeSessionStore.get(allocationId);
  const currentSession = existingSession
    ? {
        ...existingSession,
        ...(config.status ? { status: config.status } : {}),
      }
    : {
        id: `dev-compute-session-${allocationId}`,
        allocation_id: allocationId,
        status,
        aws_region: "us-east-1",
        ec2_instance_id: null,
        jupyter_url: null,
        provisioned_at: null,
        ready_at: null,
        started_at: null,
        ended_at: null,
      };
  devComputeSessionStore.set(allocationId, currentSession);

  const allocation = {
    id: allocationId,
    instance_type:
      config.instance_type ||
      (gpu?.includes("T4")
        ? "g4dn.xlarge"
        : gpu?.includes("L4")
          ? "g6.xlarge"
          : "g5.xlarge"),
    gpu_name: gpu,
    workspace_ebs_gb: workspaceGb,
    proposed_start_at: proposedStart,
    proposed_end_at: proposedEnd,
    applications: {
      applicant_name: student,
      project_title: project,
    },
    compute_sessions: [currentSession],
  };

  const artifacts =
    config.has_artifacts === false
      ? []
      : [
          {
            id: "art-dev-benchmark-01",
            filename: "dl-benchmark-checkpoints.tar.gz",
            bytes: 145 * 1024 * 1024,
            verified_at: new Date(now - 1800000).toISOString(),
            downloadable_until: new Date(now + 7 * 86400000).toISOString(),
          },
          {
            id: "art-dev-logs-02",
            filename: "training-metrics.json.gz",
            bytes: 2.4 * 1024 * 1024,
            verified_at: new Date(now - 1800000).toISOString(),
            downloadable_until: new Date(now + 7 * 86400000).toISOString(),
          },
        ];

  const db = {
    from: (table) => {
      const getTableData = () => {
        if (table === "compute_allocations") return allocation;
        if (table === "compute_sessions") {
          return devComputeSessionStore.get(allocationId);
        }
        return artifacts;
      };
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        insert: (payload) => {
          if (table === "compute_sessions") {
            const row = Array.isArray(payload) ? payload[0] : payload;
            const merged = { ...currentSession, ...row };
            devComputeSessionStore.set(allocationId, merged);
            allocation.compute_sessions = [merged];
          }
          return query;
        },
        update: (payload) => {
          if (table === "compute_sessions") {
            const cur = devComputeSessionStore.get(allocationId) || currentSession;
            const merged = { ...cur, ...payload };
            devComputeSessionStore.set(allocationId, merged);
            allocation.compute_sessions = [merged];
          }
          return query;
        },
        upsert: (payload) => {
          if (table === "compute_sessions") {
            const row = Array.isArray(payload) ? payload[0] : payload;
            const cur = devComputeSessionStore.get(allocationId) || currentSession;
            const merged = { ...cur, ...row };
            devComputeSessionStore.set(allocationId, merged);
            allocation.compute_sessions = [merged];
          }
          return query;
        },
        single: async () => ({
          data:
            table === "compute_allocations"
              ? allocation
              : table === "compute_sessions"
                ? devComputeSessionStore.get(allocationId)
                : artifacts[0],
          error: null,
        }),
        maybeSingle: async () => ({
          data:
            table === "compute_allocations"
              ? allocation
              : table === "compute_sessions"
                ? devComputeSessionStore.get(allocationId)
                : artifacts[0],
          error: null,
        }),
        then: (resolve) => resolve({ data: getTableData(), error: null }),
      };
      return query;
    },
  };

  return {
    id: "dev-session-preview",
    grant: {
      id: "dev-grant-preview",
      allocation_id: allocation.id,
      portal_access_expires_at: accessExpires,
      revoked_at: null,
    },
    db,
  };
}
