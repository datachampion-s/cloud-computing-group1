export const PROGRAMS = [
  "Statistics and Data Science",
  "Applied Statistical Computation",
  "Mathematics",
  "Mathematics Education",
  "Other",
];
export const TIME_OPTIONS = Array.from(
  { length: 48 },
  (_, i) =>
    `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);
export function jakartaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function driveLink(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      ["drive.google.com", "docs.google.com"].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      u.pathname !== "/"
    );
  } catch {
    return false;
  }
}
export function validSlot(slot, now = new Date()) {
  if (
    !slot ||
    !/^\d{4}-\d{2}-\d{2}$/.test(slot.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end)
  )
    return false;
  const start = new Date(`${slot.date}T${slot.start}:00+07:00`);
  const end = new Date(`${slot.date}T${slot.end}:00+07:00`);
  return (
    Number.isFinite(start.getTime()) &&
    jakartaToday(start) === slot.date &&
    start.getTime() >= now.getTime() - 5 * 60000 &&
    end > start &&
    end - start <= 12 * 3600000 &&
    start - now <= 90 * 86400000
  );
}
export function validateApplication(data, now = new Date()) {
  const errors = {};
  const trim = (key) =>
    typeof data?.[key] === "string" ? data[key].trim() : "";
  const value = {
    name: trim("name"),
    nim: trim("nim"),
    program: trim("program"),
    email: trim("email").toLowerCase(),
    title: trim("title"),
    ktm: trim("ktm"),
    proposal: trim("proposal"),
    preferences: data?.preferences,
    consent: data?.consent === true,
    submissionKey: trim("submissionKey"),
  };
  if (value.name.length < 3 || value.name.length > 120)
    errors.name = "Enter your full name using 3–120 characters.";
  if (!/^\d{8,20}$/.test(value.nim))
    errors.nim = "Enter a valid student ID using 8–20 digits.";
  if (!value.program || value.program.length > 100)
    errors.program = "Select or enter your study program.";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ||
    value.email.length > 254
  )
    errors.email = "Enter a valid email address.";
  if (value.title.length < 8 || value.title.length > 200)
    errors.title = "Enter a research or project title using 8–200 characters.";
  for (const key of ["ktm", "proposal"])
    if (!driveLink(value[key]) || value[key].length > 2000)
      errors[key] = "Enter a valid Google Drive or Google Docs file link.";
  if (
    !Array.isArray(value.preferences) ||
    value.preferences.length < 1 ||
    value.preferences.length > 3 ||
    value.preferences.some((s) => !validSlot(s, now))
  )
    errors.preferences =
      "Choose 1–3 future timeslots lasting 30 minutes–12 hours, within the next 90 days.";
  else if (
    new Set(value.preferences.map((s) => `${s.date}/${s.start}/${s.end}`))
      .size !== value.preferences.length
  )
    errors.preferences = "Each time preference must be different.";
  if (!value.consent)
    errors.consent = "Accept the usage terms before submitting.";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.submissionKey,
    )
  )
    errors.submissionKey = "Reload the page and try again.";
  return { value, errors, valid: Object.keys(errors).length === 0 };
}
export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(new Date(value));
}
export function formatTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function normalizeToken(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (/^dcs-[a-z0-9]{4}-[a-z0-9]{3}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

export function isValidToken(raw) {
  if (typeof raw !== "string") return false;
  const token = normalizeToken(raw);
  return (
    /^DCS-[A-Z0-9]{4}-[A-Z0-9]{3}$/.test(token) ||
    /^[A-Za-z0-9_-]{32,128}$/.test(token)
  );
}

const TOKEN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function generateAccessToken(randomSource) {
  if (randomSource) {
    const chars = Array.from(
      randomSource,
      (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length],
    );
    return `DCS-${chars.slice(0, 4).join("")}-${chars.slice(4, 7).join("")}`;
  }
  const chars = [];
  const limit = 252; // 7 * 36 — eliminates modulo bias
  while (chars.length < 7) {
    const buf = globalThis.crypto.getRandomValues(new Uint8Array(16));
    for (let i = 0; i < buf.length && chars.length < 7; i++) {
      if (buf[i] < limit) {
        chars.push(TOKEN_ALPHABET[buf[i] % TOKEN_ALPHABET.length]);
      }
    }
  }
  return `DCS-${chars.slice(0, 4).join("")}-${chars.slice(4, 7).join("")}`;
}

export function resolveEffectiveStatus(row, now = new Date()) {
  if (!row) return "";
  const rawStatus = row.status || "";
  if (["rejected", "cancelled"].includes(rawStatus)) return rawStatus;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const allocs = Array.isArray(row.compute_allocations)
    ? row.compute_allocations
    : row.compute_allocations
      ? [row.compute_allocations]
      : row.proposed_end_at || row.proposed_start_at || row.compute_sessions
        ? [row]
        : [];
  const alloc =
    allocs.find((a) => a && !["cancelled", "expired"].includes(a.status)) ||
    allocs[0];
  if (rawStatus !== "scheduled" && alloc?.status !== "scheduled") {
    return rawStatus;
  }
  if (!alloc) return rawStatus || "scheduled";
  const sessions = Array.isArray(alloc.compute_sessions)
    ? alloc.compute_sessions
    : alloc.compute_sessions
      ? [alloc.compute_sessions]
      : [];
  // Compute/Jupyter readiness and completion are operational state, not proof of attendance.
  const computeCompleted = alloc.status === "completed" || sessions.some((s) => s?.status === "completed");
  const startMs = alloc.proposed_start_at
    ? Date.parse(alloc.proposed_start_at)
    : NaN;
  const endMs = alloc.proposed_end_at ? Date.parse(alloc.proposed_end_at) : NaN;
  if (Number.isFinite(endMs) && endMs <= nowMs) {
    return computeCompleted ? "completed" : rawStatus;
  }
  if (
    Number.isFinite(startMs) &&
    startMs <= nowMs &&
    (!Number.isFinite(endMs) || nowMs < endMs)
  ) {
    return "active";
  }
  return "scheduled";
}

export function evaluateParticipantStanding(allocations = [], now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const reasons = [];
  const flaggedReasons = [];
  let needsReview = false;
  for (const alloc of allocations || []) {
    if (!alloc || ["cancelled", "expired"].includes(alloc.status)) continue;
    const grants = Array.isArray(alloc.access_grants)
      ? alloc.access_grants
      : alloc.access_grants
        ? [alloc.access_grants]
        : [];
    const sessions = Array.isArray(alloc.compute_sessions)
      ? alloc.compute_sessions
      : alloc.compute_sessions
        ? [alloc.compute_sessions]
        : [];
    const endMs = alloc.proposed_end_at ? Date.parse(alloc.proposed_end_at) : NaN;
    const sessionExpired = Number.isFinite(endMs) && endMs <= nowMs;
    const expiredGrant = grants.some(
      (g) => !g.redeemed_at && !g.revoked_at && g.redeem_expires_at && Date.parse(g.redeem_expires_at) <= nowMs,
    );
    if (alloc.attendance_status === "attended" || alloc.attendance_status === "excused") continue;
    if (["unattended", "no_show"].includes(alloc.status) || alloc.attendance_status === "unattended") {
      const reason = alloc.attendance_reason || "Recorded as unattended; no admin explanation is on file.";
      reasons.push(reason);
      flaggedReasons.push(reason);
    } else if (expiredGrant || sessionExpired) {
      needsReview = true;
      const date = alloc.proposed_start_at ? new Date(alloc.proposed_start_at).toISOString().slice(0, 10) : "date unavailable";
      const allocation = `Allocation ${alloc.id || "(ID unavailable)"} (${date})`;
      const sessionStatuses = sessions.map((s) => s?.status).filter(Boolean);
      const attendanceEvidence = sessionStatuses.length
        ? `has compute record(s) with status ${sessionStatuses.join(", ")}, but attendance is unconfirmed`
        : "has no compute-session record; attendance is unconfirmed";
      reasons.push(expiredGrant
        ? `${allocation}: access grant expired without redemption; ${attendanceEvidence}.`
        : `${allocation}: scheduled time passed; ${attendanceEvidence}.`);
    }
  }
  if (flaggedReasons.length) return { flagged: true, label: "Standing: Flagged (Unattended Session)", reasons: flaggedReasons };
  if (needsReview) return { flagged: false, needsReview: true, label: "Standing: Attendance Review Needed", reasons };
  return { flagged: false, label: "Standing: Good Standing" };
}

export function applyAttendanceReviews(allocations = [], auditLogs = [], verifiedAttendance = {}) {
  const latest = new Map();
  const durableEvidence = new Set();
  for (const log of auditLogs || []) {
    if (!log.target_id) continue;
    if (log.action === "attendance_evidence" && log.after_data?.verified === true && log.after_data?.source === "jupyter") durableEvidence.add(log.target_id);
    if (log.action !== "attendance_review") continue;
    const previous = latest.get(log.target_id);
    if (!previous || Date.parse(log.created_at) > Date.parse(previous.created_at)) latest.set(log.target_id, log);
  }
  return (allocations || []).map((allocation) => {
    const review = latest.get(allocation.id);
    if (review) return {
      ...allocation,
      attendance_status: review.after_data?.status || null,
      attendance_reason: review.after_data?.reason || "",
      attendance_reviewed_at: review.created_at,
      attendance_reviewed_by: review.actor_email || "",
    };
    if (durableEvidence.has(allocation.id)) return {
      ...allocation,
      attendance_status: "attended",
      attendance_reason: "Verified authenticated Jupyter activity recorded; durable evidence is on file.",
      attendance_reviewed_at: null,
      attendance_reviewed_by: "Verified Jupyter access evidence",
    };
    const events = Array.isArray(verifiedAttendance[allocation.id])
      ? verifiedAttendance[allocation.id]
      : verifiedAttendance[allocation.id] ? [verifiedAttendance[allocation.id]] : [];
    const event = events.find((item) => item?.source === "jupyter" && item.authenticated === true && ["contents", "sessions", "kernels"].includes(item.category) &&
      [200, 201, 204, 101].includes(item.status));
    if (!event) return allocation;
    const date = event.timestamp ? new Date(event.timestamp).toISOString().slice(0, 10) : "date unavailable";
    return {
      ...allocation,
      attendance_status: "attended",
      attendance_reason: `Verified authenticated Jupyter activity on ${date} (CloudWatch evidence; retained for 30 days).`,
      attendance_reviewed_at: event.timestamp || null,
      attendance_reviewed_by: "Verified Jupyter access log",
    };
  });
}

export function validateDeclineAlternatives(slots, note = "", now = new Date()) {
  const trimmedNote = typeof note === "string" ? note.trim() : "";
  if (trimmedNote.length > 2000) {
    return {
      valid: false,
      error: "Please keep your note under 2,000 characters.",
    };
  }
  const list = Array.isArray(slots)
    ? slots.filter((s) => s && (s.date || s.start || s.end))
    : [];
  if (
    list.length < 1 ||
    list.length > 3 ||
    list.some((s) => !validSlot(s, now))
  ) {
    return {
      valid: false,
      error:
        "Choose 1–3 future alternative timeslots lasting 30 minutes–12 hours, within the next 90 days.",
    };
  }
  if (
    new Set(list.map((s) => `${s.date}/${s.start}/${s.end}`)).size !==
    list.length
  ) {
    return {
      valid: false,
      error: "Each alternative timeslot must be different.",
    };
  }
  return {
    valid: true,
    alternativeSlots: list.map((s) => ({
      date: s.date.trim(),
      start: s.start.trim(),
      end: s.end.trim(),
    })),
    note: trimmedNote,
  };
}

export function serializeChangeRequest(alternativeSlots = [], note = "") {
  return JSON.stringify({
    note: typeof note === "string" ? note.trim() : "",
    alternativeSlots: Array.isArray(alternativeSlots) ? alternativeSlots : [],
  });
}

export function parseChangeRequest(raw) {
  if (!raw) return { note: "", alternativeSlots: [] };
  if (typeof raw === "object") {
    return {
      note: typeof raw.note === "string" ? raw.note : "",
      alternativeSlots: Array.isArray(raw.alternativeSlots)
        ? raw.alternativeSlots
        : [],
    };
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          note: typeof parsed.note === "string" ? parsed.note : "",
          alternativeSlots: Array.isArray(parsed.alternativeSlots)
            ? parsed.alternativeSlots
            : [],
        };
      }
    } catch {
      return { note: raw, alternativeSlots: [] };
    }
  }
  return { note: "", alternativeSlots: [] };
}

export function computeAdminAnalytics(rows = [], now = new Date()) {
  const list = Array.isArray(rows) ? rows : [];
  const gpuMap = {
    t4: {
      key: "t4",
      instanceType: "g4dn.xlarge",
      gpuLabel: "T4",
      display: "g4dn.xlarge [T4]",
      count: 0,
      hours: 0,
    },
    a10g: {
      key: "a10g",
      instanceType: "g5.xlarge",
      gpuLabel: "A10G",
      display: "g5.xlarge [A10G]",
      count: 0,
      hours: 0,
    },
    l4: {
      key: "l4",
      instanceType: "g6.xlarge",
      gpuLabel: "L4",
      display: "g6.xlarge [L4]",
      count: 0,
      hours: 0,
    },
  };

  for (const row of list) {
    const allocs = Array.isArray(row?.compute_allocations)
      ? row.compute_allocations
      : row?.compute_allocations
        ? [row.compute_allocations]
        : [];
    for (const alloc of allocs) {
      if (!alloc || ["cancelled", "expired"].includes(alloc.status)) continue;
      const inst = (alloc.instance_type || "").toLowerCase();
      const gpu = (alloc.gpu_name || "").toLowerCase();
      let bucket = null;
      if (inst === "g4dn.xlarge" || gpu.includes("t4")) bucket = gpuMap.t4;
      else if (inst === "g5.xlarge" || gpu.includes("a10g"))
        bucket = gpuMap.a10g;
      else if (inst === "g6.xlarge" || gpu.includes("l4")) bucket = gpuMap.l4;
      if (!bucket) continue;

      bucket.count += 1;
      const startMs = alloc.proposed_start_at
        ? Date.parse(alloc.proposed_start_at)
        : NaN;
      const endMs = alloc.proposed_end_at
        ? Date.parse(alloc.proposed_end_at)
        : NaN;
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        bucket.hours = Number(
          (bucket.hours + (endMs - startMs) / 3600000).toFixed(1),
        );
      }
    }
  }

  const statuses = list.map(
    (r) => r?.effectiveStatus || resolveEffectiveStatus(r, now),
  );

  return {
    total: list.length,
    awaitingReview: statuses.filter((s) =>
      [
        "submitted",
        "under_review",
        "approved_in_principle",
        "awaiting_availability",
      ].includes(s),
    ).length,
    revisionRequested: statuses.filter((s) => s === "revision_requested")
      .length,
    confirmedOrScheduled: statuses.filter((s) =>
      ["user_confirmed", "scheduled", "active", "completed"].includes(s),
    ).length,
    completed: statuses.filter((s) => s === "completed").length,
    unattended: statuses.filter((s) => s === "unattended").length,
    attendanceReview: list.filter((r) => r?.standing?.needsReview).length,
    rejected: statuses.filter((s) => s === "rejected").length,
    gpuBreakdown: [gpuMap.t4, gpuMap.a10g, gpuMap.l4],
  };
}

function escapeCsvCell(value) {
  const str = value == null ? "" : String(value);
  const safe = /^[\s]*[=+\-@|\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

export function buildAdminApplicationsCsv(rows = [], now = new Date()) {
  const headers = [
    "Application ID",
    "Submitted Date",
    "Applicant Name",
    "Applicant Email",
    "Student ID (NIM)",
    "Project Title",
    "Status",
    "Standing",
    "GPU Instance",
    "Compute Hours",
  ];
  const lines = [headers.join(",")];
  for (const r of Array.isArray(rows) ? rows : []) {
    const allocs = Array.isArray(r?.compute_allocations)
      ? r.compute_allocations
      : r?.compute_allocations
        ? [r.compute_allocations]
        : [];
    const activeAlloc =
      allocs.find((a) => a && !["cancelled", "expired"].includes(a.status)) ||
      allocs[0] ||
      null;
    let hours = 0;
    if (activeAlloc?.proposed_start_at && activeAlloc?.proposed_end_at) {
      const diff =
        (Date.parse(activeAlloc.proposed_end_at) -
          Date.parse(activeAlloc.proposed_start_at)) /
        3600000;
      if (Number.isFinite(diff) && diff > 0) hours = Number(diff.toFixed(1));
    }
    const gpuInstance = activeAlloc
      ? [activeAlloc.instance_type, activeAlloc.gpu_name]
          .filter(Boolean)
          .join(" - ")
      : "";
    const standingLabel = r?.standing?.label || "Standing: Good Standing";
    const submittedDate = r?.created_at ? formatDate(r.created_at) : "";
    const effectiveStatus = r?.effectiveStatus || resolveEffectiveStatus(r, now);
    lines.push(
      [
        r?.id || "",
        submittedDate,
        r?.applicant_name || "",
        r?.applicant_email || "",
        r?.student_id || "",
        r?.project_title || "",
        effectiveStatus || "",
        standingLabel,
        gpuInstance,
        hours || "",
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function validateRevisionSubmission(data) {
  const errors = {};
  const trim = (k) => (typeof data?.[k] === "string" ? data[k].trim() : "");
  const note = trim("note");
  const proposal = trim("proposal_drive_url") || trim("proposal");
  const ktm = trim("ktm_drive_url") || trim("ktm");
  const key = trim("key") || trim("submissionKey") || trim("submission_key");

  if (!note) {
    errors.note = "Provide a revision response explaining your updates.";
  } else if (note.length > 2000) {
    errors.note = "Please keep your revision response under 2,000 characters.";
  }

  if (proposal && !driveLink(proposal)) {
    errors.proposal_drive_url =
      "Use an https://drive.google.com or https://docs.google.com link.";
  }
  if (ktm && !driveLink(ktm)) {
    errors.ktm_drive_url =
      "Use an https://drive.google.com or https://docs.google.com link.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      key,
      note,
      proposal_drive_url: proposal,
      ktm_drive_url: ktm,
    },
  };
}
