import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDevPortalSession } from "./dev-preview.mjs";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export function timingSafeMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = createHash("sha256").update(a).digest();
  const bufB = createHash("sha256").update(b).digest();
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}
export function appUrl(path, request) {
  return new URL(path, process.env.APP_URL || new URL(request.url).origin);
}
export function database() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error("DATABASE_UNAVAILABLE");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function authClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Read-only Server Component; refresh is handled in auth route handlers. */
          }
        },
      },
    },
  );
}
export async function adminUser() {
  try {
    const client = await authClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (
      error ||
      !user ||
      !user.email_confirmed_at ||
      user.email?.toLowerCase() !==
        process.env.ADMIN_EMAIL?.trim().toLowerCase() ||
      !user.identities?.some((i) => i.provider === "google")
    )
      return null;
    return user;
  } catch {
    return null;
  }
}
export async function portalSession() {
  const store = await cookies();
  if (process.env.NODE_ENV !== "production") {
    const devPreview = store.get("dcs_portal_dev")?.value;
    if (devPreview) {
      return getDevPortalSession(devPreview);
    }
  }
  const token = store.get("dcs_portal")?.value;
  if (!token || token.length > 256) return null;
  if (
    process.env.NODE_ENV !== "production" &&
    (token === "dev-preview" || token.startsWith("dev-preview"))
  ) {
    return getDevPortalSession();
  }
  try {
    const db = database();
    const { data, error } = await db
      .from("portal_sessions")
      .select(
        "id,session_expires_at,revoked_at,access_grants!inner(id,allocation_id,portal_access_expires_at,revoked_at)",
      )
      .eq("session_token_hash", hash(token))
      .maybeSingle();
    const grant = data?.access_grants;
    const now = Date.now();
    if (
      error ||
      !data ||
      data.revoked_at ||
      grant.revoked_at ||
      !grant.portal_access_expires_at ||
      Date.parse(data.session_expires_at) <= now ||
      Date.parse(grant.portal_access_expires_at) <= now
    )
      return null;
    return { id: data.id, grant, db };
  } catch {
    return null;
  }
}
export function assertOrigin(request) {
  const origin = request.headers.get("origin");
  const allowed = [new URL(request.url).origin];
  if (process.env.APP_URL) allowed.push(new URL(process.env.APP_URL).origin);
  if (!origin || !allowed.includes(origin)) throw new Error("INVALID_ORIGIN");
}
export async function limited(request, action, maxRequests = 10) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const { data, error } = await database().rpc("portal_allow_request", {
    p_bucket: hash(`${action}:${ip}`),
    p_max: maxRequests,
    p_seconds: 3600,
  });
  if (error) throw new Error("DATABASE_UNAVAILABLE");
  if (!data) throw new Error("RATE_LIMIT");
}
export async function jsonBody(request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("INVALID_BODY");
  const text = await request.text();
  if (text.length > 20000) throw new Error("INVALID_BODY");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("INVALID_BODY");
  }
}
export function failure(error) {
  const code = error?.message;
  const messages = {
    INVALID_ORIGIN: [403, "This request is not allowed."],
    UNAUTHORIZED: [401, "Please sign in again."],
    RATE_LIMIT: [429, "Too many attempts. Please try again in one hour."],
    INVALID_BODY: [400, "The application data is invalid."],
    DATABASE_UNAVAILABLE: [
      503,
      "The service is currently unavailable. Please contact the admin or try again later.",
    ],
  };
  const [status, message] = messages[code] || [
    503,
    "This request could not be processed. Please try again or contact the admin.",
  ];
  return Response.json({ error: message }, { status });
}
export async function audit(
  db,
  actor,
  action,
  targetType,
  targetId,
  afterData = null,
) {
  const { error } = await db
    .from("audit_logs")
    .insert({
      actor_type: actor === "system" ? "system" : "admin",
      actor_email: actor === "system" ? null : actor,
      action,
      target_type: targetType,
      target_id: targetId,
      after_data: afterData,
    });
  if (error) throw new Error("AUDIT_FAILED");
}
