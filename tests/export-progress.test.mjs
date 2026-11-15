import test from "node:test";
import assert from "node:assert/strict";
import { estimateExport } from "../src/lib/export-progress.mjs";

test("archive ETA uses real bytes and grows when updates stall", () => {
  const record = { stage: "archiving", processed_bytes: 50, total_bytes: 100, started_at: 100, updated_at: 110 };
  assert.deepEqual(estimateExport(record, 110000), { percent: 50, etaSeconds: 10, ageSeconds: 0 });
  assert.deepEqual(estimateExport(record, 170000), { percent: 50, etaSeconds: 60, ageSeconds: 60 });
  assert.equal(estimateExport({ ...record, total_bytes: 0 }, 110000).percent, null);
  assert.equal(estimateExport({ ...record, stage: "verifying" }, 110000).percent, null);
});
