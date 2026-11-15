import { Cpu, Info, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import LogoutButton from "@/components/LogoutButton";
import AdminApplicationsTable from "@/components/AdminApplicationsTable";
import AdminComputeMonitoring from "@/components/AdminComputeMonitoring";
import { adminUser, database } from "@/lib/server";
import {
  applyAttendanceReviews,
  computeAdminAnalytics,
  evaluateParticipantStanding,
  resolveEffectiveStatus,
} from "@/lib/validation.mjs";
import { readAuthenticatedAccessEvents } from "@/lib/monitoring";
export const metadata = {
  title: "Admin dashboard",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }) {
  const user = await adminUser();
  const params = await searchParams;
  if (!user)
    return (
      <>
        <Navbar />
        <main id="main" className="app-background">
          <div className="container admin-login">
            <div className="form-card">
              <span className="login-icon">
                <ShieldCheck size={25} color="#1e73e8" />
              </span>
              <h1 style={{ marginTop: 22 }}>Hello, research enabler.</h1>
              <p>
                Sign in as a DCS admin to review proposals, propose schedules,
                and manage compute access.
              </p>
              {params.error && (
                <div className="notice error" role="alert">
                  <Info size={16} />
                  <span>
                    {params.error === "google-disabled"
                      ? "Google sign-in is disabled in Supabase. Enable the Google provider in Authentication using your admin sign-in OAuth client."
                      : params.error === "forbidden"
                        ? "This Google account does not have DCS admin access."
                        : "Sign-in failed. Check the Google provider and callback settings in Supabase."}
                  </span>
                </div>
              )}
              <a className="button button-outline" href="/api/auth/google">
                <span className="google-g">G</span>Continue with Google
              </a>
              <p
                className="field-hint"
                style={{ marginTop: 18, marginBottom: 0 }}
              >
                Only the allowlisted admin Google account can access this
                dashboard.
              </p>
            </div>
          </div>
        </main>
      </>
    );
  let rows = [];
  let unavailable = false;
  try {
    const { data, error } = await database()
      .from("applications")
      .select(
        "id,applicant_name,applicant_email,student_id,project_title,status,created_at,compute_allocations(id,status,instance_type,gpu_name,proposed_start_at,proposed_end_at,access_grants(redeemed_at,redeem_expires_at,revoked_at),compute_sessions(status,ec2_instance_id))",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) unavailable = true;
    else rows = data || [];
  } catch {
    unavailable = true;
  }
  const allocationRows = rows.flatMap((row) => Array.isArray(row.compute_allocations)
    ? row.compute_allocations
    : row.compute_allocations ? [row.compute_allocations] : []);
  const allocationIds = allocationRows.map((allocation) => allocation.id).filter(Boolean);
  let attendanceAuditLogs = [];
  if (allocationIds.length) {
    try {
      const { data, error } = await database().from("audit_logs")
        .select("target_id,action,target_type,after_data,created_at,actor_email")
        .in("action", ["attendance_review", "attendance_evidence"])
        .eq("target_type", "allocation")
        .in("target_id", allocationIds);
      if (!error) attendanceAuditLogs = data || [];
    } catch { /* The ordinary admin view remains available without audit history. */ }
  }
  const monitoringCutoff = Date.now() - 30 * 24 * 60 * 60_000;
  const recentPastAllocations = allocationRows.filter((allocation) => {
    const end = Date.parse(allocation.proposed_end_at || "");
    return Number.isFinite(end) && end <= Date.now() && end >= monitoringCutoff && allocation.id;
  }).slice(0, 20);
  const verifiedAttendanceEntries = await Promise.all(recentPastAllocations.map(async (allocation) => {
    try {
      return [allocation.id, await readAuthenticatedAccessEvents(allocation.id)];
    } catch {
      return [allocation.id, []];
    }
  }));
  const verifiedAttendance = Object.fromEntries(verifiedAttendanceEntries);
  const existingEvidence = new Set(attendanceAuditLogs.filter((entry) => entry.action === "attendance_evidence").map((entry) => entry.target_id));
  const newEvidence = verifiedAttendanceEntries.flatMap(([id, events]) => {
    const event = events.find((item) => item.source === "jupyter" && item.authenticated && ["contents", "sessions", "kernels"].includes(item.category) && [200, 201, 204, 101].includes(item.status));
    return event && !existingEvidence.has(id) ? [{ actor_type: "system", action: "attendance_evidence", target_type: "allocation", target_id: id, after_data: { verified: true, source: "jupyter", observed_at: event.timestamp } }] : [];
  });
  if (newEvidence.length) {
    try { await database().from("audit_logs").insert(newEvidence); }
    catch { /* Attendance stays unknown if durable evidence cannot be saved. */ }
  }
  const reviewedAllocations = applyAttendanceReviews(allocationRows, attendanceAuditLogs, verifiedAttendance);
  const reviewedById = new Map(reviewedAllocations.map((allocation) => [allocation.id, allocation]));
  rows = rows.map((row) => ({
    ...row,
    compute_allocations: (Array.isArray(row.compute_allocations) ? row.compute_allocations : row.compute_allocations ? [row.compute_allocations] : [])
      .map((allocation) => reviewedById.get(allocation.id) || allocation),
  }));
  const historyByEmail = new Map();
  const historyByNim = new Map();
  for (const r of rows) {
    const allocs = Array.isArray(r.compute_allocations)
      ? r.compute_allocations
      : r.compute_allocations
        ? [r.compute_allocations]
        : [];
    const emailKey = r.applicant_email?.toLowerCase();
    if (emailKey) {
      historyByEmail.set(emailKey, [
        ...(historyByEmail.get(emailKey) || []),
        ...allocs,
      ]);
    }
    if (r.student_id) {
      historyByNim.set(r.student_id, [
        ...(historyByNim.get(r.student_id) || []),
        ...allocs,
      ]);
    }
  }
  const now = new Date();
  const standingForRow = (r) => {
    const emailKey = r.applicant_email?.toLowerCase();
    const combined = [
      ...(emailKey ? historyByEmail.get(emailKey) || [] : []),
      ...(r.student_id ? historyByNim.get(r.student_id) || [] : []),
    ];
    return evaluateParticipantStanding(combined, now);
  };
  const enrichedRows = rows.map((r) => ({
    ...r,
    effectiveStatus: resolveEffectiveStatus(r, now),
    standing: standingForRow(r),
  }));
  const analytics = computeAdminAnalytics(enrichedRows, now);
  return (
    <>
      <Navbar />
      <main id="main" className="app-background">
        <div className="container dashboard">
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">DCS COMPUTE · ADMIN</span>
              <h1>Make room for good ideas.</h1>
              <p>{user.email}</p>
            </div>
            <LogoutButton />
          </div>
          <div className="admin-summary">
            <div>
              <strong>{analytics.total}</strong>
              <span>Total Applicants (Daftar)</span>
            </div>
            <div>
              <strong>{analytics.awaitingReview}</strong>
              <span>Under Review / Awaiting Review</span>
            </div>
            <div>
              <strong>{analytics.revisionRequested}</strong>
              <span>Revisions Requested (Revisi)</span>
            </div>
            <div>
              <strong>{analytics.confirmedOrScheduled}</strong>
              <span>Scheduled / Completed (Diterima)</span>
            </div>
            <div>
              <strong>{analytics.unattended}</strong>
              <span>Unattended (No-Show)</span>
            </div>
            <div>
              <strong>{analytics.rejected}</strong>
              <span>Rejected (Ditolak)</span>
            </div>
          </div>
          <section className="admin-gpu-panel" aria-label="EC2 GPU compute usage breakdown">
            <div className="admin-gpu-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Cpu size={16} color="#1e73e8" />
                <h2>EC2 GPU Compute Usage Breakdown</h2>
              </div>
              <span className="field-hint" style={{ margin: 0 }}>
                Allocations & total scheduled compute hours by instance type
              </span>
            </div>
            <div className="admin-gpu-grid">
              {analytics.gpuBreakdown.map((item) => (
                <div className="admin-gpu-card" key={item.key}>
                  <div>
                    <strong>{item.display}</strong>
                    <small>{item.count} allocation{item.count === 1 ? "" : "s"}</small>
                  </div>
                  <div className="admin-gpu-metrics">
                    <strong>{item.hours} hrs</strong>
                    <small>total compute</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <AdminComputeMonitoring />
          {unavailable && (
            <div className="notice error">
              The database could not be loaded. Check the Supabase connection
              and schema.
            </div>
          )}
          <AdminApplicationsTable rows={enrichedRows} />
        </div>
      </main>
    </>
  );
}
