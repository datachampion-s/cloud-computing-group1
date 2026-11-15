"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  Info,
  Plus,
  Send,
  ShieldCheck,
} from "lucide-react";
import DatePicker from "./DatePicker";
import {
  PROGRAMS,
  TIME_OPTIONS,
  validateApplication,
} from "@/lib/validation.mjs";
export default function ApplicationForm({ adminEmail, templateUrl }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    name: "",
    nim: "",
    program: PROGRAMS[0],
    email: "",
    title: "",
    ktm: "",
    proposal: "",
    preferences: [{ date: "", start: "", end: "" }],
    consent: false,
    submissionKey: "",
  });
  const [otherProgram, setOtherProgram] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const heading = useRef(null);
  useEffect(() => {
    setData((d) => ({ ...d, submissionKey: crypto.randomUUID() }));
  }, []);
  function field(key, value) {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }
  function slot(index, key, value) {
    field(
      "preferences",
      data.preferences.map((s, i) =>
        i === index ? { ...s, [key]: value } : s,
      ),
    );
  }
  function go(n) {
    setStep(n);
    setTimeout(() => heading.current?.focus(), 0);
  }
  function next() {
    const validation = validateApplication(data);
    const keys =
      step === 0
        ? ["name", "nim", "program", "email"]
        : ["title", "ktm", "proposal"];
    const relevant = Object.fromEntries(
      Object.entries(validation.errors).filter(([k]) => keys.includes(k)),
    );
    setErrors(relevant);
    setMessage(
      Object.keys(relevant).length
        ? "Please complete the highlighted fields to continue."
        : "",
    );
    if (!Object.keys(relevant).length) go(step + 1);
  }
  async function submit(e) {
    e.preventDefault();
    if (step < 2) {
      next();
      return;
    }
    setMessage("");
    const validation = validateApplication(data);
    setErrors(validation.errors);
    if (!validation.valid) {
      setMessage("Review the highlighted fields before submitting.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          website: new FormData(e.currentTarget).get("website"),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrors(result.errors || {});
        throw new Error(
          result.error ||
            "Your application could not be submitted. Please try again shortly.",
        );
      }
      setReceipt(result.reference);
    } catch (err) {
      setMessage(
        err.message || "Connection lost. Please try submitting again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function input(key, label, placeholder, type = "text") {
    return (
      <div className="field">
        <label htmlFor={key}>
          {label}
          <span className="required">*</span>
        </label>
        <input
          id={key}
          type={type}
          name={key}
          value={data[key]}
          onChange={(e) => field(key, e.target.value)}
          placeholder={placeholder}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${key}-error` : undefined}
          autoComplete={
            key === "name" ? "name" : key === "email" ? "email" : "off"
          }
          maxLength={key === "title" ? 200 : 2000}
          inputMode={key === "nim" ? "numeric" : undefined}
        />
        {errors[key] && (
          <span className="field-error" id={`${key}-error`}>
            {errors[key]}
          </span>
        )}
      </div>
    );
  }
  if (receipt)
    return (
      <div className="form-card success-card" role="status">
        <span className="success-mark">
          <Check size={30} />
        </span>
        <h2>Your idea is in good hands.</h2>
        <p>
          Your application has been received and will be reviewed within 3
          business days. Keep this reference; the DCS admin will contact you at{" "}
          <strong>{data.email}</strong>
          with the decision and proposed schedule.
        </p>
        <div className="application-ref">{receipt}</div>
        <div>
          <Link className="button button-primary" href="/landing">
            Back to home <ArrowUpRight size={16} />
          </Link>
        </div>
        <p className="field-hint">
          Submitting an application does not guarantee approval or reserve
          computing time.
        </p>
      </div>
    );
  return (
    <form className="form-card" onSubmit={submit} noValidate>
      <div className="form-progress" aria-label={`Step ${step + 1} of 3`}>
        {["Your details", "Documents", "Availability"].map((s, i) => (
          <div
            key={s}
            className={i === step ? "active" : i < step ? "complete" : ""}
          >
            <span className="number">
              {i < step ? <Check size={12} /> : i + 1}
            </span>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="form-heading" ref={heading} tabIndex={-1}>
        <h2>
          {
            [
              "Let’s start with you.",
              "Tell us what you’re exploring.",
              "Find a time that works.",
            ][step]
          }
        </h2>
        <p>
          {
            [
              "Enter your student details and an active email for application updates.",
              "Share your student card and proposal through Google Drive.",
              "Choose up to three time preferences. All times are in WIB (UTC+7).",
            ][step]
          }
        </p>
      </div>
      {message && (
        <div className="notice error" role="alert">
          <Info size={17} />
          <span>{message}</span>
        </div>
      )}
      {step === 0 && (
        <>
          {input("name", "Full name", "As shown on your student card")}
          <div className="field-grid">
            {input(
              "nim",
              "Student ID (NIM)",
              "Your student identification number",
            )}
            <div className="field">
              <label htmlFor="program-select">
                Study program<span className="required">*</span>
              </label>
              <select
                id="program-select"
                value={otherProgram ? "Other" : data.program}
                onChange={(e) => {
                  setOtherProgram(e.target.value === "Other");
                  field(
                    "program",
                    e.target.value === "Other" ? "" : e.target.value,
                  );
                }}
              >
                {PROGRAMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              {otherProgram && (
                <input
                  aria-label="Study program name"
                  placeholder="Enter your study program"
                  value={data.program}
                  onChange={(e) => field("program", e.target.value)}
                />
              )}
              {errors.program && (
                <span className="field-error">{errors.program}</span>
              )}
            </div>
          </div>
          {input("email", "Email address", "you@example.com", "email")}
          <div className="notice">
            <ShieldCheck size={17} />
            <span>
              We use this email for review updates, schedule confirmation, and
              your access invitation. Check it before continuing.
            </span>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          {input(
            "title",
            "Research / project title",
            "Example: Image classification for plant identification",
          )}
          <div className="notice">
            <Info size={17} />
            <span>
              Share both files with <strong>Viewer</strong> access for{" "}
              <strong>
                {adminEmail ||
                  "the DCS admin email (contact DCS for the address)"}
              </strong>
              . Keep your student card private.
            </span>
          </div>
          {input(
            "ktm",
            "Google Drive link — student card (KTM)",
            "https://drive.google.com/file/d/...",
            "url",
          )}
          <div className="template-row">
            <span className="field-label">Research / competition proposal</span>
            {templateUrl ? (
              <a
                className="text-link"
                href={templateUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={13} />
                Download Template <ArrowUpRight size={12} />
              </a>
            ) : (
              <span className="template-pending">
                Google Docs template coming soon
              </span>
            )}
          </div>
          {input(
            "proposal",
            "Google Drive link — proposal",
            "https://docs.google.com/document/d/...",
            "url",
          )}
          <p className="field-hint">
            Include <strong>Compute Estimation</strong>: your device
            specifications, dataset size, batch size, planned epochs/steps, and
            initial runtime or TQDM estimate. The admin determines the final GPU
            and duration.
          </p>
        </>
      )}
      {step === 2 && (
        <>
          <div className="notice">
            <Info size={17} />
            <span>
              These are time preferences, not reservations. The admin will email
              a proposed schedule for you to confirm.
            </span>
          </div>
          {data.preferences.map((s, i) => (
            <div className="availability-slot" key={i}>
              <div className="slot-header">
                <span>
                  Preference {i + 1}
                  {i === 0 ? " · First choice" : " · Alternative"}
                </span>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      field(
                        "preferences",
                        data.preferences.filter((_, j) => i !== j),
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="slot-fields">
                <div className="field">
                  <span className="field-label">Date</span>
                  <DatePicker
                    value={s.date}
                    onChange={(v) => slot(i, "date", v)}
                    label={`Date for preference ${i + 1}`}
                  />
                </div>
                {["start", "end"].map((key) => (
                  <div className="field" key={key}>
                    <label htmlFor={`${key}-${i}`}>
                      {key === "start" ? "Start" : "End"}
                    </label>
                    <select
                      id={`${key}-${i}`}
                      value={s[key]}
                      onChange={(e) => slot(i, key, e.target.value)}
                    >
                      <option value="">Select time</option>
                      {TIME_OPTIONS.filter(
                        (t) => key !== "end" || !s.start || t > s.start,
                      ).map((t) => (
                        <option key={t} value={t}>
                          {t} WIB
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {errors.preferences && (
            <p className="field-error" role="alert">
              {errors.preferences}
            </p>
          )}
          {data.preferences.length < 3 && (
            <button
              type="button"
              className="text-link add-slot"
              onClick={() =>
                field("preferences", [
                  ...data.preferences,
                  { date: "", start: "", end: "" },
                ])
              }
            >
              <Plus size={15} />
              Add another time preference
            </button>
          )}
          <dl className="review-grid">
            <div>
              <dt>Applicant</dt>
              <dd>
                {data.name} · {data.nim}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{data.email}</dd>
            </div>
            <div>
              <dt>Study program</dt>
              <dd>{data.program}</dd>
            </div>
            <div>
              <dt>Research / project</dt>
              <dd>{data.title}</dd>
            </div>
          </dl>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={data.consent}
              onChange={(e) => field("consent", e.target.checked)}
            />
            <span>
              I confirm that my details and file permissions are correct. I
              understand that access requires admin approval, compute
              environments are temporary, and I must save checkpoints and
              download my results before access expires.
              For service security and capacity management, DCS records access IP addresses and compute resource usage. IP access records are retained for 30 days.
            </span>
          </label>
          {errors.consent && <p className="field-error">{errors.consent}</p>}
        </>
      )}
      <div className="form-actions">
        {step > 0 ? (
          <button
            className="button button-outline"
            type="button"
            disabled={busy}
            onClick={() => go(step - 1)}
          >
            <ArrowLeft size={15} />
            Back
          </button>
        ) : (
          <small>Step {step + 1} of 3</small>
        )}
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy
            ? "Submitting…"
            : step === 2
              ? "Submit application"
              : "Continue"}
          {step === 2 ? <Send size={14} /> : <ArrowRight size={15} />}
        </button>
      </div>
    </form>
  );
}
