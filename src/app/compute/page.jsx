import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  FileArchive,
  Info,
  Monitor,
  ShieldCheck,
  Check,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import PortalLogin from "@/components/PortalLogin";
import SessionClock from "@/components/SessionClock";
import ExportProgress from "@/components/ExportProgress";
import LogoutButton from "@/components/LogoutButton";
import { portalSession } from "@/lib/server";
import { isArtifactReady, listSessionArtifacts, s3Configured } from "@/lib/aws";
import { formatDate, formatTime } from "@/lib/validation.mjs";
export const metadata = {
  title: "Compute portal",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
const statuses = {
  scheduled: "Scheduled",
  provisioning: "Preparing workspace",
  ready: "Workspace ready",
  active: "Compute active",
  exporting: "Exporting files",
  artifact_ready: "Files ready",
  completed: "Completed",
  capacity_failed: "Capacity unavailable",
  provision_failed: "Admin assistance required",
  export_failed: "Export needs attention",
  recovery_required: "Data recovery",
  cancelled: "Cancelled",
};
export default async function ComputePage() {
  const session = await portalSession();
  if (!session)
    return (
      <>
        <Navbar />
        <main id="main" className="app-background">
          <div className="container">
            <Link href="/landing" className="back-link">
              <ArrowLeft size={14} />
              Back to home
            </Link>
            <div className="portal-layout">
              <div className="portal-welcome">
                <span className="eyebrow">DCS COMPUTE ACCESS</span>
                <h1>
                  A little more power.
                  <br />
                  <em>A lot more potential.</em>
                </h1>
                <p>
                  Your next discovery starts with a place to explore. Welcome to
                  your research workspace.
                </p>
                <Image
                  src="/images/compute-cluster.png"
                  alt="GPU compute environment illustration"
                  width={1536}
                  height={1024}
                />
              </div>
              <PortalLogin />
            </div>
          </div>
        </main>
      </>
    );
  const { data: allocation, error } = await session.db
    .from("compute_allocations")
    .select(
      "id,gpu_name,workspace_ebs_gb,proposed_start_at,proposed_end_at,applications!inner(applicant_name,project_title),compute_sessions(status,jupyter_url,ec2_instance_id)",
    )
    .eq("id", session.grant.allocation_id)
    .single();
  if (error || !allocation)
    return (
      <>
        <Navbar />
        <main id="main" className="app-background">
          <div className="container center-page">
            <div className="notice error">
              Your allocation could not be loaded. Please refresh the page or
              contact the admin.
            </div>
          </div>
        </main>
      </>
    );
  let artifacts = [];
  let artifactsUnavailable = false;
  if (s3Configured() && Date.now() < Date.parse(allocation.proposed_end_at) + 7 * 86400000) {
    try {
      artifacts = (await isArtifactReady({ allocationId: allocation.id }) ? await listSessionArtifacts({ allocationId: allocation.id }) : [])
        .filter((item) => item.filename === "artifacts.zip")
        .map((item) => ({ ...item, id: item.key, verified_at: null }));
    } catch {
      artifactsUnavailable = true;
    }
  }
  const compute = Array.isArray(allocation.compute_sessions)
    ? allocation.compute_sessions[0]
    : allocation.compute_sessions;
  const status = compute?.status || "scheduled";
  const duration =
    (Date.parse(allocation.proposed_end_at) -
      Date.parse(allocation.proposed_start_at)) /
    3600000;
  return (
    <>
      <Navbar />
      <main id="main" className="app-background">
        <div className="container dashboard">
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">YOUR RESEARCH WORKSPACE</span>
              <h1>
                Welcome, {allocation.applications.applicant_name.split(" ")[0]}.
              </h1>
              <p>{allocation.applications.project_title}</p>
            </div>
            <LogoutButton portal />
          </div>
          <div className="dashboard-columns">
            <div>
              <section className="panel">
                <div className="panel-title">
                  <h2>My compute session</h2>
                  <span
                    className={`status-badge ${status === "active" ? "active" : ""}`}
                  >
                    {statuses[status] || status}
                  </span>
                </div>
                <div className="session-date">
                  {formatDate(allocation.proposed_start_at, {
                    weekday: "long",
                  })}
                </div>
                <div className="session-time">
                  {formatTime(allocation.proposed_start_at)}–
                  {formatTime(allocation.proposed_end_at)} WIB
                </div>
                <div className="allocation-stats">
                  <div>
                    <span>Assigned GPU</span>
                    <strong>{allocation.gpu_name}</strong>
                  </div>
                  <div>
                    <span>Duration</span>
                    <strong>{duration} hours</strong>
                  </div>
                  <div>
                    <span>Workspace</span>
                    <strong>{allocation.workspace_ebs_gb} GB</strong>
                  </div>
                </div>
                <SessionClock
                  start={allocation.proposed_start_at}
                  end={allocation.proposed_end_at}
                  initialStatus={status}
                  initialJupyterUrl={compute?.jupyter_url}
                />
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h2>My research files</h2>
                  <FileArchive size={19} />
                </div>
                <div className="retention-notice">
                  <Clock3 size={15} />
                  <span>
                    Research artifacts and compute outputs remain preserved and downloadable for <strong>7 days</strong> after your session concludes.
                  </span>
                </div>
                {artifacts?.length ? (
                  artifacts.map((a) => (
                    <div key={a.id} className="notice">
                      <FileArchive size={18} />
                      <span>
                        <strong>{a.filename}</strong>
                        <br />
                        {(a.bytes / 1048576).toFixed(1)} MB ·{" "}
                        Verified
                        <br />
                        <a
                          href={`/api/portal/download?file=${encodeURIComponent(a.filename)}`}
                          className="support-link"
                          style={{ marginTop: 4 }}
                        >
                          Download artifact
                          <ArrowUpRight size={13} />
                        </a>
                      </span>
                    </div>
                  ))
                ) : artifactsUnavailable ? (
                  <div className="notice error">Files are temporarily unavailable. Please try again later or contact the admin.</div>
                ) : (
                  <ExportProgress end={allocation.proposed_end_at} hasSession={!!compute?.ec2_instance_id} />
                )}
              </section>
            </div>
            <aside>
              <section className="panel">
                <div className="panel-title">
                  <h2>Portal access</h2>
                  <ShieldCheck size={18} />
                </div>
                <p className="field-hint">
                  Your portal access remains available for at least seven days
                  after your compute session ends.
                </p>
                <div className="access-expiry">
                  <span>Access expires</span>
                  <strong>
                    {formatDate(session.grant.portal_access_expires_at)}
                  </strong>
                  {formatTime(session.grant.portal_access_expires_at)} WIB
                </div>
                <p className="field-hint" style={{ marginTop: 15 }}>
                  Portal access and compute time have separate deadlines.
                  Download your files before this access period ends.
                </p>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h2>Make every minute count.</h2>
                  <Clock3 size={18} />
                </div>
                <ul className="portal-sidebar-list">
                  <li>
                    <Check size={15} />
                    Save model and optimizer checkpoints regularly.
                  </li>
                  <li>
                    <Check size={15} />
                    Dataset folders and cache files are excluded from the export.
                  </li>
                  <li>
                    <Check size={15} />
                    Check the countdown before starting another training run.
                  </li>
                </ul>
                <Link href="/landing#guide" className="support-link">
                  Open research guide <ArrowUpRight size={14} />
                </Link>
              </section>
              <a
                className="support-link"
                href="https://instagram.com/datachampion.s"
                target="_blank"
                rel="noreferrer"
              >
                <Info size={15} />
                Need help? Contact DCS
              </a>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
