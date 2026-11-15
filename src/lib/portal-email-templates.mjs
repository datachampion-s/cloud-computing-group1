import { formatDate, formatTime, normalizeToken } from "./validation.mjs";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function whatsappSupportUrl({ name, email } = {}) {
  const text = `*DCS HPC*\nNama: ${name || "-"}\nEmail: ${email || "-"}\n\nKendala: `;
  return `https://wa.me/00000000000?text=${encodeURIComponent(text)}`;
}

export function whatsappFooterHtml({ name, email } = {}) {
  const url = whatsappSupportUrl({ name, email });
  return `<div style="margin-top:24px;padding-top:20px;border-top:1px solid #e1e8f2;text-align:center"><p style="margin:0 0 10px;font-size:13px;color:#586b86">Have a question?</p><a href="${escape(url)}" style="display:inline-block;padding:10px 18px;background:#16a34a;border-radius:7px;color:#fff;text-decoration:none;font-size:13px;font-weight:bold">Chat on WhatsApp</a></div>`;
}

export function whatsappFooterText({ name, email } = {}) {
  return `Have a question? Chat on WhatsApp: ${whatsappSupportUrl({ name, email })}`;
}

export function invitationTokenEmail({
  name,
  email,
  recipient,
  title,
  allocation,
  token,
  origin = "http://localhost:3000",
}) {
  const resolvedEmail = email || recipient || "";
  const portalUrl = `${origin}/compute`;
  const formattedToken = normalizeToken(token);
  const start = `${formatDate(allocation.proposed_start_at, { weekday: "long" })}, ${formatTime(allocation.proposed_start_at)}–${formatTime(allocation.proposed_end_at)} WIB`;

  const subject = `DCS Compute Access | Your Session & Access Token — ${title}`;

  const text = `Hello ${name},

Your DCS Compute session for "${title}" has been finalized.

Schedule: ${start}
GPU: ${allocation.gpu_name}
Workspace: ${allocation.workspace_ebs_gb} GB
Access Token: ${formattedToken}

Early access: The compute environment opens 15 minutes before your scheduled start time so you can configure dependencies, clone repositories, and verify checkpoints.

Access Compute Portal: ${portalUrl}

DCS Research Commitment & Merit Policy:
Compute capacity is community-sponsored and allocated on merit. Unused reservations prevent other researchers from utilizing GPU resources. If you are unable to use your session, please notify the administrator immediately. Unattended slots without prior notice may impact future allocation requests.

${whatsappFooterText({ name, email: resolvedEmail })}

Data Champion Society — High-Performance Compute Access
https://datachampions.tech`;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;width:100%"><tr><td align="center" style="padding:10px 0 25px"><img src="cid:hpc-logo@datachampions.tech" alt="DCS HPC" width="90"><p style="font-size:13px;margin:0">DCS High-Performance Compute Access</p><img src="cid:powered-by-aws@datachampions.tech" alt="Powered by AWS" width="90" style="margin-top:12px"></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:34px"><h1 style="font-size:25px;line-height:1.3">Your research session is confirmed.</h1><p style="font-size:14px;line-height:1.9">Hello ${escape(name)}, the DCS admin has finalized the schedule for <strong>${escape(title)}</strong>. Your workspace allocation and credentials are ready below.</p><table role="presentation" style="background:#f3f7fe;width:100%;padding:17px;font-size:13px;line-height:1.9"><tr><td>Schedule</td><td>${escape(start)}</td></tr><tr><td>GPU</td><td>${escape(allocation.gpu_name)}</td></tr><tr><td>Workspace</td><td>${allocation.workspace_ebs_gb} GB</td></tr><tr><td>Access Token</td><td><strong style="font-family:monospace;font-size:15px;letter-spacing:1px">${escape(formattedToken)}</strong></td></tr></table><div style="margin:24px 0;padding:16px;background:#f0f7ff;border:1px dashed #2264d1;border-radius:8px;text-align:center"><div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#586b86;text-transform:uppercase;margin-bottom:6px">Your Portal Access Token</div><div style="font-family:'Courier New',Courier,monospace;font-size:24px;font-weight:bold;color:#1e73e8;letter-spacing:3px">${escape(formattedToken)}</div></div><p style="font-size:13px;line-height:1.8;color:#203a5e;background:#f3f7fe;border-left:3px solid #1e73e8;padding:12px 16px;margin:20px 0"><strong>Early access:</strong> The compute environment opens <strong>15 minutes</strong> before your scheduled start time so you can configure dependencies, clone repositories, and verify checkpoints.</p><p style="margin:28px 0"><a href="${escape(portalUrl)}" style="display:inline-block;padding:14px 23px;background:#1e73e8;border-radius:7px;color:#fff;text-decoration:none;font-size:14px">Access Compute Portal</a></p><p style="font-size:12px;line-height:1.8;color:#708198"><strong>DCS Research Commitment &amp; Merit Policy:</strong> Compute capacity is community-sponsored and allocated on merit. Unused reservations prevent other researchers from utilizing GPU resources. If you are unable to use your session, notify the administrator immediately. Unattended slots without prior notice may disqualify future allocation requests.</p>${whatsappFooterHtml({ name, email: resolvedEmail })}</td></tr><tr><td align="center" style="padding:25px;font-size:11px;line-height:1.6;color:#708198"><p>Data Champion Society — High-Performance Compute Access</p><p style="margin:0">https://datachampions.tech</p></td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}

export function artifactsReadyEmail({
  name,
  email = "",
  recipient = "",
  title,
  allocation,
  artifactsCount = 1,
  origin = "http://localhost:3000",
}) {
  const resolvedEmail = email || recipient || "";
  const portalUrl = `${origin}/compute`;
  const count = Number(artifactsCount) || 1;
  const countLabel = `${count} ${count === 1 ? "archive" : "archives"}`;

  const subject = `DCS Compute Access | Research Artifacts Ready — ${title}`;

  const text = `Hello ${name},

Your DCS Compute session for "${title}" has ended, and your research artifacts have been archived and synced to S3.

Project: ${title}
GPU: ${allocation?.gpu_name || "Compute Cluster"}
Archived files: ${countLabel}
Storage: Amazon S3 (Archived)

7-Day Retention Notice:
Your research artifacts are stored in S3 and will remain available for download for 7 days. After 7 days, files are permanently deleted to free capacity for upcoming sessions. Please download your outputs and checkpoints promptly.

Download your artifacts: ${portalUrl}

${whatsappFooterText({ name, email: resolvedEmail })}

Data Champion Society — High-Performance Compute Access
https://datachampions.tech`;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;width:100%"><tr><td align="center" style="padding:10px 0 25px"><img src="cid:hpc-logo@datachampions.tech" alt="DCS HPC" width="90"><p style="font-size:13px;margin:0">DCS High-Performance Compute Access</p><img src="cid:powered-by-aws@datachampions.tech" alt="Powered by AWS" width="90" style="margin-top:12px"></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:34px"><h1 style="font-size:25px;line-height:1.3">Your research artifacts are ready.</h1><p style="font-size:14px;line-height:1.9">Hello ${escape(name)}, your compute session for <strong>${escape(title)}</strong> has completed. Your research outputs, logs, and checkpoints have been compressed and securely synced to Amazon S3 storage.</p><table role="presentation" style="background:#f3f7fe;width:100%;padding:17px;font-size:13px;line-height:1.9"><tr><td>Project</td><td>${escape(title)}</td></tr><tr><td>GPU</td><td>${escape(allocation?.gpu_name || "Compute Cluster")}</td></tr><tr><td>Status</td><td>Completed &amp; Archived</td></tr><tr><td>Archived files</td><td>${escape(countLabel)}</td></tr></table><p style="font-size:13px;line-height:1.8;color:#92400e;background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;margin:20px 0"><strong>7-Day Retention Notice:</strong> Compressed artifacts are archived in S3 and remain downloadable for <strong>7 days</strong>. After this retention period, artifacts are permanently deleted to reclaim storage for upcoming research sessions.</p><p style="margin:28px 0"><a href="${escape(portalUrl)}" style="display:inline-block;padding:14px 23px;background:#1e73e8;border-radius:7px;color:#fff;text-decoration:none;font-size:14px">Download Artifacts</a></p><p style="font-size:12px;line-height:1.8;color:#708198">Need to retrieve raw volumes or encounter download issues? Contact the DCS administrator before the 7-day retention period expires.</p>${whatsappFooterHtml({ name, email: resolvedEmail })}</td></tr><tr><td align="center" style="padding:25px;font-size:11px;line-height:1.6;color:#708198"><p>Data Champion Society — High-Performance Compute Access</p><p style="margin:0">https://datachampions.tech</p></td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}

export function scheduleConfirmedAdminEmail({
  applicationId,
  applicantName,
  applicantEmail,
  projectTitle,
  allocation,
  origin = "http://localhost:3000",
}) {
  const adminUrl = `${origin}/admin/applications/${applicationId}`;
  const start = `${formatDate(allocation.proposed_start_at, { weekday: "long" })}, ${formatTime(allocation.proposed_start_at)}–${formatTime(allocation.proposed_end_at)} WIB`;
  const subject = `DCS Compute Access | Schedule Confirmed — ${applicantName}`;
  const text = `Schedule Confirmed\n\n${applicantName} (${applicantEmail}) has confirmed availability for "${projectTitle}".\n\nConfirmed slot: ${start}\nGPU: ${allocation.gpu_name}\nWorkspace: ${allocation.workspace_ebs_gb} GB\n\nFinalize & issue access token: ${adminUrl}\n\nData Champion Society — High-Performance Compute Access`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;width:100%"><tr><td align="center" style="padding:10px 0 25px"><img src="cid:hpc-logo@datachampions.tech" alt="DCS HPC" width="90"><p style="font-size:13px;margin:0">DCS High-Performance Compute Access</p></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:34px"><h1 style="font-size:25px;line-height:1.3">Schedule confirmed by student.</h1><p style="font-size:14px;line-height:1.9"><strong>${escape(applicantName)}</strong> (${escape(applicantEmail)}) has confirmed availability for <strong>${escape(projectTitle)}</strong>.</p><table role="presentation" style="background:#f3f7fe;width:100%;padding:17px;font-size:13px;line-height:1.9"><tr><td>Applicant</td><td>${escape(applicantName)}</td></tr><tr><td>Project</td><td>${escape(projectTitle)}</td></tr><tr><td>Confirmed schedule</td><td>${escape(start)}</td></tr><tr><td>GPU</td><td>${escape(allocation.gpu_name)}</td></tr><tr><td>Workspace</td><td>${escape(allocation.workspace_ebs_gb)} GB</td></tr></table><p style="margin:28px 0"><a href="${escape(adminUrl)}" style="display:inline-block;padding:14px 23px;background:#1e73e8;border-radius:7px;color:#fff;text-decoration:none;font-size:14px">Finalize &amp; issue token</a></p><p style="font-size:12px;line-height:1.8;color:#708198">Sign in with your authorized DCS admin account to finalize the schedule and issue the student's invitation token.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function scheduleDeclinedAdminEmail({
  applicationId,
  applicantName,
  applicantEmail,
  projectTitle,
  allocation,
  note = "",
  alternativeSlots = [],
  origin = "http://localhost:3000",
}) {
  const adminUrl = `${origin}/admin/applications/${applicationId}`;
  const declinedWindow = `${formatDate(allocation.proposed_start_at, { weekday: "long" })}, ${formatTime(allocation.proposed_start_at)}–${formatTime(allocation.proposed_end_at)} WIB`;
  const formattedAlternatives = (alternativeSlots || []).map((s, idx) => {
    const d = s.date
      ? formatDate(`${s.date}T12:00:00+07:00`, { weekday: "short" })
      : s.date;
    return `Slot ${idx + 1}: ${d} · ${s.start}–${s.end} WIB`;
  });
  const reasonText = note?.trim() ? note.trim() : "No additional note provided.";
  const subject = `DCS Compute Access | Schedule Declined — ${applicantName}`;
  const text = `Schedule Declined\n\n${applicantName} (${applicantEmail}) is unavailable for the proposed schedule for "${projectTitle}".\n\nDeclined slot: ${declinedWindow}\nGPU: ${allocation.gpu_name}\nReason / note: ${reasonText}\n\nStudent-proposed alternative timeslots:\n${formattedAlternatives.length ? formattedAlternatives.join("\n") : "None provided"}\n\nReview & propose new slot: ${adminUrl}\n\nData Champion Society — High-Performance Compute Access`;
  const altRowsHtml = formattedAlternatives.length
    ? formattedAlternatives
        .map(
          (line, idx) =>
            `<tr><td>Alternative ${idx + 1}</td><td><strong>${escape(line.replace(/^Slot \d+:\s*/, ""))}</strong></td></tr>`,
        )
        .join("")
    : `<tr><td>Alternatives</td><td>None provided</td></tr>`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;width:100%"><tr><td align="center" style="padding:10px 0 25px"><img src="cid:hpc-logo@datachampions.tech" alt="DCS HPC" width="90"><p style="font-size:13px;margin:0">DCS High-Performance Compute Access</p></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:34px"><h1 style="font-size:25px;line-height:1.3">Schedule declined — alternatives proposed.</h1><p style="font-size:14px;line-height:1.9"><strong>${escape(applicantName)}</strong> (${escape(applicantEmail)}) declined the proposed timeslot for <strong>${escape(projectTitle)}</strong> and shared alternative availability.</p><table role="presentation" style="background:#f3f7fe;width:100%;padding:17px;font-size:13px;line-height:1.9"><tr><td>Applicant</td><td>${escape(applicantName)}</td></tr><tr><td>Project</td><td>${escape(projectTitle)}</td></tr><tr><td>Declined slot</td><td>${escape(declinedWindow)}</td></tr><tr><td>Reason / Note</td><td>${escape(reasonText)}</td></tr>${altRowsHtml}</table><p style="margin:28px 0"><a href="${escape(adminUrl)}" style="display:inline-block;padding:14px 23px;background:#1e73e8;border-radius:7px;color:#fff;text-decoration:none;font-size:14px">Review &amp; propose new slot</a></p><p style="font-size:12px;line-height:1.8;color:#708198">Sign in with your authorized DCS admin account to review the student's proposed timeslots and send a new schedule invitation.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function revisionRequestedEmail({
  id = "",
  applicationId = "",
  submission_key = "",
  submissionKey = "",
  key = "",
  name,
  email = "",
  recipient = "",
  title,
  note = "",
  adminEmail = "",
  origin = "http://localhost:3000",
}) {
  const resolvedEmail = email || recipient || "";
  const resolvedId = id || applicationId;
  const resolvedKey = submission_key || submissionKey || key || resolvedId;
  const revisePath = resolvedId
    ? `/revise?id=${resolvedId}&key=${resolvedKey}`
    : "/revise";
  const reviseUrl = `${origin}${revisePath}`;
  const feedback = note?.trim()
    ? note.trim()
    : "Please review and clarify your research methodology, dataset scope, and requested GPU hours.";
  const replyLine = adminEmail
    ? ` If you have questions, you can also contact ${adminEmail}.`
    : "";
  const subject = `DCS Compute Access | Revision requested — ${title}`;
  const text = `Hello ${name},

The DCS Compute Review Committee has reviewed your research proposal for "${title}" and requested revisions before we can proceed with GPU allocation.

Reviewer Feedback & Required Revisions:
"${feedback}"

Next Steps:
Please update your proposal or student ID document in Google Drive (ensuring link sharing remains enabled) and submit your revision response directly using the link below:${replyLine}

Submit Proposal Revision: ${reviseUrl}

${whatsappFooterText({ name, email: resolvedEmail })}

Data Champion Society — High-Performance Compute Access
https://datachampions.tech`;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;width:100%"><tr><td align="center" style="padding:10px 0 25px"><img src="cid:hpc-logo@datachampions.tech" alt="DCS HPC" width="90"><p style="font-size:13px;margin:0">DCS High-Performance Compute Access</p><img src="cid:powered-by-aws@datachampions.tech" alt="Powered by AWS" width="90" style="margin-top:12px"></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:34px"><h1 style="font-size:25px;line-height:1.3">Revision requested for your proposal.</h1><p style="font-size:14px;line-height:1.9">Hello ${escape(name)}, the DCS administrator has reviewed your compute access proposal for <strong>${escape(title)}</strong> and requested revisions before scheduling a GPU session.</p><div style="margin:22px 0;padding:18px 20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px"><div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#92400e;text-transform:uppercase;margin-bottom:8px">Reviewer Feedback &amp; Required Revisions</div><p style="margin:0;font-size:14px;line-height:1.8;color:#451a03;white-space:pre-wrap">${escape(feedback)}</p></div><p style="font-size:14px;line-height:1.9">Please update your proposal or KTM document in Google Drive (making sure viewer access remains enabled) and submit your revision response using the button below${adminEmail ? ` (or contact ${escape(adminEmail)} if you need assistance)` : ""} so the administrator can re-evaluate your request.</p><p style="margin:28px 0"><a href="${escape(reviseUrl)}" style="display:inline-block;padding:14px 23px;background:#1e73e8;border-radius:7px;color:#fff;text-decoration:none;font-size:14px;font-weight:bold">Submit Proposal Revision</a></p>${whatsappFooterHtml({ name, email: resolvedEmail })}<p style="font-size:12px;color:#637083">Data Champion Society — High-Performance Compute Access</p></td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}

export function revisionSubmittedAdminEmail({
  applicationId = "",
  id = "",
  applicantName = "",
  name = "",
  applicantEmail = "",
  email = "",
  projectTitle = "",
  title = "",
  previousFeedback = "",
  feedback = "",
  revisionNote = "",
  note = "",
  proposalDriveUrl = "",
  ktmDriveUrl = "",
  origin = "http://localhost:3000",
}) {
  const resolvedId = applicationId || id;
  const resolvedName = applicantName || name;
  const resolvedEmail = applicantEmail || email;
  const resolvedTitle = projectTitle || title;
  const resolvedFeedback =
    (previousFeedback || feedback)?.trim() ||
    "No previous reviewer note recorded.";
  const resolvedNote =
    (revisionNote || note)?.trim() || "No revision note provided.";
  const adminUrl = `${origin}/admin/applications/${resolvedId}`;
  const subject = `DCS Compute Access | Revision Submitted — ${resolvedName} (${resolvedTitle})`;

  const updatedLinksText = [
    proposalDriveUrl ? `Updated Proposal: ${proposalDriveUrl}` : "",
    ktmDriveUrl ? `Updated KTM: ${ktmDriveUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = `Proposal Revision Submitted

${resolvedName}${resolvedEmail ? ` (${resolvedEmail})` : ""} has submitted a proposal revision for "${resolvedTitle}".

Previously Requested Feedback:
"${resolvedFeedback}"

Student Revision Response:
"${resolvedNote}"${updatedLinksText ? `\n\n${updatedLinksText}` : ""}

Review in Admin Dashboard: ${adminUrl}

Data Champion Society — High-Performance Compute Access`;

  const updatedLinksHtml = [
    proposalDriveUrl
      ? `<tr><td>Proposal Link</td><td><a href="${escape(proposalDriveUrl)}" style="color:#1e73e8">${escape(proposalDriveUrl)}</a></td></tr>`
      : "",
    ktmDriveUrl
      ? `<tr><td>KTM Link</td><td><a href="${escape(ktmDriveUrl)}" style="color:#1e73e8">${escape(ktmDriveUrl)}</a></td></tr>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;width:100%"><tr><td align="center" style="padding:10px 0 25px"><img src="cid:hpc-logo@datachampions.tech" alt="DCS HPC" width="90"><p style="font-size:13px;margin:0">DCS High-Performance Compute Access</p><img src="cid:powered-by-aws@datachampions.tech" alt="Powered by AWS" width="90" style="margin-top:12px"></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:34px"><h1 style="font-size:25px;line-height:1.3">Proposal revision submitted.</h1><p style="font-size:14px;line-height:1.9"><strong>${escape(resolvedName)}</strong>${resolvedEmail ? ` (${escape(resolvedEmail)})` : ""} has submitted a revision for <strong>${escape(resolvedTitle)}</strong> and the application is now back under review.</p><table role="presentation" style="background:#f3f7fe;width:100%;padding:17px;font-size:13px;line-height:1.9;border-radius:8px;margin-bottom:18px"><tr><td>Applicant</td><td>${escape(resolvedName)}${resolvedEmail ? ` (${escape(resolvedEmail)})` : ""}</td></tr><tr><td>Project</td><td>${escape(resolvedTitle)}</td></tr>${updatedLinksHtml}</table><div style="margin:18px 0;padding:16px 18px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px"><div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#92400e;text-transform:uppercase;margin-bottom:6px">Previously Requested Feedback</div><p style="margin:0;font-size:13px;line-height:1.7;color:#451a03;white-space:pre-wrap">${escape(resolvedFeedback)}</p></div><div style="margin:18px 0;padding:16px 18px;background:#eff6ff;border-left:4px solid #1e73e8;border-radius:8px"><div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#1e40af;text-transform:uppercase;margin-bottom:6px">Student Revision Response</div><p style="margin:0;font-size:14px;line-height:1.8;color:#0f223b;white-space:pre-wrap">${escape(resolvedNote)}</p></div><p style="margin:26px 0"><a href="${escape(adminUrl)}" style="display:inline-block;padding:13px 22px;background:#1e73e8;border-radius:7px;color:#fff;text-decoration:none;font-size:14px;font-weight:bold">Review in Admin Dashboard</a></p><p style="font-size:12px;color:#637083">Data Champion Society — High-Performance Compute Access</p></td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}

export function applicationRejectedEmail({
  name,
  email = "",
  recipient = "",
  title,
  note = "",
  origin = "http://localhost:3000",
}) {
  const resolvedEmail = email || recipient || "";
  const feedback = note?.trim()
    ? note.trim()
    : "Due to limited GPU capacity and current round prioritization, we are unable to allocate compute resources for this proposal at this time.";
  const subject = `DCS Compute Access | Proposal update — ${title}`;
  const text = `Hello ${name},

Thank you for submitting your compute access proposal for "${title}" to the Data Champion Society High-Performance Compute program.

After careful review, we regret to inform you that your proposal cannot be accommodated in the current compute allocation round.

Reviewer Note:
"${feedback}"

We encourage you to refine your research scope and methodology based on the feedback above and reapply in a future allocation cycle at ${origin}/apply.

${whatsappFooterText({ name, email: resolvedEmail })}

Data Champion Society — High-Performance Compute Access
https://datachampions.tech`;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#152a45"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;width:100%"><tr><td align="center" style="padding:10px 0 25px"><img src="cid:hpc-logo@datachampions.tech" alt="DCS HPC" width="90"><p style="font-size:13px;margin:0">DCS High-Performance Compute Access</p><img src="cid:powered-by-aws@datachampions.tech" alt="Powered by AWS" width="90" style="margin-top:12px"></td></tr><tr><td style="background:#fff;border:1px solid #e1e8f2;border-radius:14px;padding:34px"><h1 style="font-size:25px;line-height:1.3">Update on your compute access proposal.</h1><p style="font-size:14px;line-height:1.9">Hello ${escape(name)}, thank you for submitting your proposal for <strong>${escape(title)}</strong> to the DCS High-Performance Compute program. After careful evaluation, we are unable to accommodate your request in the current compute round.</p><div style="margin:22px 0;padding:18px 20px;background:#f8fafc;border-left:4px solid #64748b;border-radius:8px"><div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#475569;text-transform:uppercase;margin-bottom:8px">Reviewer Feedback</div><p style="margin:0;font-size:14px;line-height:1.8;color:#1e293b;white-space:pre-wrap">${escape(feedback)}</p></div><p style="font-size:14px;line-height:1.9">Compute capacity is community-sponsored and subject to strict availability constraints each cycle. You are welcome to incorporate the reviewer feedback and submit a revised proposal in a future allocation round.</p><p style="margin:28px 0"><a href="${escape(`${origin}/apply`)}" style="display:inline-block;padding:14px 23px;background:#1e73e8;border-radius:7px;color:#fff;text-decoration:none;font-size:14px">Portal &amp; Program Guidelines</a></p>${whatsappFooterHtml({ name, email: resolvedEmail })}</td></tr><tr><td align="center" style="padding:25px;font-size:11px;line-height:1.6;color:#708198"><p>Data Champion Society — High-Performance Compute Access</p><p style="margin:0">https://datachampions.tech</p></td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}
