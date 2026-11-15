import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdminApplicationsCsv,
  computeAdminAnalytics,
  driveLink,
  evaluateParticipantStanding,
  generateAccessToken,
  isValidToken,
  normalizeToken,
  parseChangeRequest,
  resolveEffectiveStatus,
  serializeChangeRequest,
  validateApplication,
  validateDeclineAlternatives,
  validSlot,
} from "../src/lib/validation.mjs";
const now = new Date("2026-10-24T08:00:00+07:00");
const submission = {
  name: "Student Researcher",
  nim: "411142400001",
  program: "Statistics",
  email: "student@example.com",
  title: "Image classification experiment",
  ktm: "https://drive.google.com/file/d/student-card/view",
  proposal: "https://docs.google.com/document/d/proposal/edit",
  preferences: [{ date: "2026-11-09", start: "09:00", end: "12:00" }],
  consent: true,
  submissionKey: "cd04e138-9319-407d-b093-e1fcde66751c",
};
test("a complete research application is accepted", () =>
  assert.equal(validateApplication(submission, now).valid, true));
test("lookalike and non-HTTPS Drive links are rejected", () => {
  for (const link of [
    "https://drive.google.com.evil.test/file/a",
    "http://drive.google.com/file/a",
    "javascript:alert(1)",
    "https://drive.google.com@evil.test/file/a",
    "https://drive.google.com/",
  ])
    assert.equal(driveLink(link), false);
});
test("WIB slot validation rejects past, invalid calendar dates and inverted windows", () => {
  for (const slot of [
    { date: "2026-10-23", start: "09:00", end: "12:00" },
    { date: "2026-11-31", start: "09:00", end: "12:00" },
    { date: "2026-11-09", start: "12:00", end: "09:00" },
    { date: "2026-11-09", start: "24:00", end: "25:00" },
    { date: "2026-11-09", start: "9:00", end: "12:00" },
  ])
    assert.equal(validSlot(slot, now), false);
});
test("WIB slot validation accepts minute-precision times and 5-minute buffer from now", () => {
  assert.equal(
    validSlot({ date: "2026-11-09", start: "13:01", end: "14:35" }, now),
    true,
  );
  assert.equal(
    validSlot({ date: "2026-10-24", start: "07:56", end: "09:15" }, now),
    true,
  );
  assert.equal(
    validSlot({ date: "2026-10-24", start: "07:54", end: "09:15" }, now),
    false,
  );
});
test("more than three preferences and duplicate preferences are rejected", () => {
  assert.ok(
    validateApplication(
      { ...submission, preferences: Array(4).fill(submission.preferences[0]) },
      now,
    ).errors.preferences,
  );
  assert.ok(
    validateApplication(
      { ...submission, preferences: Array(2).fill(submission.preferences[0]) },
      now,
    ).errors.preferences,
  );
});
test("consent is explicit and cannot be supplied as a truthy string", () =>
  assert.ok(
    validateApplication({ ...submission, consent: "true" }, now).errors.consent,
  ));
test("forged submission identifiers and oversized names are rejected", () => {
  assert.ok(
    validateApplication({ ...submission, submissionKey: "not-a-uuid" }, now)
      .errors.submissionKey,
  );
  assert.ok(
    validateApplication({ ...submission, name: "x".repeat(121) }, now).errors
      .name,
  );
});

test("token validation accepts DCS-XXXX-XXX format case-insensitively and legacy tokens", () => {
  assert.equal(isValidToken("DCS-7K9P-M2X"), true);
  assert.equal(isValidToken("dcs-7k9p-m2x"), true);
  assert.equal(isValidToken("  Dcs-7k9p-m2X  "), true);
  assert.equal(normalizeToken("  dcs-7k9p-m2x  "), "DCS-7K9P-M2X");

  // Legacy/raw tokens (32-128 chars)
  const legacyToken = "a1b2c3d4e5f678901234567890123456";
  assert.equal(isValidToken(legacyToken), true);
  assert.equal(normalizeToken(legacyToken), legacyToken);

  // Invalid tokens
  for (const invalid of [
    "",
    "   ",
    "DCS-123-456", // only 3 chars in first block
    "DCS-1234-12",  // only 2 chars in second block
    "DCS-1234-1234", // 4 chars in second block
    "dcs_7k9p_m2x",  // wrong separator
    "short-token",
    null,
    undefined,
    12345,
  ]) {
    assert.equal(isValidToken(invalid), false);
  }
});

test("generateAccessToken produces canonical DCS-XXXX-XXX tokens", () => {
  for (let i = 0; i < 20; i++) {
    const token = generateAccessToken();
    assert.match(token, /^DCS-[A-Z0-9]{4}-[A-Z0-9]{3}$/);
    assert.equal(isValidToken(token), true);
  }
});

test("standing separates proven no-shows from attendance that still needs review", () => {
  const refNow = new Date("2026-11-15T12:00:00Z");

  assert.deepEqual(evaluateParticipantStanding([], refNow), {
    flagged: false,
    label: "Standing: Good Standing",
  });

  // Jupyter was ready and later shut down, but attendance is still unconfirmed.
  assert.deepEqual(
    evaluateParticipantStanding(
      [
        {
          status: "scheduled",
          proposed_end_at: "2026-11-10T12:00:00Z",
          access_grants: [
            {
              redeemed_at: "2026-11-10T08:45:00Z",
              redeem_expires_at: "2026-11-17T12:00:00Z",
              revoked_at: null,
            },
          ],
          compute_sessions: [{ status: "completed" }],
        },
      ],
      refNow,
    ),
    {
      flagged: false,
      needsReview: true,
      label: "Standing: Attendance Review Needed",
      reasons: ["Allocation (ID unavailable) (date unavailable): scheduled time passed; has compute record(s) with status completed, but attendance is unconfirmed."],
    },
  );

  // Cancelled session -> Good Standing
  assert.deepEqual(
    evaluateParticipantStanding(
      [
        {
          status: "cancelled",
          proposed_end_at: "2026-11-10T12:00:00Z",
          access_grants: [
            {
              redeemed_at: null,
              redeem_expires_at: "2026-11-12T12:00:00Z",
              revoked_at: null,
            },
          ],
        },
      ],
      refNow,
    ),
    {
      flagged: false,
      label: "Standing: Good Standing",
    },
  );

  // Scheduled session in the past without evidence is unknown, not a no-show.
  assert.deepEqual(
    evaluateParticipantStanding(
      [
        {
          status: "scheduled",
          proposed_end_at: "2026-11-10T12:00:00Z",
          access_grants: [
            {
              redeemed_at: null,
              redeem_expires_at: "2026-11-17T12:00:00Z",
              revoked_at: null,
            },
          ],
          compute_sessions: [],
        },
      ],
      refNow,
    ),
    {
      flagged: false,
      needsReview: true,
      label: "Standing: Attendance Review Needed",
      reasons: ["Allocation (ID unavailable) (date unavailable): scheduled time passed; has no compute-session record; attendance is unconfirmed."],
    },
  );

  // Expired unredeemed access grant is a review signal, not proof of absence.
  assert.deepEqual(
    evaluateParticipantStanding(
      [
        {
          status: "scheduled",
          proposed_end_at: "2026-11-20T12:00:00Z",
          access_grants: [
            {
              redeemed_at: null,
              redeem_expires_at: "2026-11-14T12:00:00Z",
              revoked_at: null,
            },
          ],
        },
      ],
      refNow,
    ),
    {
      flagged: false,
      needsReview: true,
      label: "Standing: Attendance Review Needed",
      reasons: ["Allocation (ID unavailable) (date unavailable): access grant expired without redemption; has no compute-session record; attendance is unconfirmed."],
    },
  );

  // Token redemption without a compute record is likewise unknown.
  assert.deepEqual(
    evaluateParticipantStanding(
      [
        {
          status: "scheduled",
          proposed_start_at: "2026-11-09T09:00:00Z",
          proposed_end_at: "2026-11-09T12:00:00Z",
          access_grants: [
            {
              redeemed_at: "2026-11-09T08:50:00Z",
              redeem_expires_at: "2026-11-16T12:00:00Z",
              revoked_at: null,
            },
          ],
          compute_sessions: [],
        },
      ],
      new Date("2026-11-13T12:00:00Z"),
    ),
    {
      flagged: false,
      needsReview: true,
      label: "Standing: Attendance Review Needed",
      reasons: ["Allocation (ID unavailable) (2026-11-09): scheduled time passed; has no compute-session record; attendance is unconfirmed."],
    },
  );
});

test("resolveEffectiveStatus distinguishes past unknown attendance, completed, active, and upcoming sessions", () => {
  const refNow = new Date("2026-11-13T12:00:00Z");

  // Past session without a compute record requires review; it is not inferred as unattended.
  const pastUnattended = {
    status: "scheduled",
    compute_allocations: [
      {
        status: "scheduled",
        proposed_start_at: "2026-11-09T09:00:00Z",
        proposed_end_at: "2026-11-09T12:00:00Z",
        access_grants: [{ redeemed_at: "2026-11-09T08:55:00Z" }],
        compute_sessions: [],
      },
    ],
  };
  assert.equal(resolveEffectiveStatus(pastUnattended, refNow), "scheduled");
  assert.deepEqual(
    evaluateParticipantStanding(pastUnattended.compute_allocations, refNow),
    {
      flagged: false,
      needsReview: true,
      label: "Standing: Attendance Review Needed",
      reasons: ["Allocation (ID unavailable) (2026-11-09): scheduled time passed; has no compute-session record; attendance is unconfirmed."],
    },
  );

  // System completion is not proof of human attendance.
  const pastAttended = {
    status: "scheduled",
    compute_allocations: [
      {
        status: "scheduled",
        proposed_start_at: "2026-11-09T09:00:00Z",
        proposed_end_at: "2026-11-09T12:00:00Z",
        access_grants: [{ redeemed_at: "2026-11-09T08:55:00Z" }],
        attendance_status: "attended",
        compute_sessions: [{ status: "completed" }],
      },
    ],
  };
  assert.equal(resolveEffectiveStatus(pastAttended, refNow), "completed");
  assert.deepEqual(
    evaluateParticipantStanding(pastAttended.compute_allocations, refNow),
    {
      flagged: false,
      label: "Standing: Good Standing",
    },
  );

  // Currently running session -> active
  const currentActive = {
    status: "scheduled",
    compute_allocations: [
      {
        status: "scheduled",
        proposed_start_at: "2026-11-13T10:00:00Z",
        proposed_end_at: "2026-11-13T14:00:00Z",
        compute_sessions: [{ status: "active" }],
      },
    ],
  };
  assert.equal(resolveEffectiveStatus(currentActive, refNow), "active");

  // Upcoming session -> scheduled
  const upcomingScheduled = {
    status: "scheduled",
    compute_allocations: [
      {
        status: "scheduled",
        proposed_start_at: "2026-11-15T09:00:00Z",
        proposed_end_at: "2026-11-15T12:00:00Z",
        compute_sessions: [],
      },
    ],
  };
  assert.equal(resolveEffectiveStatus(upcomingScheduled, refNow), "scheduled");
});

test("attendance standing flags only explicit no-show decisions and keeps their reasons", () => {
  assert.deepEqual(evaluateParticipantStanding([{
    status: "scheduled",
    proposed_end_at: "2026-11-10T12:00:00Z",
    attendance_status: "unattended",
    attendance_reason: "Applicant confirmed they could not attend.",
  }], new Date("2026-11-15T12:00:00Z")), {
    flagged: true,
    label: "Standing: Flagged (Unattended Session)",
    reasons: ["Applicant confirmed they could not attend."],
  });
  assert.equal(resolveEffectiveStatus({ status: "scheduled", compute_allocations: [{
    status: "scheduled", proposed_end_at: "2026-11-10T12:00:00Z", attendance_status: "unattended",
  }] }, new Date("2026-11-15T12:00:00Z")), "scheduled");
  for (const resolution of ["attended", "excused"]) {
    assert.equal(evaluateParticipantStanding([{
      id: "alloc-expired-grant", status: "scheduled", proposed_start_at: "2026-11-10T09:00:00Z",
      proposed_end_at: "2026-11-10T12:00:00Z", attendance_status: resolution,
      access_grants: [{ redeemed_at: null, revoked_at: null, redeem_expires_at: "2026-11-12T12:00:00Z" }],
    }], new Date("2026-11-15T12:00:00Z")).label, "Standing: Good Standing");
  }
});

test("attendance audit is latest-wins; only verified successful Jupyter activity counts", async () => {
  const { applyAttendanceReviews } = await import("../src/lib/validation.mjs");
  const allocation = { id: "alloc-1", status: "scheduled" };
  const logs = [
    { action: "attendance_evidence", target_id: "alloc-1", after_data: { verified: true, source: "jupyter" } },
    { action: "attendance_review", target_id: "alloc-1", actor_email: "admin@example.com", created_at: "2026-11-11T10:00:00Z", after_data: { status: "unattended", reason: "Applicant did not attend." } },
  ];
  assert.equal(applyAttendanceReviews([allocation], logs)[0].attendance_status, "unattended");
  assert.equal(applyAttendanceReviews([allocation], logs.slice(0, 1))[0].attendance_status, "attended");
  assert.equal(applyAttendanceReviews([allocation], [], { "alloc-1": [
    { source: "jupyter", path: "/api/status", status: 200 },
    { source: "portal", path: "/api/kernels", status: 200 },
    { source: "jupyter", path: "/api/kernels", status: 500 },
  ] })[0].attendance_status, undefined);
  assert.equal(applyAttendanceReviews([allocation], [], { "alloc-1": [
    { source: "jupyter", authenticated: true, category: "kernels", status: 101, timestamp: "2026-11-10T09:30:00Z" },
  ] })[0].attendance_status, "attended");
});

test("validateDeclineAlternatives validates 1-3 unique future timeslots and serializes/parses change requests", () => {
  const validSlots = [
    { date: "2026-11-09", start: "09:00", end: "12:00" },
    { date: "2026-11-10", start: "13:00", end: "16:00" },
    { date: "", start: "", end: "" },
  ];
  const res = validateDeclineAlternatives(validSlots, "  Class conflict on Monday  ", now);
  assert.equal(res.valid, true);
  assert.equal(res.alternativeSlots.length, 2);
  assert.equal(res.note, "Class conflict on Monday");

  // Empty slots rejected
  assert.equal(validateDeclineAlternatives([], "", now).valid, false);
  // Duplicate slots rejected
  assert.equal(
    validateDeclineAlternatives(
      [validSlots[0], validSlots[0]],
      "",
      now,
    ).valid,
    false,
  );
  // Partial slot rejected
  assert.equal(
    validateDeclineAlternatives(
      [{ date: "2026-11-09", start: "09:00", end: "" }],
      "",
      now,
    ).valid,
    false,
  );

  const raw = serializeChangeRequest(res.alternativeSlots, res.note);
  const parsed = parseChangeRequest(raw);
  assert.deepEqual(parsed, {
    note: "Class conflict on Monday",
    alternativeSlots: res.alternativeSlots,
  });
  assert.deepEqual(parseChangeRequest("Plain text legacy note"), {
    note: "Plain text legacy note",
    alternativeSlots: [],
  });
});

test("computeAdminAnalytics aggregates status counts and EC2 GPU breakdown hours", () => {
  const sampleRows = [
    {
      id: "1",
      status: "submitted",
      compute_allocations: [],
    },
    {
      id: "2",
      status: "revision_requested",
      compute_allocations: [],
    },
    {
      id: "3",
      status: "scheduled",
      compute_allocations: [
        {
          status: "scheduled",
          instance_type: "g4dn.xlarge",
          gpu_name: "NVIDIA T4",
          proposed_start_at: "2026-11-10T01:00:00Z",
          proposed_end_at: "2026-11-10T04:30:00Z",
        },
        {
          status: "cancelled",
          instance_type: "g4dn.xlarge",
          gpu_name: "NVIDIA T4",
          proposed_start_at: "2026-11-09T01:00:00Z",
          proposed_end_at: "2026-11-09T05:00:00Z",
        },
      ],
    },
    {
      id: "4",
      status: "user_confirmed",
      compute_allocations: [
        {
          status: "user_confirmed",
          instance_type: "g5.xlarge",
          gpu_name: "NVIDIA A10G",
          proposed_start_at: "2026-11-12T02:00:00Z",
          proposed_end_at: "2026-11-12T06:00:00Z",
        },
      ],
    },
    {
      id: "5",
      status: "rejected",
      compute_allocations: [],
    },
  ];

  const stats = computeAdminAnalytics(sampleRows, now);
  assert.equal(stats.total, 5);
  assert.equal(stats.awaitingReview, 1);
  assert.equal(stats.revisionRequested, 1);
  assert.equal(stats.confirmedOrScheduled, 2);
  assert.equal(stats.unattended, 0);
  assert.equal(stats.rejected, 1);

  const postSessionStats = computeAdminAnalytics(
    sampleRows.map((row) => row.id === "3" ? { ...row, standing: { needsReview: true } } : row),
    new Date("2026-11-13T12:00:00Z"),
  );
  assert.equal(postSessionStats.confirmedOrScheduled, 2);
  assert.equal(postSessionStats.unattended, 0);
  assert.equal(postSessionStats.attendanceReview, 1);

  const [t4, a10g, l4] = stats.gpuBreakdown;
  assert.equal(t4.display, "g4dn.xlarge [T4]");
  assert.equal(t4.count, 1);
  assert.equal(t4.hours, 3.5);
  assert.equal(a10g.display, "g5.xlarge [A10G]");
  assert.equal(a10g.count, 1);
  assert.equal(a10g.hours, 4);
  assert.equal(l4.display, "g6.xlarge [L4]");
  assert.equal(l4.count, 0);
  assert.equal(l4.hours, 0);
});

test("buildAdminApplicationsCsv formats LPJ CSV safely with escaped cells", () => {
  const csv = buildAdminApplicationsCsv([
    {
      id: "app-1",
      created_at: "2026-11-01T03:00:00Z",
      applicant_name: "Galih, Jr.",
      applicant_email: "galih@example.com",
      student_id: "4111422001",
      project_title: "=SUM(1,2) Benchmark",
      status: "scheduled",
      standing: { label: "Standing: Good Standing" },
      compute_allocations: [
        {
          status: "scheduled",
          instance_type: "g6.xlarge",
          gpu_name: "NVIDIA L4",
          proposed_start_at: "2026-11-10T01:00:00Z",
          proposed_end_at: "2026-11-10T03:00:00Z",
        },
      ],
    },
  ]);

  assert.ok(csv.includes("Application ID,Submitted Date,Applicant Name"));
  assert.ok(csv.includes('"Galih, Jr."'));
  assert.ok(csv.includes("'=SUM(1,2) Benchmark"));
  assert.ok(csv.includes("g6.xlarge - NVIDIA L4"));
});
