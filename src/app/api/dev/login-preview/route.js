import { cookies } from "next/headers";
import {
  isDevPreviewAllowed,
  parseDevPreviewConfig,
  getRedirectOrigin,
} from "@/lib/dev-preview.mjs";

export const dynamic = "force-dynamic";

function handlePreview(request) {
  if (!isDevPreviewAllowed()) {
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const isClear =
    searchParams.get("action") === "clear" ||
    searchParams.has("clear") ||
    searchParams.get("logout") === "true";

  return { isClear, searchParams, url };
}

export async function GET(request) {
  const result = handlePreview(request);
  if (result instanceof Response) return result;
  const { isClear, searchParams, url } = result;
  const redirectOrigin = getRedirectOrigin(request, url);

  const store = await cookies();

  if (isClear) {
    store.delete("dcs_portal_dev");
    store.delete("dcs_portal");

    if (
      searchParams.get("format") === "json" ||
      searchParams.get("redirect") === "false"
    ) {
      return Response.json({ success: true, cleared: true });
    }
    return Response.redirect(new URL("/compute", redirectOrigin), 307);
  }

  const devConfig = parseDevPreviewConfig(searchParams);

  store.set("dcs_portal_dev", JSON.stringify(devConfig), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });

  if (
    searchParams.get("format") === "json" ||
    searchParams.get("redirect") === "false"
  ) {
    return Response.json({
      success: true,
      preview: devConfig,
      redirect: "/compute",
    });
  }

  return Response.redirect(new URL("/compute", redirectOrigin), 307);
}

export async function POST(request) {
  return GET(request);
}

export async function DELETE(request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }
  const store = await cookies();
  store.delete("dcs_portal_dev");
  store.delete("dcs_portal");
  return Response.json({ success: true, cleared: true });
}
