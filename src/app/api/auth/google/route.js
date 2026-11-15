import { NextResponse } from "next/server";
import { appUrl, authClient } from "@/lib/server";
export async function GET(request) {
  try {
    const settingsResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!settingsResponse.ok) throw new Error("AUTH_FAILED");
    const settings = await settingsResponse.json();
    if (!settings.external?.google) {
      return NextResponse.redirect(
        appUrl("/admin?error=google-disabled", request),
      );
    }
    const client = await authClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: appUrl("/auth/callback", request).href,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) throw new Error("AUTH_FAILED");
    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.redirect(appUrl("/admin?error=auth", request));
  }
}
