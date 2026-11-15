"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Info, Plus } from "lucide-react";
import DatePicker from "./DatePicker";
import {
  TIME_OPTIONS,
  formatDate,
  formatTime,
  validateDeclineAlternatives,
} from "@/lib/validation.mjs";
export default function ConfirmationCard() {
  const [credential, setCredential] = useState(null);
  const [allocation, setAllocation] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [note, setNote] = useState("");
  const [alternativeSlots, setAlternativeSlots] = useState([
    { date: "", start: "", end: "" },
    { date: "", start: "", end: "" },
    { date: "", start: "", end: "" },
  ]);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const value = {
      token: params.get("token"),
      response: params.get("response"),
    };
    // Fragments do not reach HTTP logs, and are removed before further navigation.
    window.history.replaceState(null, "", window.location.pathname);
    if (!value.token || !["confirmed", "declined"].includes(value.response)) {
      setError(
        "This link is incomplete or has been cleared from the address bar. Open the original link from your invitation email.",
      );
      return;
    }
    setCredential(value);
    fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...value, action: "inspect" }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setAllocation(body.allocation);
        if (body.responseStatus !== "pending") setDone(body.responseStatus);
      })
      .catch((err) =>
        setError(
          err.message ||
            "This link could not be checked. Please reopen it from your email.",
        ),
      );
  }, []);
  function updateSlot(index, key, value) {
    setAlternativeSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
    );
    setError("");
  }
  async function respond(e) {
    if (e?.preventDefault) e.preventDefault();
    setError("");
    let payload = { ...credential, action: "respond" };
    if (credential?.response === "declined") {
      const check = validateDeclineAlternatives(alternativeSlots, note);
      if (!check.valid) {
        setError(check.error);
        return;
      }
      payload = {
        action: "respond",
        response: "declined",
        token: credential.token,
        note: check.note,
        alternativeSlots: check.alternativeSlots,
      };
    }
    setBusy(true);
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setDone(body.responseStatus);
    } catch (err) {
      setError(err.message || "Connection lost. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-card">
      <span className="success-mark">
        {done ? <Check size={27} /> : <CalendarCheck size={27} />}
      </span>
      <h1>
        {done
          ? done === "confirmed"
            ? "You’re on the same page."
            : "Thanks for letting us know."
          : credential?.response === "declined"
            ? "Propose alternative timeslots"
            : "Does this time work for you?"}
      </h1>
      {done ? (
        <>
          <p>
            {done === "confirmed"
              ? "Your availability is confirmed. The admin will finalize the schedule and send your access invitation separately."
              : "Your response and alternative timeslots have been recorded. The admin will review them and propose a new schedule."}
          </p>
          <Link
            className="button button-primary"
            style={{ marginTop: 25 }}
            href="/landing"
          >
            Back to DCS Compute
          </Link>
        </>
      ) : (
        <>
          {allocation && (
            <>
              <p>
                {credential?.response === "declined"
                  ? "Let the admin know up to 3 preferred alternative timeslots when you are available."
                  : "Review the proposed DCS timeslot before saving your response."}
              </p>
              <div className="notice" style={{ marginTop: 20 }}>
                <CalendarCheck size={19} />
                <span>
                  <strong>
                    {formatDate(allocation.proposed_start_at, {
                      weekday: "long",
                    })}
                  </strong>
                  <br />
                  {formatTime(allocation.proposed_start_at)}–
                  {formatTime(allocation.proposed_end_at)} WIB
                  <br />
                  {allocation.gpu_name} · Workspace{" "}
                  {allocation.workspace_ebs_gb} GB
                  <br />
                  Response deadline:{" "}
                  {formatDate(allocation.confirmation_expires_at)}{" "}
                  {formatTime(allocation.confirmation_expires_at)} WIB
                </span>
              </div>
              {credential?.response === "declined" ? (
                <form
                  onSubmit={respond}
                  noValidate
                  style={{ marginTop: 20, textAlign: "left" }}
                >
                  {alternativeSlots.map((s, i) => (
                    <div className="availability-slot" key={i}>
                      <div className="slot-header">
                        <span>
                          Slot {i + 1}
                          {i === 0 ? " · Required" : " · Optional"}
                        </span>
                        {i > 0 && (s.date || s.start || s.end) && (
                          <button
                            type="button"
                            onClick={() =>
                              setAlternativeSlots((prev) =>
                                prev.map((item, j) =>
                                  j === i
                                    ? { date: "", start: "", end: "" }
                                    : item,
                                ),
                              )
                            }
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="slot-fields">
                        <div className="field">
                          <span className="field-label">Date (WIB)</span>
                          <DatePicker
                            value={s.date}
                            onChange={(v) => updateSlot(i, "date", v)}
                            label={`Date for Slot ${i + 1}`}
                          />
                        </div>
                        {["start", "end"].map((key) => (
                          <div className="field" key={key}>
                            <label htmlFor={`alt-${key}-${i}`}>
                              {key === "start" ? "Start" : "End"}
                            </label>
                            <select
                              id={`alt-${key}-${i}`}
                              value={s[key]}
                              onChange={(e) =>
                                updateSlot(i, key, e.target.value)
                              }
                            >
                              <option value="">Select time</option>
                              {TIME_OPTIONS.filter(
                                (t) =>
                                  key !== "end" || !s.start || t > s.start,
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
                  {alternativeSlots.length < 3 && (
                    <button
                      type="button"
                      className="text-link add-slot"
                      onClick={() =>
                        setAlternativeSlots((prev) => [
                          ...prev,
                          { date: "", start: "", end: "" },
                        ])
                      }
                    >
                      <Plus size={15} />
                      Add another slot
                    </button>
                  )}
                  <div className="field" style={{ marginTop: 16 }}>
                    <label htmlFor="decline-note">
                      Reason or note (optional)
                    </label>
                    <textarea
                      id="decline-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Share any scheduling constraints or context for the admin"
                      maxLength={2000}
                    />
                  </div>
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={busy}
                  >
                    {busy ? "Saving…" : "Submit decline & alternative slots"}
                  </button>
                </form>
              ) : (
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={respond}
                >
                  {busy ? "Saving…" : "Yes, this time works for me"}
                </button>
              )}
              <p className="field-hint" style={{ marginTop: 18 }}>
                This response does not schedule AWS resources or grant compute
                access.
              </p>
            </>
          )}
          {!allocation && !error && <p>Checking confirmation link…</p>}
        </>
      )}
      {error && (
        <div className="notice error" role="alert" style={{ marginTop: 20 }}>
          <Info size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
