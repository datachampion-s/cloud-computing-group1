import { cookies } from "next/headers";
import {
  assertOrigin,
  database,
  failure,
  hash,
  jsonBody,
  limited,
  secret,
} from "@/lib/server";
import { isValidToken, normalizeToken } from "@/lib/validation.mjs";
export async function POST(request) {
  try {
    assertOrigin(request);
    const { token } = await jsonBody(request);
    await limited(request, "redeem", 10);
    if (!isValidToken(token))
      return Response.json(
        {
          error:
            "This token is invalid, already used, or expired. Check your invitation email or contact the admin.",
        },
        { status: 400 },
      );
    if (
      process.env.NODE_ENV !== "production" &&
      normalizeToken(token).startsWith("DCS-DEV")
    ) {
      (await cookies()).set(
        "dcs_portal_dev",
        JSON.stringify({ status: "active" }),
        {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        },
      );
      return Response.json({ success: true });
    }
    const session = secret();
    const { data, error } = await database().rpc("portal_redeem", {
      p_token_hash: hash(normalizeToken(token)),
      p_session_hash: hash(session),
    });
    if (error) {
      if (error.message.includes("INVALID_CREDENTIAL"))
        return Response.json(
          {
            error:
              "This token is invalid, already used, or expired. Check your invitation email or contact the admin.",
          },
          { status: 400 },
        );
      throw new Error("DATABASE_UNAVAILABLE");
    }
    (await cookies()).set("dcs_portal", session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(data),
    });
    return Response.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
