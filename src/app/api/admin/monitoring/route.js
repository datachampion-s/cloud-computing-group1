import { adminUser, database } from "@/lib/server";
import { describeComputeInstance, listExportWorkers } from "@/lib/aws";
import { readAuthenticatedAccessEvents } from "@/lib/monitoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await adminUser();
  if (!user) return Response.json({ error: "Administrator sign-in is required." }, { status: 401 });

  try {
    const { data, error } = await database()
      .from("compute_allocations")
      .select("id,status,instance_type,gpu_name,workspace_ebs_gb,proposed_start_at,proposed_end_at,applications(applicant_name,applicant_email,student_id,project_title),compute_sessions(ec2_instance_id,status)")
      .not("compute_sessions.ec2_instance_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("DATABASE_UNAVAILABLE");

    const sessions = (data || []).flatMap((allocation) => {
      const nested = Array.isArray(allocation.compute_sessions) ? allocation.compute_sessions : [allocation.compute_sessions];
      return nested.filter((session) => session?.ec2_instance_id).map((session) => ({ allocation, session }));
    }).slice(0, 20);

    const [items, workersResult] = await Promise.all([
      Promise.all(sessions.map(async ({ allocation, session }) => {
        const [instance, access] = await Promise.allSettled([
          describeComputeInstance({ instanceId: session.ec2_instance_id }),
          readAuthenticatedAccessEvents(allocation.id),
        ]);
        return {
          allocationId: allocation.id,
          applicant: allocation.applications,
          startAt: allocation.proposed_start_at,
          endAt: allocation.proposed_end_at,
          status: session.status || allocation.status,
          instanceId: session.ec2_instance_id,
          instanceType: allocation.instance_type || instance.value?.instanceType || null,
          gpuName: allocation.gpu_name || null,
          storageGb: allocation.workspace_ebs_gb || null,
          publicIp: instance.status === "fulfilled" ? instance.value.publicIp : null,
          instanceState: instance.status === "fulfilled" ? instance.value.state : "unavailable",
          accessEvents: access.status === "fulfilled" ? access.value : [],
          accessUnavailable: access.status === "rejected",
          hasVerifiedJupyterAccess: access.status === "fulfilled" && access.value.some((event) => event.source === "jupyter"),
          lastVerifiedJupyterAccessAt: access.status === "fulfilled" ? access.value.find((event) => event.source === "jupyter")?.timestamp || null : null,
        };
      })),
      listExportWorkers().catch(() => []),
    ]);

    return Response.json({
      items: items.filter((item) => ["running", "pending", "stopping", "unavailable"].includes(item.instanceState)),
      workers: workersResult,
      updatedAt: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "Live monitoring is unavailable. Check the monitoring IAM policy, AWS region, log group, and database connection." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
