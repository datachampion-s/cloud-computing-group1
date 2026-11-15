"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AttendanceReviewForm({ applicationId, allocation }) {
  const router = useRouter();
  const [resolution, setResolution] = useState(allocation.attendance_status || "excused");
  const [reason, setReason] = useState(allocation.attendance_reason || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attendance_review", allocationId: allocation.id, resolution, reason }),
      });
      const data = await response.json();
      setMessage(data.message || data.error || "Review could not be saved.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("Connection lost. Refresh the page before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="field-hint">This decision records historical attendance for this allocation and updates applicant standing. It does not change the compute session status.</p>
      {allocation.attendance_status && <p className="field-hint">Previous decision: {allocation.attendance_status}. {allocation.attendance_reason} (reviewed {allocation.attendance_reviewed_at ? new Date(allocation.attendance_reviewed_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) : "date unavailable"} WIB)</p>}
      <div className="field-grid">
        <div className="field">
          <label htmlFor={`attendance-${allocation.id}`}>Attendance review</label>
          <select id={`attendance-${allocation.id}`} value={resolution} onChange={(e) => setResolution(e.target.value)}>
            <option value="attended">Attended</option>
            <option value="unattended">Unattended (no-show)</option>
            <option value="excused">Excused</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`attendance-reason-${allocation.id}`}>Admin reason (required)</label>
          <textarea id={`attendance-reason-${allocation.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Record the evidence or reason for this decision." />
        </div>
      </div>
      <button type="button" className="button button-outline button-small" disabled={busy || reason.trim().length < 5} onClick={save}>{busy ? "Saving…" : "Save attendance review"}</button>
      {message && <p className="field-hint" role="status">{message}</p>}
    </div>
  );
}
