"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

function hasConcurrentDistinctIps(accessEvents, windowMs = 30 * 60_000) {
  const timed = (accessEvents || [])
    .map((event) => ({ ip: String(event.ip || "").trim(), ts: Date.parse(event.timestamp) }))
    .filter((entry) => entry.ip && entry.ip !== "unknown" && Number.isFinite(entry.ts))
    .sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length && timed[j].ts - timed[i].ts <= windowMs; j += 1) {
      if (timed[j].ip !== timed[i].ip) return true;
    }
  }
  return false;
}

function MonitoringCard({ item }) {
  const byIp = new Map();
  for (const event of item.accessEvents || []) {
    const key = `${event.source}:${event.ip || "unknown"}`;
    const existing = byIp.get(key);
    const ts = Date.parse(event.timestamp);
    if (!existing) {
      byIp.set(key, { ...event, first: event.timestamp, last: event.timestamp });
    } else if (Number.isFinite(ts)) {
      if (!Number.isFinite(Date.parse(existing.first)) || ts < Date.parse(existing.first)) existing.first = event.timestamp;
      if (!Number.isFinite(Date.parse(existing.last)) || ts > Date.parse(existing.last)) existing.last = event.timestamp;
    }
  }
  const reviewSuggested = hasConcurrentDistinctIps(item.accessEvents);
  return (
    <article className="admin-monitor-card">
      <div className="admin-monitor-title">
        <div>
          <strong>{item.gpuName || item.instanceType || "Compute session"}</strong>
          <small>{item.instanceId} Â· {item.instanceState || "unknown"}</small>
          <small>{item.applicant?.applicant_name || "Applicant unavailable"} Â· {item.applicant?.student_id || "NIM unavailable"}</small>
          <small>{item.applicant?.applicant_email || "Email unavailable"} Â· {item.applicant?.project_title || "Project unavailable"}</small>
          <small>{item.startAt && item.endAt ? `${new Date(item.startAt).toLocaleString()} â€“ ${new Date(item.endAt).toLocaleString()}` : "Schedule unavailable"}</small>
        </div>
        <span className={`admin-monitor-state ${item.instanceState === "running" ? "is-running" : ""}`}>
          {item.instanceState || item.status || "unknown"}
        </span>
      </div>
      <div className="admin-monitor-metrics"><div><span>Public IP</span><strong>{item.publicIp || "Unavailable"}</strong></div></div>
      <div className="admin-monitor-access">
        <div className="admin-monitor-access-head">
          <strong>Authenticated access records (last 30 days)</strong>
          {reviewSuggested && (
            <span className="admin-monitor-badge-review" title="2+ distinct client IPs active within 30 minutes">
              Review suggested
            </span>
          )}
        </div>
        {item.accessUnavailable ? <p>Access records are unavailable.</p> : item.accessEvents?.length ? (
          <ul>
            {[...byIp.values()].map((event, index) => (
              <li key={`${event.timestamp}-${index}`}>
                <span>First: {new Date(event.first).toLocaleString()} Â· Last: {new Date(event.last).toLocaleString()}</span>
                <code>{event.ip || "IP unavailable"}</code>
                <span>{event.source === "portal" ? "Portal session" : "Jupyter"}</span>
              </li>
            ))}
          </ul>
        ) : <p>No verified authenticated endpoint access recorded in the retention window.</p>}
      </div>
    </article>
  );
}

export default function AdminComputeMonitoring() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/monitoring", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Monitoring could not be loaded.");
      setData(body);
      setError("");
    } catch (e) {
      setError(e.message || "Monitoring could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <section className="admin-monitor-panel" aria-label="Live compute monitoring">
      <div className="admin-monitor-heading">
        <div>
          <span className="eyebrow">LIVE COMPUTE</span>
          <h2><Activity size={18} /> Resource monitoring</h2>
          <p>Active compute sessions and access records. View CPU, memory, and GPU metrics in AWS CloudWatch.</p>
        </div>
        <button className="button button-outline admin-monitor-refresh" type="button" onClick={refresh}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {error ? <div className="notice error" role="status">{error}</div> : loading ? <p>Loading live monitoringâ€¦</p> : null}
      {!error && !loading && data?.items?.length === 0 && <p>No active compute sessions.</p>}
      {!error && data?.items?.length > 0 && <div className="admin-monitor-list">{data.items.map((item) => <MonitoringCard key={item.allocationId} item={item} />)}</div>}
      {!error && data?.workers?.length > 0 && (
        <div className="admin-monitor-workers">
          <h3>Active export workers</h3>
          <div className="admin-monitor-worker-list">
            {data.workers.map((worker) => (
              <div key={worker.instanceId} className="admin-monitor-worker-card">
                <div>
                  <strong>{worker.name || worker.instanceType || "Export worker"}</strong>
                  <small>
                    {worker.instanceId} Â· {worker.instanceType || "t3.micro"} Â· {worker.allocationId ? `Allocation ${worker.allocationId}` : "Allocation unavailable"}
                  </small>
                  <small>
                    {worker.publicIp || worker.privateIp || "IP unavailable"}
                    {worker.launchTime ? ` Â· Launched ${new Date(worker.launchTime).toLocaleString()}` : ""}
                  </small>
                </div>
                <span className={`admin-monitor-state ${worker.state === "running" ? "is-running" : ""}`}>
                  {worker.state || "unknown"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data?.updatedAt && <small className="field-hint">Last updated {new Date(data.updatedAt).toLocaleTimeString()} Â· refreshes every 30 seconds</small>}
      <p className="field-hint admin-monitor-privacy">Access records contain client IP addresses and are visible to DCS administrators. Jupyter records include only successful authenticated contents, session, and kernel requests; health checks and URL query strings are excluded. Logs are configured for 30-day retention.</p>
    </section>
  );
}
