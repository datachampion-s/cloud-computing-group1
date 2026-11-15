import {
  adminUser,
  assertOrigin,
  database,
  failure,
  hash,
  jsonBody,
  secret,
} from "@/lib/server";
import { generateAccessToken, validSlot } from "@/lib/validation.mjs";
import {
  gmailConfigured,
  revisionRequestedEmail,
  applicationRejectedEmail,
  sendAvailability,
  sendInvitationToken,
  sendTransactionalEmail,
} from "@/lib/mail";
const catalog = {
  t4: ["NVIDIA T4", "g4dn.xlarge"],
  a10g: ["NVIDIA A10G", "g5.xlarge"],
  l4: ["NVIDIA L4", "g6.xlarge"],
};
export async function POST(request, { params }) {
  try {
    assertOrigin(request);
    const user = await adminUser();
    if (!user) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("INVALID_BODY");
    const body = await jsonBody(request);
    const db = database();
    if (body.action === "attendance_review") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (
        !/^[0-9a-f-]{36}$/i.test(body.allocationId || "") ||
        !["attended", "unattended", "excused"].includes(body.resolution) ||
        reason.length < 5 || reason.length > 1000
      ) throw new Error("INVALID_BODY");
      const { data: allocation, error: lookupError } = await db
        .from("compute_allocations")
        .select("id,status,proposed_end_at")
        .eq("id", body.allocationId)
        .eq("application_id", id)
        .maybeSingle();
      if (lookupError) throw new Error("DATABASE_UNAVAILABLE");
      if (!allocation || !["scheduled", "completed", "unattended", "no_show"].includes(allocation.status) || !allocation.proposed_end_at || Date.parse(allocation.proposed_end_at) > Date.now())
        throw new Error("INVALID_BODY");
      const { error } = await db.from("audit_logs").insert({
        actor_type: "admin",
        actor_email: user.email,
        action: "attendance_review",
        target_type: "allocation",
        target_id: allocation.id,
        after_data: { status: body.resolution, reason },
      });
      if (error) throw new Error("DATABASE_UNAVAILABLE");
      return Response.json({ message: "Attendance review saved and audited." });
    }
    if (body.action === "review") {
      if (
        !["approved_in_principle", "revision_requested", "rejected"].includes(
          body.decision,
        ) ||
        typeof body.note !== "string" ||
        body.note.length > 2000
      )
        throw new Error("INVALID_BODY");
      const { error } = await db.rpc("portal_review", {
        p_application_id: id,
        p_decision: body.decision,
        p_note: body.note,
        p_admin: user.email,
      });
      if (error)
        return Response.json(
          {
            error:
              "The decision could not be saved. Check the schema and whether the schedule has already been finalized.",
          },
          { status: 409 },
        );
      if (
        body.decision === "revision_requested" ||
        body.decision === "rejected"
      ) {
        const { data: application } = await db
          .from("applications")
          .select("id,applicant_name,applicant_email,project_title,submission_key")
          .eq("id", id)
          .single();
        if (application && gmailConfigured()) {
          const origin = process.env.APP_URL || "http://localhost:3000";
          const emailContent =
            body.decision === "revision_requested"
              ? revisionRequestedEmail({
                  id: application.id || id,
                  submission_key:
                    application.submission_key || application.id || id,
                  name: application.applicant_name,
                  title: application.project_title,
                  note: body.note,
                  adminEmail: user.email,
                  origin,
                })
              : applicationRejectedEmail({
                  name: application.applicant_name,
                  title: application.project_title,
                  note: body.note,
                  origin,
                });
          try {
            const result = await sendTransactionalEmail({
              recipient: application.applicant_email,
              subject: emailContent.subject,
              template:
                body.decision === "revision_requested"
                  ? "revision_requested"
                  : "application_rejected",
              applicationId: id,
              text: emailContent.text,
              html: emailContent.html,
              db,
            });
            return Response.json({
              message: result.logWarning
                ? "Decision saved and notification email sent, but email log recording failed."
                : "Decision saved and notification email sent to applicant.",
            });
          } catch {
            return Response.json(
              {
                error:
                  "The decision was saved, but the notification email could not be sent.",
              },
              { status: 502 },
            );
          }
        }
      }
      return Response.json({
        message: "Decision saved. This action does not send an email.",
      });
    }
    if (body.action === "propose") {
      if (
        !validSlot(body) ||
        !catalog[body.gpu] ||
        !Number.isInteger(body.workspace) ||
        body.workspace < 20 ||
        body.workspace > 2000 ||
        !Number.isFinite(body.cost) ||
        body.cost <= 0 ||
        body.cost > 1000
      )
        throw new Error("INVALID_BODY");
      if (!gmailConfigured())
        return Response.json(
          {
            error:
              "Complete the Gmail API credentials before sending a proposed timeslot.",
          },
          { status: 503 },
        );
      const confirmToken = secret();
      const declineToken = secret();
      const [gpu, instance] = catalog[body.gpu];
      const { data: allocationId, error } = await db.rpc(
        "portal_propose_slot",
        {
          p_application_id: id,
          p_start: `${body.date}T${body.start}:00+07:00`,
          p_end: `${body.date}T${body.end}:00+07:00`,
          p_gpu: gpu,
          p_instance: instance,
          p_workspace: body.workspace,
          p_cost: body.cost,
          p_admin: user.email,
          p_confirm_hash: hash(confirmToken),
          p_decline_hash: hash(declineToken),
        },
      );
      if (error)
        return Response.json(
          {
            error:
              error.code === "23P01"
                ? "This timeslot overlaps another allocation, including provisioning and export buffers."
                : "The timeslot could not be saved. Check that the application is approved, the start is at least one hour away, and the SQL migration has been applied.",
          },
          { status: 409 },
        );
      const { data: allocation } = await db
        .from("compute_allocations")
        .select(
          "id,gpu_name,workspace_ebs_gb,proposed_start_at,proposed_end_at,confirmation_expires_at",
        )
        .eq("id", allocationId)
        .single();
      const { data: application } = await db
        .from("applications")
        .select("applicant_name,applicant_email,project_title")
        .eq("id", id)
        .single();
      if (!allocation || !application) throw new Error("DATABASE_UNAVAILABLE");
      try {
        const result = await sendAvailability({
          recipient: application.applicant_email,
          name: application.applicant_name,
          title: application.project_title,
          allocation,
          confirmToken,
          declineToken,
          db,
        });
        return Response.json({
          message: result.logWarning
            ? "Email sent, but the delivery log could not be saved. Check before resending."
            : "Proposed timeslot saved and confirmation email sent. Compute has not been scheduled in AWS.",
        });
      } catch {
        return Response.json(
          {
            error:
              "The timeslot was saved, but email delivery failed. Check the Gmail credentials or refresh token, then resend the proposal. Previous links will be replaced.",
          },
          { status: 502 },
        );
      }
    }
    if (body.action === "finalize") {
      const { data: application, error: appErr } = await db
        .from("applications")
        .select("id,applicant_name,applicant_email,project_title,status")
        .eq("id", id)
        .maybeSingle();
      if (appErr || !application) throw new Error("DATABASE_UNAVAILABLE");

      const { data: allocations, error: allocErr } = await db
        .from("compute_allocations")
        .select(
          "id,gpu_name,workspace_ebs_gb,proposed_start_at,proposed_end_at,status,availability_confirmations(response_status)",
        )
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (allocErr) throw new Error("DATABASE_UNAVAILABLE");

      const allocation = (allocations || []).find((a) => {
        const resp = Array.isArray(a.availability_confirmations)
          ? a.availability_confirmations[0]?.response_status
          : a.availability_confirmations?.response_status;
        return a.status === "user_confirmed" || resp === "confirmed";
      });

      if (!allocation) {
        return Response.json(
          {
            error:
              "No confirmed timeslot found to finalize. Ensure the applicant has confirmed availability first.",
          },
          { status: 409 },
        );
      }

      const token = generateAccessToken();
      const tokenHash = hash(token);
      const endMs = Date.parse(allocation.proposed_end_at);
      const baseMs = Number.isFinite(endMs)
        ? Math.max(Date.now(), endMs)
        : Date.now();
      const redeemExpiresAt = new Date(
        baseMs + 7 * 86400000,
      ).toISOString();

      const { error: updateAllocErr } = await db
        .from("compute_allocations")
        .update({ status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", allocation.id);
      if (updateAllocErr) {
        return Response.json(
          {
            error:
              "The allocation could not be marked as scheduled. Check database constraints.",
          },
          { status: 409 },
        );
      }

      await db
        .from("applications")
        .update({ status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", id);

      const { error: grantErr } = await db.from("access_grants").insert({
        allocation_id: allocation.id,
        token_hash: tokenHash,
        redeem_expires_at: redeemExpiresAt,
        created_by_email: user.email,
      });
      if (grantErr) {
        return Response.json(
          {
            error:
              "The access grant could not be issued. Check the access_grants table schema.",
          },
          { status: 409 },
        );
      }

      await db.from("audit_logs").insert({
        actor_type: "admin",
        actor_email: user.email,
        action: "finalize_schedule",
        target_type: "allocation",
        target_id: allocation.id,
        after_data: { status: "scheduled" },
      });

      if (gmailConfigured()) {
        try {
          await sendInvitationToken({
            recipient: application.applicant_email,
            name: application.applicant_name,
            title: application.project_title,
            allocation,
            token,
            db,
          });
          return Response.json({
            success: true,
            token,
            message: "Schedule finalized and invitation email sent.",
          });
        } catch {
          return Response.json({
            success: true,
            token,
            message: `Schedule finalized (Token: ${token}), but invitation email delivery failed. Share the token manually with the applicant.`,
          });
        }
      }

      return Response.json({
        success: true,
        token,
        message: "Schedule finalized and invitation email sent.",
      });
    }
    throw new Error("INVALID_BODY");
  } catch (error) {
    return failure(error);
  }
}
