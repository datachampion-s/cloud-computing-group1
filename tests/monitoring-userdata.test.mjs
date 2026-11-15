import test from "node:test";
import assert from "node:assert/strict";
import {
  MONITORING_LOG_GROUP,
  monitoringUserDataScript,
  nginxMonitoringHttpConfig,
  nginxMonitoringServerConfig,
} from "../src/lib/monitoring-userdata.mjs";

test("monitoring bootstrap scopes logs to verified Jupyter routes and 30 days", () => {
  const script = monitoringUserDataScript({ allocationId: "abc-123", region: "ap-southeast-1" });
  assert.match(script, /mem_used_percent/);
  assert.match(script, /disk_used_percent/);
  assert.match(script, /nvidia_gpu/);
  assert.match(script, /\/var\/log\/nginx\/dcs-authenticated-access\.log/);
  assert.equal(MONITORING_LOG_GROUP, "/dcs-hpc/jupyter-access");

  const httpConfig = nginxMonitoringHttpConfig("abc-123");
  assert.ok(httpConfig.includes("/api/contents"));
  assert.ok(httpConfig.includes("(200|201|204|101)"));
  assert.doesNotMatch(httpConfig.match(/log_format[^\n]+/)[0], /\$uri|\$request_uri|\$args|\$request_body/);
  assert.match(nginxMonitoringServerConfig(), /if=\$dcs_authenticated_request/);
  assert.throws(() => monitoringUserDataScript({ allocationId: "bad'\nid" }), /INVALID_ALLOCATION_ID/);
});
