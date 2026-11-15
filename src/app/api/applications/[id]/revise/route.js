import {
  assertOrigin,
  database,
  failure,
  jsonBody,
  limited,
  timingSafeMatch,
} from "@/lib/server";
import { validateRevisionSubmission } from "@/lib/validation.mjs";
import {
  gmailConfigured,
  revisionSubmittedAdminEmail,
  sendTransactionalEmail,
} from "@/lib/mail";

export async function POST(request, { params }) {
  try {
    assertOrigin(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("INVALID_BODY");

    const body = await jsonBody(request);
    await limited(request, "revise", 15);

    const validation = validateRevisionSubmission(body);
    if (!validation.valid) {
      return Response.json(
        {
          error:
            Object.values(validation.errors)[0] ||
            "Please review your revision details.",
          errors: validation.errors,
        },
        { status: 400 },
      );
    }

    const db = database();
    const { data: application, error: appErr } = await db
      .from("applications")
      .select(
        "id,applicant_name,applicant_email,project_title,status,proposal_drive_url,ktm_drive_url,submission_key",
      )
      .eq("id", id)
      .maybeSingle();

    if (appErr || !application) {
      return Response.json(
        { error: "Application not found." },
        { status: 404 },
      );
    }

    const submittedKey = validation.value.key;
    // Legacy applications without a submission key fall back to the application ID.
    const expectedKey = application.submission_key
      ? String(application.submission_key)
      : String(application.id);
    const validKey = Boolean(submittedKey) && timingSafeMatch(submittedKey, expectedKey);

    if (!validKey) {
      return Response.json(
        {
          error:
            "Invalid submission key. Please use the direct revision link from your email.",
        },
        { status: 403 },
      );
    }

    if (application.status !== "revision_requested") {
      return Response.json(
        {
          error:
            "This application is not currently awaiting a proposal revision.",
        },
        { status: 409 },
      );
    }

    const { data: latestReview } = await db
      .from("application_reviews")
      .select("note,decision,created_at")
      .eq("application_id", id)
      .eq("decision", "revision_requested")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextProposalUrl =
      validation.value.proposal_drive_url || application.proposal_drive_url;
    const nextKtmUrl =
      validation.value.ktm_drive_url || application.ktm_drive_url;

    const { error: updateErr } = await db
      .from("applications")
      .update({
        status: "under_review",
        proposal_drive_url: nextProposalUrl,
        ktm_drive_url: nextKtmUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "revision_requested");

    if (updateErr) {
      throw new Error("DATABASE_UNAVAILABLE");
    }

    await db.from("audit_logs").insert({
      actor_type: "applicant",
      actor_email: application.applicant_email,
      action: "submit_revision",
      target_type: "application",
      target_id: id,
      after_data: {
        note: validation.value.note,
        proposal_drive_url: nextProposalUrl,
        ktm_drive_url: nextKtmUrl,
      },
    });

    const notificationEmail = (
      process.env.APPLICATION_NOTIFICATION_EMAIL ||
      process.env.ADMIN_EMAIL ||
      ""
    ).trim();

    if (gmailConfigured() && notificationEmail) {
      const origin = process.env.APP_URL || new URL(request.url).origin;
      const emailPayload = revisionSubmittedAdminEmail({
        applicationId: id,
        applicantName: application.applicant_name,
        applicantEmail: application.applicant_email,
        projectTitle: application.project_title,
        previousFeedback: latestReview?.note || "",
        revisionNote: validation.value.note,
        proposalDriveUrl: nextProposalUrl,
        ktmDriveUrl: nextKtmUrl,
        origin,
      });
      try {
        await sendTransactionalEmail({
          recipient: notificationEmail,
          subject: emailPayload.subject,
          template: "revision_submitted_admin",
          applicationId: id,
          text: emailPayload.text,
          html: emailPayload.html,
          db,
        });
      } catch {
        // Revision state is saved; do not fail student request if admin email notification fails.
      }
    }

    return Response.json({
      ok: true,
      status: "under_review",
      message:
        "Your proposal revision has been submitted and is now under review.",
    });
  } catch (err) {
    return failure(err);
  }
}
