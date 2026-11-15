import "server-only";
import { formatDate, formatTime } from "./validation.mjs";
import { createEmailMessage } from "./email-message.mjs";
import {
  invitationTokenEmail,
  artifactsReadyEmail,
  scheduleConfirmedAdminEmail,
  scheduleDeclinedAdminEmail,
  revisionRequestedEmail,
  revisionSubmittedAdminEmail,
  applicationRejectedEmail,
  whatsappFooterHtml,
  whatsappFooterText,
} from "./portal-email-templates.mjs";

export {
  invitationTokenEmail,
  artifactsReadyEmail,
  scheduleConfirmedAdminEmail,
  scheduleDeclinedAdminEmail,
  revisionRequestedEmail,
  revisionSubmittedAdminEmail,
  applicationRejectedEmail,
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function gmailConfigured() {
  return [
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
    "GMAIL_SENDER",
  ].every((k) => !!process.env[k]?.trim());
}
export async function sendAvailability({
  recipient,
  name,
  title,
  allocation,
  confirmToken,
  declineToken,
  db,
}) {
  if (!gmailConfigured()) throw new Error("GMAIL_UNAVAILABLE");
  const origin = process.env.APP_URL || "http://localhost:3000";
  const confirmUrl = `${origin}/confirm#token=${confirmToken}&response=confirmed`;
  const declineUrl = `${origin}/confirm#token=${declineToken}&response=declined`;
  const start = `${formatDate(allocation.proposed_start_at, { weekday: "long" })}, ${formatTime(allocation.proposed_start_at)}–${formatTime(allocation.proposed_end_at)} WIB`;
  const expiry = `${formatDate(allocation.confirmation_expires_at)}, ${formatTime(allocation.confirmation_expires_at)} WIB`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;width:100%"><tr><td align="center" style="padding:10px 0 25px"><img src="cid:hpc-logo@datachampions.tech" alt="DCS HPC" width="90"><p style="font-size:13px;margin:0">DCS High-Performance Compute Access</p><img src="cid:powered-by-aws@datachampions.tech" alt="Powered by AWS" width="90" style="margin-top:12px"></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:34px"><h1 style="font-size:25px;line-height:1.3">A little more room for your research.</h1><p style="font-size:14px;line-height:1.9">Hello ${escape(name)}, the DCS admin has proposed a timeslot for <strong>${escape(title)}</strong>. Please check your availability before we finalize the allocation.</p><table role="presentation" style="background:#f3f7fe;width:100%;padding:17px;font-size:13px;line-height:1.9"><tr><td>Schedule</td><td>${escape(start)}</td></tr><tr><td>GPU</td><td>${escape(allocation.gpu_name)}</td></tr><tr><td>Workspace</td><td>${allocation.workspace_ebs_gb} GB</td></tr><tr><td>Response deadline</td><td>${escape(expiry)}</td></tr></table><p style="margin:28px 0"><a href="${escape(confirmUrl)}" style="display:inline-block;padding:14px 23px;background:#1e73e8;border-radius:7px;color:#fff;text-decoration:none;font-size:14px">Confirm availability</a></p><p style="font-size:13px"><a href="${escape(declineUrl)}" style="color:#586b86">I am unavailable at this time</a></p><p style="font-size:12px;line-height:1.8;color:#708198">This confirmation does not grant compute access. The admin will review your response and send a separate invitation once the schedule is finalized.</p>${whatsappFooterHtml({ name, email: recipient })}</td></tr><tr><td align="center" style="padding:25px;font-size:11px;line-height:1.9;color:#78879a">Data Champion Society · UNNES<br><a href="https://datachampions.tech" style="color:#1e73e8">datachampions.tech</a> · <a href="https://instagram.com/datachampion.s" style="color:#1e73e8">@datachampion.s</a><br>Please do not forward your personal confirmation links.</td></tr></table></td></tr></table></body></html>`;
  const text = `Hello ${name},\n\nProposed DCS Compute timeslot for ${title}:\n${start}\nGPU: ${allocation.gpu_name}\nWorkspace: ${allocation.workspace_ebs_gb} GB\nResponse deadline: ${expiry}\n\nConfirm: ${confirmUrl}\nUnavailable: ${declineUrl}\n\n${whatsappFooterText({ name, email: recipient })}\n\nThis confirmation does not grant compute access.\nData Champion Society — https://datachampions.tech`;
  return sendTransactionalEmail({
    recipient,
    subject: "DCS Compute Access | Confirm Your Proposed Session",
    template: "availability_confirmation",
    allocationId: allocation.id,
    text,
    html,
    db,
  });
}

export async function sendInvitationToken({
  recipient,
  name,
  title,
  allocation,
  token,
  db,
}) {
  if (!gmailConfigured()) throw new Error("GMAIL_UNAVAILABLE");
  const origin = process.env.APP_URL || "http://localhost:3000";
  const { subject, text, html } = invitationTokenEmail({
    name,
    email: recipient,
    title,
    allocation,
    token,
    origin,
  });
  return sendTransactionalEmail({
    recipient,
    subject,
    template: "invitation_token",
    allocationId: allocation.id,
    text,
    html,
    db,
  });
}

export async function sendArtifactsReady({
  recipient,
  name,
  title,
  allocation,
  artifactsCount,
  db,
}) {
  if (!gmailConfigured()) throw new Error("GMAIL_UNAVAILABLE");
  const origin = process.env.APP_URL || "http://localhost:3000";
  const { subject, text, html } = artifactsReadyEmail({
    name,
    email: recipient,
    title,
    allocation,
    artifactsCount,
    origin,
  });
  return sendTransactionalEmail({
    recipient,
    subject,
    template: "artifacts_ready",
    allocationId: allocation.id,
    text,
    html,
    db,
  });
}

export async function sendRevisionRequested({
  recipient,
  name,
  title,
  note,
  adminEmail,
  applicationId,
  db,
}) {
  if (!gmailConfigured()) throw new Error("GMAIL_UNAVAILABLE");
  const origin = process.env.APP_URL || "http://localhost:3000";
  const { subject, text, html } = revisionRequestedEmail({
    name,
    email: recipient,
    title,
    note,
    adminEmail,
    origin,
  });
  return sendTransactionalEmail({
    recipient,
    subject,
    template: "revision_requested",
    applicationId,
    text,
    html,
    db,
  });
}

export async function sendApplicationRejected({
  recipient,
  name,
  title,
  note,
  applicationId,
  db,
}) {
  if (!gmailConfigured()) throw new Error("GMAIL_UNAVAILABLE");
  const origin = process.env.APP_URL || "http://localhost:3000";
  const { subject, text, html } = applicationRejectedEmail({
    name,
    email: recipient,
    title,
    note,
    origin,
  });
  return sendTransactionalEmail({
    recipient,
    subject,
    template: "application_rejected",
    applicationId,
    text,
    html,
    db,
  });
}

export async function sendTransactionalEmail({
  recipient,
  subject,
  template,
  text,
  html,
  db,
  allocationId = null,
  applicationId = null,
  eventId = null,
}) {
  if (!gmailConfigured()) throw new Error("GMAIL_UNAVAILABLE");
  const sender = process.env.GMAIL_SENDER.trim();
  if (
    !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(sender) ||
    !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(recipient)
  )
    throw new Error("GMAIL_UNAVAILABLE");
  let event = { id: eventId };
  if (!eventId) {
    const { data, error } = await db
      .from("email_events")
      .insert({
        allocation_id: allocationId,
        application_id: applicationId,
        recipient,
        sender,
        provider: "gmail",
        template,
        delivery_status: "queued",
      })
      .select("id")
      .single();
    if (error) throw new Error("DATABASE_UNAVAILABLE");
    event = data;
  }
  try {
    const oauth = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const credentials = await oauth.json();
    if (!oauth.ok || !credentials.access_token)
      throw new Error("GMAIL_AUTH_FAILED");
    const message = await createEmailMessage({
      sender,
      recipient,
      subject,
      text,
      html,
    });
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: Buffer.from(message).toString("base64url"),
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const sent = await res.json();
    if (!res.ok || !sent.id) throw new Error("GMAIL_SEND_FAILED");
    const { error: logError } = await db
      .from("email_events")
      .update({
        delivery_status: "sent",
        sender,
        sent_at: new Date().toISOString(),
        provider_message_id: sent.id,
      })
      .eq("id", event.id);
    return { sent: true, logWarning: !!logError };
  } catch (error) {
    await db
      .from("email_events")
      .update({
        delivery_status: "failed",
        error_message: ["GMAIL_AUTH_FAILED", "GMAIL_SEND_FAILED"].includes(
          error.message,
        )
          ? error.message
          : "GMAIL_REQUEST_FAILED",
      })
      .eq("id", event.id);
    throw new Error("GMAIL_SEND_FAILED");
  }
}
