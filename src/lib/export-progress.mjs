/** Calculate archive progress using measured uncompressed input bytes. */
export function estimateExport(progress, nowMs) {
  if (!progress || progress.stage !== "archiving") return { percent: null, etaSeconds: null, ageSeconds: null };
  const done = Number(progress.processed_bytes);
  const total = Number(progress.total_bytes);
  const updated = Number(progress.updated_at) * 1000;
  const started = Number(progress.started_at) * 1000;
  const ageSeconds = Number.isFinite(updated) && updated > 0 ? Math.max(0, (nowMs - updated) / 1000) : null;
  if (!Number.isFinite(done) || done < 0 || !Number.isFinite(total) || total <= 0) return { percent: null, etaSeconds: null, ageSeconds };
  const percent = Math.max(0, Math.min(100, Math.floor(done * 100 / total)));
  const speed = done > 0 && updated > started ? done / ((updated - started) / 1000) : 0;
  const etaSeconds = speed > 0 ? Math.max(0, Math.ceil((total - done) / speed), Math.ceil(ageSeconds || 0)) : null;
  return { percent, etaSeconds, ageSeconds };
}
