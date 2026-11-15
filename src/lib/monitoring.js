import "server-only";
import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  FilterLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

const region = () => process.env.AWS_REGION;
const credentials = () => process.env.VERCEL === "1"
  ? awsCredentialsProvider({ roleArn: process.env.AWS_ROLE_ARN })
  : {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
    };

function clientConfig() {
  if (!region() || (process.env.VERCEL === "1" ? !process.env.AWS_ROLE_ARN : !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)) {
    throw new Error("MONITORING_UNAVAILABLE");
  }
  return { region: region(), credentials: credentials() };
}

export async function readAuthenticatedAccessEvents(allocationId, now = Date.now()) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(allocationId || ""))) throw new Error("INVALID_ALLOCATION_ID");
  const logGroupName = process.env.AWS_MONITORING_LOG_GROUP || "/dcs-hpc/jupyter-access";
  if (!logGroupName) throw new Error("MONITORING_UNAVAILABLE");
  const client = new CloudWatchLogsClient(clientConfig());
  const events = [];
  let nextToken;
  let pages = 0;
  do {
    const page = await client.send(new FilterLogEventsCommand({
      logGroupName,
      startTime: now - 30 * 24 * 60 * 60_000,
      endTime: now,
      filterPattern: `{ $.allocationId = "${allocationId}" }`,
      limit: 1000,
      nextToken,
    }));
    for (const event of page.events || []) {
      try {
        const item = JSON.parse(event.message || "{}");
        if (item.authenticated === true && item.allocationId === allocationId) {
          events.push({
            authenticated: true,
            category: ["contents", "sessions", "kernels"].includes(item.category) ? item.category : null,
            timestamp: new Date(event.timestamp).toISOString(),
            ip: typeof item.ip === "string" ? item.ip : null,
            status: Number.isInteger(item.status) ? item.status : null,
            source: item.source === "portal" ? "portal" : "jupyter",
          });
        }
      } catch { /* Ignore malformed or non-monitoring log lines. */ }
    }
    nextToken = page.nextToken;
    pages++;
  } while (nextToken && pages < 20);
  return events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 100);
}

function requestIp(request) {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

// Call only after portalSession() has validated the user's session.
export async function recordAuthenticatedPortalIp(request, allocationId) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(allocationId || ""))) return;
  const ip = requestIp(request);
  if (!ip) return;
  const logGroupName = process.env.AWS_MONITORING_LOG_GROUP || "/dcs-hpc/jupyter-access";
  if (!logGroupName) return;
  const client = new CloudWatchLogsClient(clientConfig());
  const logStreamName = "portal-access";
  try {
    await client.send(new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: [{
        timestamp: Date.now(),
        message: JSON.stringify({
          allocationId,
          authenticated: true,
          source: "portal",
          ip,
          method: request.method,
          path: new URL(request.url).pathname,
          status: 200,
        }),
      }],
    }));
  } catch (error) {
    if (error?.name !== "ResourceNotFoundException") throw error;
    await client.send(new CreateLogStreamCommand({ logGroupName, logStreamName }));
    await client.send(new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: [{ timestamp: Date.now(), message: JSON.stringify({ allocationId, authenticated: true, source: "portal", ip, method: request.method, path: new URL(request.url).pathname, status: 200 }) }],
    }));
  }
}
