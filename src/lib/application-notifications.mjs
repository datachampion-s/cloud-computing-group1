const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function newApplicationEmail(application, origin) {
  const reference = `DCS-${application.id.slice(0, 8).toUpperCase()}`;
  const reviewUrl = new URL(`/admin/applications/${application.id}`, origin)
    .href;
  return {
    subject: `DCS Compute Access | New application — ${reference}`,
    text: `A new DCS Compute application is ready for review.\n\nReference: ${reference}\nApplicant: ${application.applicant_name}\nEmail: ${application.applicant_email}\nStudy program: ${application.program}\nProject: ${application.project_title}\n\nApplications are reviewed within 3 business days.\nReview application: ${reviewUrl}\n\nSign in with your authorized admin account.`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" style="width:100%;max-width:600px"><tr><td align="center" style="padding-bottom:22px"><img src="cid:hpc-logo@datachampions.tech" width="90" alt="DCS HPC"><p>DCS High-Performance Compute Access</p></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:32px"><h1 style="font-size:25px;line-height:1.3">A new idea is ready for review.</h1><p style="font-size:14px;line-height:1.9">A student has submitted a new compute application.</p><table role="presentation" style="width:100%;padding:16px;background:#f3f7fe;font-size:13px;line-height:1.9"><tr><td>Reference</td><td>${escape(reference)}</td></tr><tr><td>Applicant</td><td>${escape(application.applicant_name)}</td></tr><tr><td>Email</td><td>${escape(application.applicant_email)}</td></tr><tr><td>Study program</td><td>${escape(application.program)}</td></tr><tr><td>Project</td><td>${escape(application.project_title)}</td></tr></table><p style="font-size:13px;line-height:1.8">Applications are reviewed within <strong>3 business days</strong>.</p><a href="${escape(reviewUrl)}" style="display:inline-block;background:#1e73e8;color:#fff;text-decoration:none;border-radius:7px;padding:14px 23px;font-size:14px">Review application</a><p style="font-size:11px;line-height:1.8;color:#708198;margin-top:22px">This link requires your authorized admin Google account. Student identity documents are available through the protected review page.</p></td></tr><tr><td align="center" style="padding:24px;font-size:11px;color:#78879a">Data Champion Society · UNNES<br><a href="https://datachampions.tech">datachampions.tech</a> · <a href="https://instagram.com/datachampion.s">@datachampion.s</a></td></tr></table></td></tr></table></body></html>`,
  };
}

export async function notifyNewApplication({
  applicationId,
  eventId,
  origin,
  db,
  deliver,
}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: claimed, error: claimError } = await db.rpc(
      "portal_claim_application_email",
      { p_event_id: eventId },
    );
    if (claimError) throw new Error("EMAIL_CLAIM_FAILED");
    if (!claimed) return { skipped: true };
    try {
      const { data: application, error: appError } = await db
        .from("applications")
        .select("id,applicant_name,applicant_email,program,project_title")
        .eq("id", applicationId)
        .single();
      const { data: event, error: eventError } = await db
        .from("email_events")
        .select("recipient")
        .eq("id", eventId)
        .eq("application_id", applicationId)
        .single();
      if (appError || eventError || !application || !event)
        throw new Error("EMAIL_CONTEXT_UNAVAILABLE");
      return await deliver({
        ...newApplicationEmail(application, origin),
        recipient: event.recipient,
        applicationId,
        eventId,
        template: "new_application",
        db,
      });
    } catch (error) {
      await db
        .from("email_events")
        .update({
          delivery_status: "failed",
          error_message: "APPLICATION_NOTIFICATION_FAILED",
        })
        .eq("id", eventId);
      if (attempt === 1) throw new Error("APPLICATION_NOTIFICATION_FAILED");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
