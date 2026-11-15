"use client";
import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  FileText,
  Info,
  Send,
} from "lucide-react";
import {
  driveLink,
  formatDate,
  validateRevisionSubmission,
} from "@/lib/validation.mjs";

export default function RevisionForm({
  application,
  submissionKey,
  latestFeedback = "",
  feedbackDate = "",
  loadError = "",
}) {
  const [note, setNote] = useState("");
  const [proposalUrl, setProposalUrl] = useState("");
  const [ktmUrl, setKtmUrl] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (loadError || !application) {
    return (
      <div className="form-card">
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          <span>{loadError || "Unable to load application details."}</span>
        </div>
        <p style={{ marginTop: 18 }}>
          Please check the revision link in your email or return to the main
          portal.
        </p>
        <div className="form-actions" style={{ marginTop: 24 }}>
          <Link className="button button-outline" href="/landing">
            Back to DCS Compute
          </Link>
        </div>
      </div>
    );
  }

  if (submitted || application.status !== "revision_requested") {
    const isUnderReview =
      submitted || application.status === "under_review";
    return (
      <div className="form-card receipt" role="status" aria-live="polite">
        <div className="receipt-icon">
          <Check size={24} />
        </div>
        <span className="eyebrow">
          DCS-{application.id.slice(0, 8).toUpperCase()}
        </span>
        <h2>
          {isUnderReview
            ? "Revision submitted for re-evaluation."
            : `Application status: ${application.status.replaceAll("_", " ")}`}
        </h2>
        <p>
          {isUnderReview
            ? `Thank you, ${application.applicant_name}. Your revision response for "${application.project_title}" has been recorded and the DCS administrator has been notified.`
            : `This application (${application.project_title}) is currently marked as ${application.status.replaceAll("_", " ")} and does not have an open revision request.`}
        </p>
        <div className="form-actions" style={{ marginTop: 26 }}>
          <Link className="button button-primary" href="/landing">
            Return to DCS Compute
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    const check = validateRevisionSubmission({
      key: submissionKey,
      note,
      proposal_drive_url: proposalUrl,
      ktm_drive_url: ktmUrl,
    });
    if (!check.valid) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${application.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: submissionKey,
          note: check.value.note,
          proposal_drive_url: check.value.proposal_drive_url,
          ktm_drive_url: check.value.ktm_drive_url,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (payload.errors) setErrors(payload.errors);
        setMessage(
          payload.error || "Could not submit your revision. Please try again.",
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setMessage("Connection error. Please check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  const displayedFeedback =
    latestFeedback?.trim() ||
    "Please review and clarify your research methodology, dataset scope, and document links.";

  return (
    <form className="form-card" onSubmit={handleSubmit} noValidate>
      <div className="step-header">
        <span className="eyebrow">
          DCS-{application.id.slice(0, 8).toUpperCase()} · REVISION REQUESTED
        </span>
        <h2>{application.project_title}</h2>
        <p>Applicant: {application.applicant_name}</p>
      </div>

      <div
        className="revision-feedback-callout"
        role="region"
        aria-label="Reviewer Feedback"
      >
        <div className="revision-feedback-header">
          <strong>Reviewer Feedback &amp; Required Revisions</strong>
          {feedbackDate && (
            <span>Requested {formatDate(feedbackDate)}</span>
          )}
        </div>
        <p className="revision-feedback-body">{displayedFeedback}</p>
      </div>

      {(driveLink(application.proposal_drive_url) ||
        driveLink(application.ktm_drive_url)) && (
        <div className="current-docs-bar">
          <span className="field-hint">Current documents on file:</span>
          <div className="document-links" style={{ marginTop: 6 }}>
            {driveLink(application.proposal_drive_url) && (
              <a
                href={application.proposal_drive_url}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={14} />
                Current Proposal
                <ArrowUpRight size={13} />
              </a>
            )}
            {driveLink(application.ktm_drive_url) && (
              <a
                href={application.ktm_drive_url}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={14} />
                Current KTM
                <ArrowUpRight size={13} />
              </a>
            )}
          </div>
        </div>
      )}

      {message && (
        <div className="notice error" role="alert" style={{ marginBottom: 18 }}>
          <Info size={16} />
          <span>{message}</span>
        </div>
      )}

      <div className="field">
        <label htmlFor="revision-note">
          Revision Response / Notes <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="revision-note"
          rows={5}
          required
          maxLength={2000}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setErrors((prev) => ({ ...prev, note: undefined }));
          }}
          placeholder="Here is the updated KTM link and explanation of the changes made to the methodology..."
        />
        <span className="field-hint">
          Summarize how you addressed the reviewer’s feedback (required, max
          2,000 characters).
        </span>
        {errors.note && <span className="field-error">{errors.note}</span>}
      </div>

      <div className="field">
        <label htmlFor="proposal-drive-url">
          Updated Proposal Google Drive Link (optional)
        </label>
        <input
          id="proposal-drive-url"
          type="url"
          value={proposalUrl}
          onChange={(e) => {
            setProposalUrl(e.target.value);
            setErrors((prev) => ({ ...prev, proposal_drive_url: undefined }));
          }}
          placeholder="https://docs.google.com/document/d/... or leave blank to keep current link"
        />
        <span className="field-hint">
          Provide a new link only if you created a new Google Drive / Docs file.
        </span>
        {errors.proposal_drive_url && (
          <span className="field-error">{errors.proposal_drive_url}</span>
        )}
      </div>

      <div className="field">
        <label htmlFor="ktm-drive-url">
          Updated Student ID / KTM Google Drive Link (optional)
        </label>
        <input
          id="ktm-drive-url"
          type="url"
          value={ktmUrl}
          onChange={(e) => {
            setKtmUrl(e.target.value);
            setErrors((prev) => ({ ...prev, ktm_drive_url: undefined }));
          }}
          placeholder="https://drive.google.com/file/d/... or leave blank to keep current link"
        />
        <span className="field-hint">
          Provide a new link if the reviewer requested an updated or shared KTM
          file.
        </span>
        {errors.ktm_drive_url && (
          <span className="field-error">{errors.ktm_drive_url}</span>
        )}
      </div>

      <div className="form-actions" style={{ marginTop: 24 }}>
        <button
          type="submit"
          className="button button-primary"
          disabled={busy}
        >
          <Send size={15} />
          {busy ? "Submitting revision..." : "Submit Proposal Revision"}
        </button>
      </div>
    </form>
  );
}
