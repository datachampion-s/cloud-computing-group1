import {
  assertOrigin,
  database,
  failure,
  hash,
  jsonBody,
  limited,
} from "@/lib/server";
import {
  serializeChangeRequest,
  validateDeclineAlternatives,
} from "@/lib/validation.mjs";
import {
  gmailConfigured,
  scheduleConfirmedAdminEmail,
  scheduleDeclinedAdminEmail,
  sendTransactionalEmail,
} from "@/lib/mail";
export async function POST(request) {
  try {
    assertOrigin(request);
    const body = await jsonBody(request);
    await limited(request, "confirmation", 30);
    if (
      !["inspect", "respond"].includes(body.action) ||
      !["confirmed", "declined"].includes(body.response) ||
      typeof body.token !== "string" ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(body.token)
    )
      throw new Error("INVALID_BODY");
    const db = database();
    const tokenHash = hash(body.token);
    const tokenColumn =
      body.response === "confirmed"
        ? "confirm_token_hash"
        : "decline_token_hash";
    if (body.action === "respond") {
      let declineCheck = { alternativeSlots: [], note: "" };
      if (body.response === "declined") {
        declineCheck = validateDeclineAlternatives(
          body.alternativeSlots,
          body.note,
        );
        if (!declineCheck.valid) {
          return Response.json({ error: declineCheck.error }, { status: 400 });
        }
      }
      const { data: beforeRow } = await db
        .from("availability_confirmations")
        .select(
          "id,response_status,allocation_id,compute_allocations!inner(id,application_id,gpu_name,workspace_ebs_gb,proposed_start_at,proposed_end_at,applications!inner(id,applicant_name,applicant_email,project_title))",
        )
        .eq(tokenColumn, tokenHash)
        .maybeSingle();
      const wasPending = beforeRow?.response_status === "pending";
      const { data, error } = await db.rpc("portal_respond", {
        p_token_hash: tokenHash,
        p_response: body.response,
      });
      if (error)
        return Response.json(
          {
            error:
              "This link is invalid, expired, or the schedule has changed. Please contact the DCS admin.",
          },
          { status: 400 },
        );
      if (wasPending && data === body.response && beforeRow) {
        if (body.response === "declined") {
          const serialized = serializeChangeRequest(
            declineCheck.alternativeSlots,
            declineCheck.note,
          );
          await db
            .from("availability_confirmations")
            .update({ change_request_note: serialized })
            .eq("id", beforeRow.id);
        }
        const notificationEmail = (
          process.env.APPLICATION_NOTIFICATION_EMAIL ||
          ""
        ).trim();
        const alloc = beforeRow.compute_allocations;
        const app = Array.isArray(alloc?.applications)
          ? alloc.applications[0]
          : alloc?.applications;
        if (gmailConfigured() && notificationEmail && alloc && app) {
          const origin =
            process.env.APP_URL || new URL(request.url).origin;
          const emailPayload =
            body.response === "confirmed"
              ? scheduleConfirmedAdminEmail({
                  applicationId: app.id,
                  applicantName: app.applicant_name,
                  applicantEmail: app.applicant_email,
                  projectTitle: app.project_title,
                  allocation: alloc,
                  origin,
                })
              : scheduleDeclinedAdminEmail({
                  applicationId: app.id,
                  applicantName: app.applicant_name,
                  applicantEmail: app.applicant_email,
                  projectTitle: app.project_title,
                  allocation: alloc,
                  note: declineCheck.note,
                  alternativeSlots: declineCheck.alternativeSlots,
                  origin,
                });
          try {
            await sendTransactionalEmail({
              recipient: notificationEmail,
              subject: emailPayload.subject,
              template:
                body.response === "confirmed"
                  ? "schedule_confirmed_admin"
                  : "schedule_declined_admin",
              allocationId: alloc.id,
              applicationId: app.id,
              text: emailPayload.text,
              html: emailPayload.html,
              db,
            });
          } catch {
            // Do not fail student confirmation if admin email notification encounters a transient error.
          }
        }
      }
      return Response.json({ responseStatus: data });
    }
    const { data, error } = await db
      .from("availability_confirmations")
      .select(
        "response_status,expires_at,compute_allocations!inner(gpu_name,workspace_ebs_gb,proposed_start_at,proposed_end_at,confirmation_expires_at,status)",
      )
      .eq(tokenColumn, tokenHash)
      .maybeSingle();
    if (
      error ||
      !data ||
      Date.parse(data.expires_at) <= Date.now() ||
      !["awaiting_availability", "user_confirmed"].includes(
        data.compute_allocations.status,
      )
    )
      return Response.json(
        {
          error:
            "This link is invalid, expired, or the schedule has changed. Please contact the DCS admin.",
        },
        { status: 400 },
      );
    return Response.json({
      allocation: data.compute_allocations,
      responseStatus: data.response_status,
    });
  } catch (error) {
    return failure(error);
  }
}
