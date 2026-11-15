import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CalendarDays, Info } from "lucide-react";
import Navbar from "@/components/Navbar";
import AdminApplicationActions from "@/components/AdminApplicationActions";
import AttendanceReviewForm from "@/components/AttendanceReviewForm";
import FinalizeScheduleButton from "@/components/FinalizeScheduleButton";
import { adminUser, database } from "@/lib/server";
import { gmailConfigured } from "@/lib/mail";
import { readAuthenticatedAccessEvents } from "@/lib/monitoring";
import {
  applyAttendanceReviews,
  driveLink,
  evaluateParticipantStanding,
  formatDate,
  formatTime,
  parseChangeRequest,
  resolveEffectiveStatus,
} from "@/lib/validation.mjs";
export const metadata = {
  title: "Review application",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function ApplicationDetail({ params }) {
  if (!(await adminUser())) redirect("/admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = database();
  const { data: app, error } = await db
    .from("applications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !app) notFound();
  const { data: allocations } = await db
    .from("compute_allocations")
    .select(
      "id,gpu_name,status,proposed_start_at,proposed_end_at,compute_sessions(status),availability_confirmations(response_status,expires_at,change_request_note)",
    )
    .eq("application_id", id)
    .order("created_at", { ascending: false })
    .limit(5);
  const { data: reviews } = await db
    .from("application_reviews")
    .select("id,decision,note,created_at")
    .eq("application_id", id)
    .order("created_at", { ascending: false })
    .limit(5);
  const { data: revisionLogs } = await db
    .from("audit_logs")
    .select("id,actor_email,action,after_data,created_at")
    .eq("target_id", id)
    .eq("action", "submit_revision")
    .order("created_at", { ascending: false })
    .limit(5);

  const [{ data: emailApps }, { data: nimApps }] = await Promise.all([
    app.applicant_email
      ? db
          .from("applications")
          .select("id")
          .eq("applicant_email", app.applicant_email)
          .limit(50)
      : Promise.resolve({ data: [] }),
    app.student_id
      ? db
          .from("applications")
          .select("id")
          .eq("student_id", app.student_id)
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);
  const applicantAppIds = Array.from(
    new Set([
      id,
      ...(emailApps || []).map((a) => a.id),
      ...(nimApps || []).map((a) => a.id),
    ]),
  );
  const { data: historicalAllocations } = await db
    .from("compute_allocations")
    .select(
      "id,status,proposed_start_at,proposed_end_at,access_grants(redeemed_at,redeem_expires_at,revoked_at),compute_sessions(status)",
    )
    .in("application_id", applicantAppIds)
    .limit(50);

  const historyIds = (historicalAllocations || []).map((a) => a.id);
  const { data: attendanceReviews } = historyIds.length
    ? await db.from("audit_logs").select("target_id,after_data,actor_email,created_at,action").in("action", ["attendance_review", "attendance_evidence"]).eq("target_type", "allocation").in("target_id", historyIds).order("created_at", { ascending: false })
    : { data: [] };
  const accessEvents = {};
  const eligible = (historicalAllocations || []).filter((a) => a.proposed_end_at && Date.parse(a.proposed_end_at) <= Date.now());
  for (let i = 0; i < eligible.length; i += 5) {
    const batch = await Promise.allSettled(eligible.slice(i, i + 5).map((a) => readAuthenticatedAccessEvents(a.id)));
    batch.forEach((result, index) => {
      if (result.status === "fulfilled") accessEvents[eligible[i + index].id] = result.value;
    });
  }
  const reviewedHistorical = applyAttendanceReviews(historicalAllocations || [], attendanceReviews || [], accessEvents);
  const reviewedAllocations = applyAttendanceReviews(allocations || [], attendanceReviews || [], accessEvents);
  const standing = evaluateParticipantStanding(reviewedHistorical);
  const effectiveStatus = resolveEffectiveStatus({
    ...app,
    compute_allocations: reviewedAllocations,
  });
  const isScheduled =
    app.status === "scheduled" ||
    (allocations || []).some((a) => a.status === "scheduled");
  const canFinalize =
    !isScheduled &&
    (app.status === "user_confirmed" ||
      (allocations || []).some((a) => {
        const resp = Array.isArray(a.availability_confirmations)
          ? a.availability_confirmations[0]?.response_status
          : a.availability_confirmations?.response_status;
        return a.status === "user_confirmed" || resp === "confirmed";
      }));

  return (
    <>
      <Navbar />
      <main id="main" className="app-background">
        <div className="container dashboard">
          <Link href="/admin" className="back-link">
            <ArrowLeft size={14} />
            All applications
          </Link>
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">
                DCS-{id.slice(0, 8).toUpperCase()}
              </span>
              <h1>{app.project_title}</h1>
              <p>
                {app.applicant_name} · {app.student_id} ·{" "}
                {app.program || "Study program not recorded"}
              </p>
            </div>
            <div className="dashboard-badges">
              <span
                className={`status-badge ${standing.flagged ? "warning" : "good"}`}
              >
                {standing.label}
              </span>
              <span className={`status-badge status-${effectiveStatus}`}>
                {effectiveStatus.replaceAll("_", " ")}
              </span>
            </div>
          </div>
          {!app.program && (
            <div className="notice">
              <Info size={16} />
              Run the portal_workflow.sql migration to enable the latest
              application fields.
            </div>
          )}
          <div className="admin-detail">
            <div>
              <section className="panel">
                <h3>Applicant & documents</h3>
                <dl className="review-grid">
                  <div>
                    <dt>Name</dt>
                    <dd>{app.applicant_name}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{app.applicant_email}</dd>
                  </div>
                  <div>
                    <dt>Student ID (NIM)</dt>
                    <dd>{app.student_id}</dd>
                  </div>
                  <div>
                    <dt>Institution</dt>
                    <dd>{app.institution}</dd>
                  </div>
                </dl>
                <div className="document-links">
                  {[
                    ["KTM", app.ktm_drive_url],
                    ["Proposal", app.proposal_drive_url],
                  ].map(([label, url]) =>
                    driveLink(url) ? (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open {label}
                        <ArrowUpRight size={14} />
                      </a>
                    ) : (
                      <span className="field-hint" key={label}>
                        {label}: link unavailable
                      </span>
                    ),
                  )}
                </div>
                <p className="field-hint">
                  Open Drive using the admin account to which the student
                  granted Viewer access.
                </p>
              </section>
              <section className="panel">
                <h3>Applicant availability</h3>
                {app.availability_preferences?.length ? (
                  app.availability_preferences.map((p, i) => (
                    <div className="notice" key={i}>
                      <CalendarDays size={16} />
                      <span>
                        {formatDate(`${p.date}T12:00:00+07:00`)}
                        <br />
                        {p.start}–{p.end} WIB
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="field-hint">No time preferences yet.</p>
                )}
              </section>
              <section className="panel">
                <h3>Allocation history</h3>
                {standing.needsReview && (
                  <div className="notice"><Info size={16} /><span>Historical attendance is unconfirmed. A missing compute-session record or expired access grant does not establish a no-show. Review the evidence below before recording a decision.</span></div>
                )}
                {reviewedAllocations.length ? (
                  reviewedAllocations.map((a) => {
                    const conf = Array.isArray(a.availability_confirmations)
                      ? a.availability_confirmations[0]
                      : a.availability_confirmations;
                    const resp = conf?.response_status || "None yet";
                    const changeRequest =
                      resp === "declined" && conf?.change_request_note
                        ? parseChangeRequest(conf.change_request_note)
                        : null;
                    return (
                      <div className="notice" key={a.id}>
                        <CalendarDays size={16} />
                        <span>
                          <strong>{a.gpu_name}</strong> ·{" "}
                          {a.status.replaceAll("_", " ")}
                          <br />
                          {formatDate(a.proposed_start_at)} ·{" "}
                          {formatTime(a.proposed_start_at)}–
                          {formatTime(a.proposed_end_at)} WIB
                          <br />
                          Response: {resp}
                          {a.attendance_status && <><br />Attendance review: {a.attendance_status}{a.attendance_reason ? ` · ${a.attendance_reason}` : ""}</>}
                          {changeRequest &&
                            (changeRequest.note ||
                              changeRequest.alternativeSlots.length > 0) && (
                              <div
                                style={{
                                  marginTop: 10,
                                  paddingTop: 10,
                                  borderTop: "1px solid #dce8fb",
                                }}
                              >
                                {changeRequest.note && (
                                  <div style={{ marginBottom: 6 }}>
                                    <strong>Decline note:</strong>{" "}
                                    {changeRequest.note}
                                  </div>
                                )}
                                {changeRequest.alternativeSlots.length > 0 && (
                                  <div>
                                    <strong>
                                      Student-proposed alternatives:
                                    </strong>
                                    <ul
                                      style={{
                                        margin: "4px 0 0",
                                        paddingLeft: 18,
                                      }}
                                    >
                                      {changeRequest.alternativeSlots.map(
                                        (s, idx) => (
                                          <li key={idx}>
                                            Slot {idx + 1}:{" "}
                                            {formatDate(
                                              `${s.date}T12:00:00+07:00`,
                                            )}{" "}
                                            · {s.start}–{s.end} WIB
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                        </span>
                        {Date.parse(a.proposed_end_at) <= Date.now() && a.status !== "cancelled" && (
                          <AttendanceReviewForm applicationId={id} allocation={a} />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="field-hint">
                    Proposed timeslots will appear here after they are sent.
                  </p>
                )}
                <FinalizeScheduleButton
                  applicationId={id}
                  canFinalize={canFinalize}
                  isScheduled={isScheduled}
                />
              </section>
              {reviews?.length > 0 && (
                <section className="panel">
                  <h3>Review history</h3>
                  {reviews.map((r) => (
                    <div key={r.id} style={{ marginBottom: 16 }}>
                      <strong style={{ fontSize: 12 }}>
                        {r.decision.replaceAll("_", " ")}
                      </strong>
                      <p className="field-hint">
                        {r.note || "No note provided"} ·{" "}
                        {formatDate(r.created_at)}
                      </p>
                    </div>
                  ))}
                </section>
              )}
              {standing.reasons?.length > 0 && (
                <section className="panel">
                  <h3>Standing history and reasons</h3>
                  {standing.reasons.map((reason, index) => <p className="field-hint" key={index}>{reason}</p>)}
                </section>
              )}
            </div>
            <div>
              {revisionLogs?.length > 0 && (
                <section
                  className="panel admin-revision-banner"
                  role="region"
                  aria-label="Submitted Revision"
                >
                  <div className="admin-revision-header">
                    <div>
                      <span className="eyebrow">APPLICANT RESPONSE</span>
                      <h3>Submitted Revision</h3>
                    </div>
                    <span className="status-badge status-under_review">
                      {formatDate(revisionLogs[0].created_at)} ·{" "}
                      {formatTime(revisionLogs[0].created_at)} WIB
                    </span>
                  </div>
                  <div className="admin-revision-note">
                    {revisionLogs[0].after_data?.note ||
                      "No revision note recorded."}
                  </div>
                  {(driveLink(revisionLogs[0].after_data?.proposal_drive_url) ||
                    driveLink(revisionLogs[0].after_data?.ktm_drive_url)) && (
                    <div
                      className="document-links"
                      style={{ margin: "14px 0 0" }}
                    >
                      {driveLink(
                        revisionLogs[0].after_data?.proposal_drive_url,
                      ) && (
                        <a
                          href={revisionLogs[0].after_data.proposal_drive_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Updated Proposal
                          <ArrowUpRight size={14} />
                        </a>
                      )}
                      {driveLink(revisionLogs[0].after_data?.ktm_drive_url) && (
                        <a
                          href={revisionLogs[0].after_data.ktm_drive_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Updated KTM
                          <ArrowUpRight size={14} />
                        </a>
                      )}
                    </div>
                  )}
                </section>
              )}
              <AdminApplicationActions
                applicationId={id}
                status={app.status}
                rejectionNote={
                  reviews?.find((r) => r.decision === "rejected")?.note ||
                  reviews?.[0]?.note ||
                  ""
                }
                preferences={app.availability_preferences || []}
                mailReady={gmailConfigured()}
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
