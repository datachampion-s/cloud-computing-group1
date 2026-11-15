import { NextResponse } from "next/server";
import { appUrl, authClient, adminUser } from "@/lib/server";
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  try {
    const client = await authClient();
    if (!code) throw new Error("AUTH_FAILED");
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!(await adminUser())) {
      await client.auth.signOut();
      return NextResponse.redirect(
        appUrl("/admin?error=forbidden", request),
      );
    }
    return NextResponse.redirect(appUrl("/admin", request));
  } catch {
    return NextResponse.redirect(appUrl("/admin?error=auth", request));
  }
}
