"use client";

import { useEffect, useState } from "react";
import { FileArchive, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { estimateExport } from "@/lib/export-progress.mjs";

const stages = {
  stopping: "Ending your compute session",
  detaching: "Preparing your workspace",
  "worker-launch": "Starting the export worker",
  attaching: "Preparing your workspace",
  exporting: "Preparing your research files",
  scanning: "Scanning your workspace",
  archiving: "Creating and uploading your ZIP",
  verifying: "Verifying your files",
  verified: "Finishing your export",
  cleanup: "Finishing your export",
};

export default function ExportProgress({ end, hasSession }) {
  const [data, setData] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(null);
  const router = useRouter();
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!hasSession || now === null || now < Date.parse(end)) return;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch('/api/portal/compute/session', { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to retrieve status');
        const result = await response.json();
        if (cancelled) return;
        setUnavailable(false);
        setData(result);
        if (result.status === 'artifact_ready') router.refresh();
      } catch { if (!cancelled) setUnavailable(true); }
    }
    poll();
    const timer = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [hasSession, now !== null && now >= Date.parse(end), end, router]);

  if (!hasSession || now === null || now < Date.parse(end)) return (
    <div className="empty-state"><FileArchive size={33} /><h3>Your progress will live here.</h3>
      <p>Your notebooks, checkpoints, and research outputs will appear here after the session and export are complete.</p></div>
  );
  if (data?.status === 'export_failed') return <div className="notice error" role="alert">Your export needs administrator attention. Please contact DCS.</div>;
  const progress = data?.exportProgress;
  const stage = progress?.stage === 'ready' ? 'verified' : progress?.stage || data?.lifecyclePhase || 'stopping';
  const { percent: pct, etaSeconds: eta } = estimateExport(progress, now);
  const updated = Number(progress?.updated_at) * 1000;
  const age = Number.isFinite(updated) ? Math.max(0, (now - updated) / 1000) : null;
  const remaining = eta === null ? 'Estimating time…' : eta < 60 ? `About ${eta} seconds remaining` : `About ${Math.ceil(eta / 60)} minutes remaining`;
  return <div className="export-progress" role="status" aria-live="polite">
    <Loader2 size={22} className="spin" aria-hidden="true" />
    <div className="export-progress-body">
      <strong>{stages[stage] || 'Preparing your research files'}</strong>
      {pct !== null && <><progress max="100" value={pct} aria-label="Archive progress" /><span>{pct}% archived</span></>}
      <p>{stage === 'archiving' ? remaining : 'Your files are being prepared. You can leave and return later.'}</p>
      {unavailable && <p>Progress is temporarily unavailable. Retrying automatically.</p>}
      {age !== null && age > 90 && <p>This is taking longer than expected. Last update: {Math.ceil(age / 60)} minutes ago.</p>}
    </div>
  </div>;
}
