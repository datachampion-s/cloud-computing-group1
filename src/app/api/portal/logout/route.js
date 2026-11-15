import { cookies } from "next/headers";
import { assertOrigin, database, failure, hash } from "@/lib/server";
export async function POST(request) {
  try {
    assertOrigin(request);
    const store = await cookies();
    const token = store.get("dcs_portal")?.value;
    if (token && token !== "dev-preview" && !token.startsWith("dev-preview")) {
      const { error } = await database()
        .from("portal_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("session_token_hash", hash(token));
      if (error) throw new Error("DATABASE_UNAVAILABLE");
    }
    store.delete("dcs_portal");
    store.delete("dcs_portal_dev");
    return Response.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
