import { createHmac } from "node:crypto";
import { assertOrigin, failure, jsonBody, portalSession } from "@/lib/server";
import { recordAuthenticatedPortalIp } from "@/lib/monitoring";
import {
  awsConfigured,
  associateLabAddress,
  describeComputeInstance,
  getExportProgress,
  isArtifactReady,
  s3Configured,
  launchComputeSession,
  labHost,
  VALID_INSTANCE_TYPES,
} from "@/lib/aws";

export const dynamic = "force-dynamic";

function extractTokenFromUrl(urlStr) {
  if (!urlStr) return "";
  try {
    const u = new URL(urlStr, "http://localhost");
    return u.searchParams.get("token") || "";
  } catch {
    const m = String(urlStr).match(/token=([a-zA-Z0-9._-]+)/);
    return m ? m[1] : "";
  }
}

async function loadAllocationAndSession(session) {
  const allocationId = session.grant.allocation_id;
  const { data: allocation, error } = await session.db
    .from("compute_allocations")
    .select(
      "id,instance_type,gpu_name,workspace_ebs_gb,proposed_start_at,proposed_end_at,applications!inner(applicant_name,project_title),compute_sessions(*)",
    )
    .eq("id", allocationId)
    .single();
  if (error || !allocation) throw new Error("NOT_FOUND");

  if (!allocation.compute_hours && allocation.proposed_start_at && allocation.proposed_end_at) {
    const startMs = Date.parse(allocation.proposed_start_at);
    const endMs = Date.parse(allocation.proposed_end_at);
    allocation.compute_hours = Math.max(1, Math.round((endMs - startMs) / 3600000)) || 3;
  }

  const { data: csData } = await session.db
    .from("compute_sessions")
    .select("*")
    .eq("allocation_id", allocationId)
    .maybeSingle();

  const compute =
    csData ||
    (Array.isArray(allocation.compute_sessions)
      ? allocation.compute_sessions[0]
      : allocation.compute_sessions) ||
    null;

  return { allocation, compute };
}

export async function GET(request) {
  try {
    const session = await portalSession();
    if (!session) throw new Error("UNAUTHORIZED");
    try { await recordAuthenticatedPortalIp(request, session.grant.allocation_id); }
    catch (error) { console.error("Portal access logging unavailable", error?.name); }

    const { allocation, compute } = await loadAllocationAndSession(session);

    let status = compute?.status || "scheduled";
    const instanceId = compute?.ec2_instance_id || null;
    let ec2State = null;
    let publicIp = null;
    let lifecyclePhase = null;
    let exportProgress = null;
    let jupyterUrl = compute?.jupyter_url || null;
    const jupyterToken = extractTokenFromUrl(jupyterUrl);

    if (instanceId && awsConfigured()) {
      try {
        const info = await describeComputeInstance({ instanceId });
        ec2State = info.state;
        lifecyclePhase = info.lifecyclePhase;
        publicIp = info.publicIp;

        if (ec2State === "running" && publicIp !== process.env.AWS_LAB_PUBLIC_IP && Date.now() < Date.parse(allocation.proposed_end_at)) {
          await associateLabAddress(instanceId);
          publicIp = process.env.AWS_LAB_PUBLIC_IP;
        }

        if (ec2State === "running" && publicIp && Date.now() < Date.parse(allocation.proposed_end_at)) {
          const origin = `https://${labHost(allocation.id)}`;
          jupyterUrl = `${origin}/lab${jupyterToken ? `?token=${jupyterToken}` : ""}`;
          let ready = false;
          try {
            const response = await fetch(`${origin}/api/status`, {
              headers: { Authorization: `token ${jupyterToken}` },
              signal: AbortSignal.timeout(2500),
              cache: "no-store",
            });
            ready = response.ok;
          } catch {
            // The VM can be running while Jupyter is still starting.
          }
          if (!ready) {
            status = "provisioning";
            jupyterUrl = null;
          } else if (status !== "active") {
            status = "active";
            await session.db
              .from("compute_sessions")
              .update({
                status: "active",
                jupyter_url: jupyterUrl,
                ready_at: compute?.ready_at || new Date().toISOString(),
                started_at: compute?.started_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("allocation_id", allocation.id);
          }
        } else if (
          (ec2State === "terminated" || ec2State === "shutting-down") &&
          status !== "completed"
        ) {
          status = "completed";
          await session.db
            .from("compute_sessions")
            .update({
              status: "completed",
              ended_at: compute?.ended_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("allocation_id", allocation.id);
        }
      } catch {
        // Keep last known DB status if AWS describe transiently fails
      }
    }

    if (instanceId && Date.now() >= Date.parse(allocation.proposed_end_at)) {
      status = lifecyclePhase === "export-failed" ? "export_failed" : "exporting";
      if (s3Configured()) {
        try {
          if (await isArtifactReady({ allocationId: allocation.id })) status = "artifact_ready";
          else {
            exportProgress = await getExportProgress(allocation.id);
            if (exportProgress?.stage === "failed") status = "export_failed";
          }
        } catch (error) {
          console.error("Artifact readiness check failed", error);
        }
      }
    }

    return Response.json({
      allocationId: allocation.id,
      projectTitle: allocation.applications?.project_title,
      applicantName: allocation.applications?.applicant_name,
      gpuName: allocation.gpu_name,
      instanceType: allocation.instance_type,
      workspaceGb: allocation.workspace_ebs_gb,
      proposedStartAt: allocation.proposed_start_at,
      proposedEndAt: allocation.proposed_end_at,
      status,
      instanceId,
      ec2State,
      lifecyclePhase,
      exportProgress,
      publicIp,
      jupyterUrl:
        Date.now() < Date.parse(allocation.proposed_end_at) && jupyterUrl && jupyterUrl.startsWith("https://") ? jupyterUrl : null,
      jupyterToken: Date.now() < Date.parse(allocation.proposed_end_at) ? jupyterToken : null,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    assertOrigin(request);
    const session = await portalSession();
    if (!session) throw new Error("UNAUTHORIZED");

    let body = {};
    try {
      body = await jsonBody(request);
    } catch {
      body = {};
    }

    const { allocation, compute } = await loadAllocationAndSession(session);

    if (body?.action === "terminate") {
      return Response.json({ error: "Manual termination is unavailable while research files are not safely exported." }, { status: 409 });
    }

    const now = Date.now();
    const start = Date.parse(allocation.proposed_start_at);
    const end = Date.parse(allocation.proposed_end_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || now < start - 15 * 60 * 1000 || now >= end) {
      return Response.json({ error: "The session is outside its allocated access window." }, { status: 403 });
    }

    // If an active/provisioning instance is already running, return it instead of double-launching
    if (
      compute?.ec2_instance_id &&
      ["provisioning", "ready", "active"].includes(compute.status)
    ) {
      return Response.json({
        status: compute.status,
        instanceId: compute.ec2_instance_id,
        jupyterUrl:
          compute.jupyter_url && compute.jupyter_url.startsWith("https://")
            ? compute.jupyter_url
            : null,
      });
    }

    if (!allocation.instance_type || !VALID_INSTANCE_TYPES.includes(allocation.instance_type)) {
      throw new Error("ALLOCATION_INSTANCE_TYPE_INVALID");
    }

    if (process.env.AWS_LIFECYCLE_ENABLED !== "true") {
      return Response.json({ error: "Compute launch is temporarily unavailable while session lifecycle automation is being configured." }, { status: 503 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("DATABASE_UNAVAILABLE");
    const jupyterToken = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY)
      .update(`dcs-jupyter:${allocation.id}`).digest("hex");
    const launched = await launchComputeSession({
      allocationId: allocation.id,
      instanceType: allocation.instance_type,
      ebsGb: allocation.workspace_ebs_gb,
      sessionEnd: allocation.proposed_end_at,
      jupyterToken,
    });
    if (!launched.instanceId) throw new Error("AWS_LAUNCH_FAILED");
    const jupyterUrl = `https://${labHost(allocation.id)}/lab?token=${jupyterToken}`;
    const nowIso = new Date().toISOString();
    const record = {
      allocation_id: allocation.id,
      status: "provisioning",
      aws_region: process.env.AWS_REGION,
      ec2_instance_id: launched.instanceId,
      jupyter_url: jupyterUrl,
      provisioned_at: nowIso,
      updated_at: nowIso,
    };
    const { error } = await session.db.from("compute_sessions").upsert(record, { onConflict: "allocation_id" });
    if (error) throw new Error("DATABASE_UNAVAILABLE");
    return Response.json({ status: "provisioning", instanceId: launched.instanceId, publicIp: launched.publicIp });

  } catch (error) {
    if (error?.message === "AWS_UNAVAILABLE") {
      return Response.json(
        { error: "AWS compute credentials are not configured on this server." },
        { status: 503 },
      );
    }
    return failure(error);
  }
}

export async function DELETE(request) {
  try {
    assertOrigin(request);
    const session = await portalSession();
    if (!session) throw new Error("UNAUTHORIZED");

    return Response.json({ error: "Manual termination is unavailable while research files are not safely exported." }, { status: 409 });
  } catch (error) {
    return failure(error);
  }
}
