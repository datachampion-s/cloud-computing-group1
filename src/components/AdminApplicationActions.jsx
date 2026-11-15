"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Lock, RotateCcw, Send } from "lucide-react";
import DatePicker from "./DatePicker";
export default function AdminApplicationActions({
  applicationId,
  status,
  rejectionNote = "",
  preferences,
  mailReady,
}) {
  const router = useRouter();
  const first = preferences?.[0] || {};
  const [decision, setDecision] = useState("approved_in_principle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reopened, setReopened] = useState(false);
  const [localStatus, setLocalStatus] = useState(status);
  const [localRejectionNote, setLocalRejectionNote] = useState(rejectionNote);
  const effectiveStatus =
    localStatus !== status && status === "rejected" ? "rejected" : localStatus;
  const displayedRejectionNote = localRejectionNote || rejectionNote;
  const [allocation, setAllocation] = useState({
    date: first.date || "",
    start: first.start || "",
    end: first.end || "",
    gpu: "t4",
    workspace: 100,
    cost: 10,
  });
  const set = (key, value) => setAllocation((a) => ({ ...a, [key]: value }));
  async function action(body) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setError(!res.ok);
      setMessage(data.message || data.error || "Request completed.");
      if (res.ok) {
        if (body.action === "review") {
          setLocalStatus(body.decision);
          if (body.decision === "rejected") {
            setLocalRejectionNote(body.note || "");
            setReopened(false);
          } else {
            setReopened(false);
          }
        }
        router.refresh();
      }
    } catch {
      setError(true);
      setMessage(
        "Connection lost. Refresh the current status before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (effectiveStatus === "rejected" && !reopened) {
    return (
      <>
        <section className="panel admin-locked-banner" role="region" aria-label="Application Closed">
          <div className="admin-locked-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={16} color="#b91c1c" />
              <h3 style={{ color: "#b91c1c", margin: 0 }}>
                Application Closed (Rejected)
              </h3>
            </div>
            <span className="status-badge status-rejected">rejected</span>
          </div>
          <p className="field-hint" style={{ marginBottom: 8 }}>
            This application has been rejected. Review decisions and timeslot
            proposals are locked to prevent accidental modifications.
          </p>
          <div className="admin-locked-note">
            <strong style={{ display: "block", marginBottom: 4 }}>
              Recorded rejection note:
            </strong>
            {displayedRejectionNote || "No additional rejection note recorded."}
          </div>
          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => {
              setReopened(true);
              setDecision("approved_in_principle");
            }}
          >
            <RotateCcw size={14} />
            Re-open Application
          </button>
        </section>
        {message && (
          <div
            className={`notice ${error ? "error" : "success"}`}
            role="status"
            style={{ marginTop: 20 }}
          >
            {message}
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <section className="panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0 }}>Review & decision</h3>
          {effectiveStatus === "rejected" && reopened && (
            <button
              type="button"
              className="button button-outline button-small"
              onClick={() => setReopened(false)}
            >
              Keep Closed
            </button>
          )}
        </div>
        <p className="field-hint" style={{ marginBottom: 18 }}>
          Approval in principle does not issue an access token or launch
          compute. Requesting a revision or rejecting the application emails
          your admin note to the applicant.
        </p>
        <div className="field">
          <label htmlFor="decision">Decision</label>
          <select
            id="decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="approved_in_principle">Approve in principle</option>
            <option value="revision_requested">Request revision</option>
            <option value="rejected">Reject application</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="review-note">Admin note</label>
          <textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for the decision and any points to address"
            maxLength={2000}
          />
        </div>
        <button
          className="button button-primary button-small"
          disabled={busy || status === "scheduled"}
          onClick={() => action({ action: "review", decision, note })}
        >
          <Check size={15} />
          Save decision
        </button>
      </section>
      <section className="panel">
        <h3>Propose a timeslot</h3>
        <p className="field-hint" style={{ marginBottom: 18 }}>
          A timeslot is held until the confirmation deadline. Resending replaces
          previous confirmation links.
        </p>
        <div className="field-grid">
          <div className="field">
            <span className="field-label">Date (WIB)</span>
            <DatePicker
              value={allocation.date}
              onChange={(v) => set("date", v)}
              label="Proposed session date"
            />
          </div>
          <div className="field">
            <label htmlFor="gpu">Proposed GPU</label>
            <select
              id="gpu"
              value={allocation.gpu}
              onChange={(e) => set("gpu", e.target.value)}
            >
              <option value="t4">NVIDIA T4 · g4dn.xlarge</option>
              <option value="a10g">NVIDIA A10G · g5.xlarge</option>
              <option value="l4">NVIDIA L4 · g6.xlarge</option>
            </select>
          </div>
          {["start", "end"].map((key) => (
            <div className="field" key={key}>
              <label htmlFor={`admin-${key}`}>
                {key === "start" ? "Start" : "End"} (WIB)
              </label>
              <input
                id={`admin-${key}`}
                type="time"
                className="field-input"
                step="60"
                value={allocation[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="workspace">EBS workspace (GB)</label>
            <input
              id="workspace"
              type="number"
              min={20}
              max={2000}
              step={10}
              value={allocation.workspace}
              onChange={(e) => set("workspace", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="cost-limit">Session cost ceiling (USD)</label>
            <input
              id="cost-limit"
              type="number"
              min={1}
              max={1000}
              step={1}
              value={allocation.cost}
              onChange={(e) => set("cost", Number(e.target.value))}
            />
          </div>
        </div>
        <button
          className="button button-primary button-small"
          disabled={
            busy ||
            !mailReady ||
            ![
              "approved_in_principle",
              "awaiting_availability",
              "user_confirmed",
            ].includes(effectiveStatus)
          }
          onClick={() => {
            if (
              window.confirm(
                "Save this proposed timeslot and send a confirmation email to the applicant?",
              )
            )
              action({ action: "propose", ...allocation });
          }}
        >
          <Send size={14} />
          {busy ? "Processing…" : "Send proposed timeslot"}
        </button>
        {!mailReady && (
          <p className="field-hint" style={{ marginTop: 12 }}>
            Complete the Gmail API credentials before sending email.
          </p>
        )}
        <div className="notice" style={{ marginTop: 22, marginBottom: 0 }}>
          <Info size={16} />
          <span>
            Verify AWS capacity, GPU quotas, and costs before finalization. AWS
            automation is not enabled yet.
          </span>
        </div>
      </section>
      {message && (
        <div
          className={`notice ${error ? "error" : "success"}`}
          role="status"
          style={{ marginTop: 20 }}
        >
          {message}
        </div>
      )}
    </>
  );
}
