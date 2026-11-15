export const MONITORING_LOG_GROUP = "/dcs-hpc/jupyter-access";

export function nginxMonitoringHttpConfig(allocationId) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(allocationId || ""))) throw new Error("INVALID_ALLOCATION_ID");
  return `
map $uri $dcs_access_kind {
  default "";
  ~^/api/contents(/|$) contents;
  ~^/api/sessions(/|$) sessions;
  ~^/api/kernels(/|$) kernels;
}
map "$dcs_access_kind:$status" $dcs_authenticated_request {
  default 0;
  ~^(contents|sessions|kernels):(200|201|204|101)$ 1;
}
log_format dcs_authenticated escape=json '{"allocationId":"${allocationId}","authenticated":true,"source":"jupyter","category":"$dcs_access_kind","ip":"$remote_addr","status":$status,"timestamp":"$time_iso8601"}';
`;
}

export function nginxMonitoringServerConfig() {
  return "access_log /var/log/nginx/dcs-authenticated-access.log dcs_authenticated if=$dcs_authenticated_request;";
}

export function monitoringUserDataScript({ allocationId, region = "ap-southeast-1" } = {}) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(allocationId || ""))) throw new Error("INVALID_ALLOCATION_ID");
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(String(region || ""))) throw new Error("INVALID_AWS_REGION");
  return `
# Install and start CloudWatch Agent. Metrics contain no notebook content.
mkdir -p /var/log/nginx
touch /var/log/nginx/dcs-authenticated-access.log
chown root:adm /var/log/nginx/dcs-authenticated-access.log
chmod 0640 /var/log/nginx/dcs-authenticated-access.log
curl -fsSLo /tmp/amazon-cloudwatch-agent.deb https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
dpkg -i /tmp/amazon-cloudwatch-agent.deb
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'DCS_CW_AGENT'
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "root" },
  "metrics": {
    "namespace": "CWAgent",
    "append_dimensions": { "InstanceId": "\${aws:InstanceId}" },
    "aggregation_dimensions": [["InstanceId"]],
    "metrics_collected": {
      "mem": { "measurement": ["mem_used_percent", "mem_used", "mem_total"], "metrics_collection_interval": 60 },
      "disk": { "resources": ["/"], "measurement": ["disk_used_percent"], "metrics_collection_interval": 60 },
      "cpu": { "resources": ["*"], "totalcpu": true, "measurement": ["cpu_usage_idle"], "metrics_collection_interval": 60 },
      "nvidia_gpu": { "measurement": ["utilization_gpu", "memory_used", "memory_total", "temperature_gpu"], "metrics_collection_interval": 60 }
    }
  },
  "logs": {
    "logs_collected": { "files": { "collect_list": [{
      "file_path": "/var/log/nginx/dcs-authenticated-access.log",
      "log_group_name": "${MONITORING_LOG_GROUP}",
      "log_stream_name": "{instance_id}",
      "timezone": "UTC"
    }] } }
  }
}
DCS_CW_AGENT
AWS_REGION='${region}' /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s
`;
}
