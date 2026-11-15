"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  ArrowUpRight,
  Clock3,
  AlertTriangle,
  Info,
  Check,
  Loader2,
  Play,
} from "lucide-react";

export default function SessionClock({
  start,
  end,
  initialStatus = "scheduled",
  initialJupyterUrl = null,
  jupyterUrl: propJupyterUrl,
}) {
  const router = useRouter();
  const [now, setNow] = useState(null);
  const [status, setStatus] = useState(initialStatus || "scheduled");
  const [jupyterUrl, setJupyterUrl] = useState(
    initialJupyterUrl || propJupyterUrl || null,
  );
  const [instanceId, setInstanceId] = useState(null);
  const [publicIp, setPublicIp] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [provisioningMsg, setProvisioningMsg] = useState("Launching EC2 GPU...");
  const [error, setError] = useState(null);
  const hasPolledInitial = useRef(false);
  const jupyterWindow = useRef(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  const earlyAccessTime = startTime - 15 * 60 * 1000;

  useEffect(() => {
    if (now === null || now < endTime || !jupyterWindow.current) return;
    try {
      if (!jupyterWindow.current.closed) {
        jupyterWindow.current.location.replace(new URL('/compute', window.location.origin).href);
      }
    } catch {
      // The browser may have detached the opened tab; the backend deadline still applies.
    }
    jupyterWindow.current = null;
  }, [now, endTime]);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/portal/compute/session", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status) {
        setStatus(data.status);
      }
      if (data.instanceId) setInstanceId(data.instanceId);
      if (data.publicIp) setPublicIp(data.publicIp);
      if (data.jupyterUrl && !data.jupyterUrl.includes("pending")) {
        setJupyterUrl(data.jupyterUrl);
      }
      if (data.status === "provisioning") {
        if (!data.instanceId) {
          setProvisioningMsg("Launching EC2 GPU...");
        } else if (!data.publicIp) {
          setProvisioningMsg("Acquiring IP...");
        } else {
          setProvisioningMsg("Starting JupyterLab...");
        }
      }
    } catch {
      // transient network poll error
    }
  };

  // Poll status on initial mount if within early-access or active session
  useEffect(() => {
    if (
      now !== null &&
      now >= earlyAccessTime &&
      now < endTime &&
      status !== "completed" &&
      !hasPolledInitial.current
    ) {
      hasPolledInitial.current = true;
      fetchStatus();
    }
  }, [now, earlyAccessTime, endTime, status]);

  // Poll every 3 seconds while provisioning
  useEffect(() => {
    if (status !== "provisioning" && !launching) return;

    const interval = setInterval(() => {
      fetchStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [status, launching]);

  useEffect(() => {
    if (now === null || now < endTime || status === "artifact_ready") return;
    const interval = setInterval(async () => {
      await fetchStatus();
      router.refresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [now !== null && now >= endTime, status, endTime, router]);

  // Dynamic status message progression
  useEffect(() => {
    if (status !== "provisioning" && !launching) return;
    const msgs = [
      "Launching EC2 GPU...",
      "Acquiring IP...",
      "Starting JupyterLab...",
    ];
    let step = 0;
    if (publicIp) step = 2;
    else if (instanceId) step = 1;
    setProvisioningMsg(msgs[step]);

    const timer = setInterval(() => {
      setProvisioningMsg((prev) => {
        if (prev === msgs[0]) return msgs[1];
        if (prev === msgs[1]) return msgs[2];
        return msgs[2];
      });
    }, 4000);

    return () => clearInterval(timer);
  }, [status, launching, instanceId, publicIp]);

  const handleLaunch = async () => {
    setLaunching(true);
    setError(null);
    setStatus("provisioning");
    setProvisioningMsg("Launching EC2 GPU...");
    try {
      const res = await fetch("/api/portal/compute/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start compute session.");
      }
      if (data.instanceId) setInstanceId(data.instanceId);
      if (data.publicIp) {
        setPublicIp(data.publicIp);
        setProvisioningMsg("Starting JupyterLab...");
      } else if (data.instanceId) {
        setProvisioningMsg("Acquiring IP...");
      }
      if (data.status === "active" || data.status === "ready") {
        if (data.jupyterUrl && !data.jupyterUrl.includes("pending")) {
          setStatus(data.status);
          setJupyterUrl(data.jupyterUrl);
        }
      } else if (data.status) {
        setStatus(data.status);
      }
    } catch (err) {
      setError(err.message || "Failed to initialize session.");
      setStatus("scheduled");
    } finally {
      setLaunching(false);
    }
  };

  if (now === null) {
    return <p className="field-hint">Loading session timer…</p>;
  }

  // State 1: Past end time or completed (Compute terminated, 7-day artifact retention)
  if (now >= endTime || status === "completed") {
    return (
      <div className="session-clock-wrapper">
        <div
          className="notice warning session-ended-notice"
          role="status"
          style={{ marginBottom: 16 }}
        >
          <Info size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ display: "block", marginBottom: 4 }}>
              Compute session ended
            </strong>
            <span style={{ fontSize: "12px", lineHeight: 1.6 }}>
              GPU allocation access has ended. Your files will appear below once export is complete.
            </span>
          </div>
        </div>

        <button
          className="button button-outline"
          disabled
          style={{ width: "100%", justifyContent: "center", opacity: 0.7 }}
        >
          <Check size={16} />
          Session time ended
        </button>
        <p className="field-hint" style={{ marginTop: 12 }}>
          Please review your artifacts list under &ldquo;My research files&rdquo; below to download your experimental outputs.
        </p>
      </div>
    );
  }

  // State 2: Before early access window (now < startTime - 15m)
  if (now < earlyAccessTime) {
    const remainingToStart = Math.max(0, Math.floor((startTime - now) / 1000));
    const sh = Math.floor(remainingToStart / 3600);
    const sm = Math.floor((remainingToStart % 3600) / 60);
    const ss = remainingToStart % 60;
    const sessionTimeFormatted = [sh, sm, ss]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");

    const remainingToEarly = Math.max(
      0,
      Math.floor((earlyAccessTime - now) / 1000),
    );
    const eh = Math.floor(remainingToEarly / 3600);
    const em = Math.floor((remainingToEarly % 3600) / 60);
    const es = remainingToEarly % 60;
    const earlyFormatted = [eh, em, es]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");

    return (
      <div className="session-clock-wrapper">
        <div className="session-clock-header">
          <p className="session-label">
            Session starts in (Workspace preparing)
          </p>
          <div
            className="session-countdown preparing"
            role="timer"
            aria-live="off"
          >
            {earlyFormatted}
          </div>
        </div>

        <button
          className="button button-outline button-preparing"
          disabled
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Clock3 size={16} />
          Workspace preparing · Starts in {sessionTimeFormatted}
        </button>
        <p className="field-hint" style={{ marginTop: 12 }}>
          Compute environment is being prepared. Workspace launch unlocks automatically 15 minutes prior to scheduled start for setup & dependencies.
        </p>
      </div>
    );
  }

  // State 3: Within early access or active session (now >= startTime - 15m && now < endTime)
  const isEarly = now < startTime;
  const remaining = isEarly
    ? Math.max(0, Math.floor((startTime - now) / 1000))
    : Math.max(0, Math.floor((endTime - now) / 1000));

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const timeFormatted = [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");

  const isReady =
    (status === "ready" || status === "active") &&
    !!jupyterUrl &&
    !jupyterUrl.includes("pending");
  const isProvisioning = status === "provisioning" || (launching && !isReady);

  return (
    <div className="session-clock-wrapper">
      <div className="session-clock-header">
        <p className="session-label">
          {isEarly
            ? "Official session starts in (Early Access Active)"
            : "Compute time remaining"}
        </p>
        <div
          className={`session-countdown ${isEarly ? "preparing" : "running"}`}
          role="timer"
          aria-live="off"
        >
          {timeFormatted}
        </div>
      </div>

      {!isEarly && remaining <= 300 && (
        <div
          className="notice error"
          role="status"
          style={{ marginBottom: 16 }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>
            Less than 5 minutes remaining. Ensure your model checkpoints and
            notebooks are saved before the session ends.
          </span>
        </div>
      )}

      {error && (
        <div className="notice error" style={{ marginBottom: 12 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {isReady ? (
        <button
          className="button button-primary button-jupyter-active"
          onClick={() => {
            jupyterWindow.current = window.open(jupyterUrl, "_blank");
          }}
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Monitor size={17} />
          <strong>Open JupyterLab</strong>
          <ArrowUpRight size={16} />
        </button>
      ) : isProvisioning ? (
        <button
          className="button button-outline button-preparing"
          disabled
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Loader2 size={16} className="spin" />
          <span>{provisioningMsg}</span>
        </button>
      ) : (
        <button
          className="button button-primary"
          onClick={handleLaunch}
          disabled={launching}
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Play size={16} />
          <strong>Launch &amp; Prepare JupyterLab</strong>
        </button>
      )}

      <p className="field-hint" style={{ marginTop: 12 }}>
        {isReady
          ? "JupyterLab workspace is ready. Click above to open in a new tab."
          : isProvisioning
            ? "Your compute instance and JupyterLab workspace are starting..."
            : isEarly
              ? "Early access window is active. Launch your workspace now to configure libraries and dependencies."
              : "Your session is active. Click above to launch your JupyterLab workspace."}
      </p>
    </div>
  );
}
