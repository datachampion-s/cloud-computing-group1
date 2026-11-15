"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, ShieldCheck, Info } from "lucide-react";
export default function PortalLogin() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/portal/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken("");
      router.refresh();
    } catch (err) {
      setError(err.message || "Connection lost. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="portal-login">
      <span className="login-icon">
        <KeyRound size={22} />
      </span>
      <h2>Your research, continued.</h2>
      <p>
        Enter the one-time token from your invitation email to open your compute
        portal.
      </p>
      {error && (
        <div role="alert" className="notice error">
          <Info size={16} />
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="access-token">Access token</label>
          <input
            id="access-token"
            className="token-input"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="e.g. DCS-7K9P-M2X"
            type="text"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={128}
          />
          <span className="field-hint">
            Format: DCS-XXXX-XXX (case-insensitive) or raw access token
          </span>
        </div>
        <button
          className="button button-primary"
          disabled={busy || !token.trim()}
        >
          {busy ? "Checking token…" : "Enter compute portal"}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className="token-info">
        <ShieldCheck size={15} />
        <span>
          Portal access starts when you redeem your token and remains available for at least 7 days after your session ends.
          JupyterLab is available only during your approved compute timeslot.
          Keep this browser session to return to the portal.
        </span>
      </div>
      <div className="login-footer">
        <span>Need an invitation?</span>
        <Link href="/apply">
          Apply for access <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
