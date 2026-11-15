"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound } from "lucide-react";

export default function FinalizeScheduleButton({
  applicationId,
  canFinalize,
  isScheduled,
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [issuedToken, setIssuedToken] = useState("");

  async function handleFinalize() {
    if (
      !window.confirm(
        "Finalize this confirmed schedule, generate an access token, and send the invitation email to the applicant?",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize" }),
      });
      const data = await res.json();
      setError(!res.ok);
      setMessage(data.message || data.error || "Request completed.");
      if (res.ok) {
        if (data.token) setIssuedToken(data.token);
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

  return (
    <div style={{ marginTop: 14 }}>
      <button
        type="button"
        className={`button button-small ${canFinalize && !isScheduled && !issuedToken ? "button-primary" : "button-outline"}`}
        disabled={busy || !canFinalize || isScheduled || !!issuedToken}
        onClick={handleFinalize}
      >
        <Check size={14} />
        {busy
          ? "Finalizing…"
          : isScheduled || issuedToken
            ? "Schedule Finalized"
            : "Finalize & Schedule"}
      </button>
      {!canFinalize && !isScheduled && !issuedToken && (
        <p className="field-hint" style={{ marginTop: 12 }}>
          Finalization and token issuance become available once the applicant
          confirms a proposed timeslot.
        </p>
      )}
      {issuedToken && (
        <div
          className="notice success"
          role="status"
          style={{ marginTop: 14, marginBottom: 0 }}
        >
          <KeyRound size={16} />
          <div>
            <strong>Issued Access Token:</strong>{" "}
            <code className="application-ref" style={{ margin: "0 0 0 6px", padding: "4px 9px" }}>
              {issuedToken}
            </code>
            {message && (
              <div style={{ marginTop: 4 }}>{message}</div>
            )}
          </div>
        </div>
      )}
      {message && !issuedToken && (
        <div
          className={`notice ${error ? "error" : "success"}`}
          role="status"
          style={{ marginTop: 14, marginBottom: 0 }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
