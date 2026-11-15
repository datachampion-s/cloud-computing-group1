import test from "node:test";
import assert from "node:assert/strict";
import {
  invitationTokenEmail,
  artifactsReadyEmail,
  scheduleConfirmedAdminEmail,
  scheduleDeclinedAdminEmail,
  revisionRequestedEmail,
  applicationRejectedEmail,
  revisionSubmittedAdminEmail,
  whatsappSupportUrl,
  whatsappFooterHtml,
  whatsappFooterText,
} from "../src/lib/portal-email-templates.mjs";
import {
  getDevPortalSession,
  isDevPreviewAllowed,
  parseDevPreviewConfig,
  getRedirectOrigin,
} from "../src/lib/dev-preview.mjs";
import { createEmailMessage } from "../src/lib/email-message.mjs";

const addresses = {
  sender: "sender@example.com",
  recipient: "student@example.com",
};

test("invitationTokenEmail generates complete email with WIB schedule, token, early-access note and merit policy", async () => {
  const allocation = {
    id: "alloc-test-123",
    gpu_name: "NVIDIA A10G (24GB)",
    workspace_ebs_gb: 50,
    proposed_start_at: "2026-11-10T09:00:00.000Z",
    proposed_end_at: "2026-11-10T13:00:00.000Z",
  };

  const email = invitationTokenEmail({
    name: "Galih Kencana <galih>",
    title: "Deep Learning Benchmark & Evaluation",
    allocation,
    token: "dcs-7k9p-m2x",
    origin: "https://hpc.datachampions.tech",
  });

  // Subject
  assert.ok(email.subject.includes("Deep Learning Benchmark & Evaluation"));
  assert.ok(email.subject.includes("DCS Compute Access"));

  // Text contains required fields
  assert.ok(email.text.includes("Galih Kencana <galih>"));
  assert.ok(email.text.includes("Deep Learning Benchmark & Evaluation"));
  assert.ok(email.text.includes("NVIDIA A10G (24GB)"));
  assert.ok(email.text.includes("50 GB"));
  assert.ok(email.text.includes("DCS-7K9P-M2X"));
  assert.ok(email.text.includes("WIB"));
  assert.ok(email.text.includes("15 minutes"));
  assert.ok(email.text.includes("merit"));
  assert.ok(email.text.includes("https://hpc.datachampions.tech/compute"));

  // HTML escaping and elements
  assert.ok(email.html.includes("Galih Kencana &lt;galih&gt;"));
  assert.ok(email.html.includes("Deep Learning Benchmark &amp; Evaluation"));
  assert.ok(email.html.includes("DCS-7K9P-M2X"));
  assert.ok(email.html.includes("NVIDIA A10G (24GB)"));
  assert.ok(email.html.includes("50 GB"));
  assert.ok(email.html.includes("WIB"));
  assert.ok(email.html.includes("15 minutes"));
  assert.ok(email.html.includes("Merit Policy"));
  assert.ok(email.html.includes('href="https://hpc.datachampions.tech/compute"'));
  assert.ok(email.html.includes('src="cid:hpc-logo@datachampions.tech"'));
  assert.ok(email.html.includes('src="cid:powered-by-aws@datachampions.tech"'));

  // Test MIME message assembly with both inline brand images
  const message = await createEmailMessage({ ...addresses, ...email });
  assert.ok(message.includes("Content-ID: <hpc-logo@datachampions.tech>"));
  assert.ok(message.includes("Content-ID: <powered-by-aws@datachampions.tech>"));
});

test("artifactsReadyEmail generates complete email with S3 archive, 7-day retention and count", async () => {
  const allocation = {
    id: "alloc-test-456",
    gpu_name: "NVIDIA A10G (24GB)",
  };

  const email = artifactsReadyEmail({
    name: "Galih Kencana",
    title: "Deep Learning Benchmark",
    allocation,
    artifactsCount: 3,
    origin: "https://hpc.datachampions.tech",
  });

  // Subject
  assert.ok(email.subject.includes("Artifacts Ready"));
  assert.ok(email.subject.includes("Deep Learning Benchmark"));

  // Text contains required information
  assert.ok(email.text.includes("Galih Kencana"));
  assert.ok(email.text.includes("Deep Learning Benchmark"));
  assert.ok(email.text.includes("3 archives"));
  assert.ok(email.text.includes("S3"));
  assert.ok(email.text.includes("7 days"));
  assert.ok(email.text.includes("https://hpc.datachampions.tech/compute"));

  // HTML structure & branding
  assert.ok(email.html.includes("Galih Kencana"));
  assert.ok(email.html.includes("Deep Learning Benchmark"));
  assert.ok(email.html.includes("3 archives"));
  assert.ok(email.html.includes("S3"));
  assert.ok(email.html.includes("7 days") || email.html.includes("7-Day"));
  assert.ok(email.html.includes('href="https://hpc.datachampions.tech/compute"'));
  assert.ok(email.html.includes('src="cid:hpc-logo@datachampions.tech"'));
  assert.ok(email.html.includes('src="cid:powered-by-aws@datachampions.tech"'));

  // Test MIME message assembly with both inline brand images
  const message = await createEmailMessage({ ...addresses, ...email });
  assert.ok(message.includes("Content-ID: <hpc-logo@datachampions.tech>"));
  assert.ok(message.includes("Content-ID: <powered-by-aws@datachampions.tech>"));
});

test("getDevPortalSession provides working mock session with allocation and artifacts queries", async () => {
  const session = getDevPortalSession();
  assert.ok(session.id);
  assert.ok(session.grant.allocation_id);
  assert.ok(session.grant.portal_access_expires_at);

  // Verify compute_allocations query
  const { data: allocation, error: allocError } = await session.db
    .from("compute_allocations")
    .select(
      "id,gpu_name,workspace_ebs_gb,proposed_start_at,proposed_end_at,applications!inner(applicant_name,project_title),compute_sessions(status)",
    )
    .eq("id", session.grant.allocation_id)
    .single();

  assert.equal(allocError, null);
  assert.equal(allocation.applications.applicant_name, "Galih Kencana");
  assert.equal(allocation.applications.project_title, "Deep Learning Benchmark");
  assert.equal(allocation.compute_sessions[0].status, "active");
  assert.ok(allocation.gpu_name);
  assert.ok(allocation.workspace_ebs_gb > 0);

  // Verify artifacts query
  const { data: artifacts, error: artError } = await session.db
    .from("artifacts")
    .select("id,filename,bytes,verified_at,downloadable_until")
    .eq("allocation_id", allocation.id)
    .is("deleted_at", null);

  assert.equal(artError, null);
  assert.ok(Array.isArray(artifacts));
  assert.ok(artifacts.length > 0);
  assert.ok(artifacts[0].filename.includes("benchmark"));
  assert.ok(artifacts[0].bytes > 0);

  // Custom options support
  const customSession = getDevPortalSession({
    student: "Jane Doe",
    project: "NLP Transformer",
    status: "completed",
    gpu: "NVIDIA H100 (80GB)",
  });
  const { data: customAlloc } = await customSession.db
    .from("compute_allocations")
    .select("...")
    .eq("id", customSession.grant.allocation_id)
    .single();

  assert.equal(customAlloc.applications.applicant_name, "Jane Doe");
  assert.equal(customAlloc.applications.project_title, "NLP Transformer");
  assert.equal(customAlloc.compute_sessions[0].status, "completed");
  assert.equal(customAlloc.gpu_name, "NVIDIA H100 (80GB)");
});

test("isDevPreviewAllowed strictly guards production environment", () => {
  assert.equal(isDevPreviewAllowed("production"), false);
  assert.equal(isDevPreviewAllowed("development"), true);
  assert.equal(isDevPreviewAllowed("test"), true);
});

test("parseDevPreviewConfig parses URLSearchParams and objects with robust defaults", () => {
  const defaults = parseDevPreviewConfig();
  assert.equal(defaults.applicant_name, "Galih Kencana");
  assert.equal(defaults.project_title, "Deep Learning Benchmark");
  assert.equal(defaults.status, "active");
  assert.equal(defaults.gpu_name, "NVIDIA A10G (24GB)");
  assert.equal(defaults.workspace_ebs_gb, 50);
  assert.equal(defaults.has_artifacts, true);

  const params = new URLSearchParams({
    student: "Alice Smith",
    project: "Vision Transformer",
    status: "artifact_ready",
    gpu: "NVIDIA H100 (80GB)",
    workspace: "100",
    artifacts: "false",
  });
  const parsed = parseDevPreviewConfig(params);
  assert.equal(parsed.applicant_name, "Alice Smith");
  assert.equal(parsed.project_title, "Vision Transformer");
  assert.equal(parsed.status, "artifact_ready");
  assert.equal(parsed.gpu_name, "NVIDIA H100 (80GB)");
  assert.equal(parsed.workspace_ebs_gb, 100);
  assert.equal(parsed.has_artifacts, false);
});

test("getRedirectOrigin sanitizes IPv6 wildcard host to localhost", () => {
  const reqIpv6 = {
    url: "http://[::]:3000/api/dev/login-preview",
    headers: new Headers({ host: "[::]:3000" }),
  };
  assert.equal(getRedirectOrigin(reqIpv6), "http://localhost:3000");

  const reqLocal = {
    url: "http://localhost:3000/api/dev/login-preview",
    headers: new Headers({ host: "localhost:3000" }),
  };
  assert.equal(getRedirectOrigin(reqLocal), "http://localhost:3000");

  const reqForwarded = {
    url: "http://[::]:3000/api/dev/login-preview",
    headers: new Headers({
      "x-forwarded-host": "hpc.datachampions.tech",
      "x-forwarded-proto": "https",
    }),
  };
  assert.equal(getRedirectOrigin(reqForwarded), "https://hpc.datachampions.tech");
});

test("scheduleConfirmedAdminEmail and scheduleDeclinedAdminEmail generate admin notifications with CTAs and alternative slots", () => {
  const allocation = {
    id: "alloc-999",
    gpu_name: "NVIDIA T4",
    workspace_ebs_gb: 100,
    proposed_start_at: "2026-11-12T02:00:00.000Z",
    proposed_end_at: "2026-11-12T05:00:00.000Z",
  };
  const appId = "cd04e138-9319-407d-b093-e1fcde66751c";

  const confirmed = scheduleConfirmedAdminEmail({
    applicationId: appId,
    applicantName: "Galih Kencana",
    applicantEmail: "student@example.org",
    projectTitle: "Vision Benchmark",
    allocation,
    origin: "https://hpc.datachampions.tech",
  });
  assert.equal(
    confirmed.subject,
    "DCS Compute Access | Schedule Confirmed — Galih Kencana",
  );
  assert.ok(confirmed.text.includes("NVIDIA T4"));
  assert.ok(
    confirmed.html.includes(
      `https://hpc.datachampions.tech/admin/applications/${appId}`,
    ),
  );

  const declined = scheduleDeclinedAdminEmail({
    applicationId: appId,
    applicantName: "Galih Kencana",
    applicantEmail: "student@example.org",
    projectTitle: "Vision Benchmark",
    allocation,
    note: "Lab exam during proposed window",
    alternativeSlots: [
      { date: "2026-11-13", start: "09:00", end: "12:00" },
      { date: "2026-11-14", start: "13:00", end: "16:00" },
      { date: "2026-11-15", start: "10:00", end: "14:00" },
    ],
    origin: "https://hpc.datachampions.tech",
  });
  assert.equal(
    declined.subject,
    "DCS Compute Access | Schedule Declined — Galih Kencana",
  );
  assert.ok(declined.text.includes("Lab exam during proposed window"));
  assert.ok(declined.text.includes("09:00–12:00 WIB"));
  assert.ok(declined.text.includes("13:00–16:00 WIB"));
  assert.ok(declined.text.includes("10:00–14:00 WIB"));
  assert.ok(
    declined.html.includes(
      `https://hpc.datachampions.tech/admin/applications/${appId}`,
    ),
  );
});

test("revisionRequestedEmail and applicationRejectedEmail generate branded English notifications with admin feedback", async () => {
  const revision = revisionRequestedEmail({
    id: "11111111-2222-3333-4444-555555555555",
    submissionKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: "Galih Kencana <galih>",
    title: "Diffusion Segmentation & Training",
    note: "Please clarify the dataset preprocessing size and exact VRAM requirements.",
    adminEmail: "admin@datachampions.tech",
    origin: "https://hpc.datachampions.tech",
  });

  assert.equal(
    revision.subject,
    "DCS Compute Access | Revision requested — Diffusion Segmentation & Training",
  );
  assert.ok(revision.text.includes("Galih Kencana <galih>"));
  assert.ok(
    revision.text.includes(
      "Please clarify the dataset preprocessing size and exact VRAM requirements.",
    ),
  );
  assert.ok(revision.text.includes("admin@datachampions.tech"));
  assert.ok(revision.html.includes("Galih Kencana &lt;galih&gt;"));
  assert.ok(revision.html.includes("Diffusion Segmentation &amp; Training"));
  assert.ok(
    revision.html.includes(
      "Please clarify the dataset preprocessing size and exact VRAM requirements.",
    ),
  );
  assert.ok(revision.html.includes('src="cid:hpc-logo@datachampions.tech"'));
  assert.ok(
    revision.html.includes('src="cid:powered-by-aws@datachampions.tech"'),
  );
  assert.ok(
    revision.html.includes(
      'href="https://hpc.datachampions.tech/revise?id=11111111-2222-3333-4444-555555555555&amp;key=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"',
    ),
  );
  assert.ok(
    revision.text.includes(
      "https://hpc.datachampions.tech/revise?id=11111111-2222-3333-4444-555555555555&key=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    ),
  );

  const revMessage = await createEmailMessage({ ...addresses, ...revision });
  assert.ok(revMessage.includes("Content-ID: <hpc-logo@datachampions.tech>"));
  assert.ok(
    revMessage.includes("Content-ID: <powered-by-aws@datachampions.tech>"),
  );

  const rejected = applicationRejectedEmail({
    name: "Galih Kencana",
    title: "Diffusion Segmentation & Training",
    note: "Proposal scope exceeds available single-slot GPU window for this cycle.",
    origin: "https://hpc.datachampions.tech",
  });

  assert.equal(
    rejected.subject,
    "DCS Compute Access | Proposal update — Diffusion Segmentation & Training",
  );
  assert.ok(rejected.text.includes("Galih Kencana"));
  assert.ok(
    rejected.text.includes(
      "Proposal scope exceeds available single-slot GPU window for this cycle.",
    ),
  );
  assert.ok(rejected.html.includes("Diffusion Segmentation &amp; Training"));
  assert.ok(
    rejected.html.includes(
      "Proposal scope exceeds available single-slot GPU window for this cycle.",
    ),
  );
  assert.ok(rejected.html.includes('src="cid:hpc-logo@datachampions.tech"'));
  assert.ok(
    rejected.html.includes('src="cid:powered-by-aws@datachampions.tech"'),
  );
});





test("revisionSubmittedAdminEmail notifies admins with the student's revision response", () => {
  const email = revisionSubmittedAdminEmail({
    applicationId: "11111111-2222-3333-4444-555555555555",
    applicantName: "Galih Kencana <galih>",
    applicantEmail: "student@example.org",
    projectTitle: "Diffusion Segmentation & Training",
    previousFeedback: "Please clarify VRAM requirements.",
    revisionNote: "Updated the proposal with a 24 GB VRAM estimate.",
    proposalDriveUrl: "https://drive.google.com/file/d/revised/view",
    ktmDriveUrl: "",
    origin: "https://hpc.datachampions.tech",
  });

  assert.ok(email.subject.includes("Revision Submitted"));
  assert.ok(email.text.includes("Please clarify VRAM requirements."));
  assert.ok(email.text.includes("Updated the proposal with a 24 GB VRAM estimate."));
  assert.ok(
    email.text.includes(
      "https://hpc.datachampions.tech/admin/applications/11111111-2222-3333-4444-555555555555",
    ),
  );
  assert.ok(email.html.includes("Galih Kencana &lt;galih&gt;"));
  assert.ok(email.html.includes("Diffusion Segmentation &amp; Training"));
  assert.ok(email.html.includes('src="cid:hpc-logo@datachampions.tech"'));
});

test("WhatsApp support footer & URL encode Nama and Email in all 5 user-facing emails", async () => {
  const { readFileSync } = await import("node:fs");
  const name = "Galih Kencana";
  const emailAddr = "student@example.org";
  const expectedUrl =
    "https://wa.me/00000000000?text=" +
    encodeURIComponent(
      `*DCS HPC*\nNama: ${name}\nEmail: ${emailAddr}\n\nKendala: `,
    );

  assert.equal(whatsappSupportUrl({ name, email: emailAddr }), expectedUrl);
  assert.equal(
    whatsappSupportUrl(),
    "https://wa.me/00000000000?text=" +
      encodeURIComponent("*DCS HPC*\nNama: -\nEmail: -\n\nKendala: "),
  );

  // Footer helpers (used directly by sendAvailability in src/lib/mail.js)
  const footerHtml = whatsappFooterHtml({ name, email: emailAddr });
  const footerText = whatsappFooterText({ name, email: emailAddr });
  assert.ok(footerHtml.includes("Have a question?"));
  assert.ok(footerHtml.includes("Chat on WhatsApp"));
  assert.ok(footerHtml.includes(expectedUrl));
  assert.ok(footerText.includes(expectedUrl));

  // Verify sendAvailability in src/lib/mail.js wires whatsappFooterHtml & whatsappFooterText
  const mailSource = readFileSync(
    new URL("../src/lib/mail.js", import.meta.url),
    "utf8",
  );
  assert.ok(mailSource.includes("whatsappFooterHtml({ name, email: recipient })"));
  assert.ok(mailSource.includes("whatsappFooterText({ name, email: recipient })"));

  // Verify all 4 user email templates in portal-email-templates.mjs
  const alloc = {
    id: "alloc-wa-1",
    gpu_name: "NVIDIA A10G (24GB)",
    workspace_ebs_gb: 50,
    proposed_start_at: "2026-11-10T09:00:00.000Z",
    proposed_end_at: "2026-11-10T13:00:00.000Z",
  };
  const userEmails = [
    invitationTokenEmail({
      name,
      email: emailAddr,
      title: "Model Run",
      allocation: alloc,
      token: "dcs-1234-5678",
    }),
    artifactsReadyEmail({
      name,
      email: emailAddr,
      title: "Model Run",
      allocation: alloc,
      artifactsCount: 2,
    }),
    revisionRequestedEmail({
      id: "app-1",
      name,
      email: emailAddr,
      title: "Model Run",
      note: "Clarify batch size",
    }),
    applicationRejectedEmail({
      name,
      email: emailAddr,
      title: "Model Run",
      note: "Round full",
    }),
  ];

  for (const msg of userEmails) {
    assert.ok(msg.html.includes("Have a question?"));
    assert.ok(msg.html.includes("Chat on WhatsApp"));
    assert.ok(msg.html.includes(expectedUrl));
    assert.ok(msg.text.includes(expectedUrl));
  }
});
