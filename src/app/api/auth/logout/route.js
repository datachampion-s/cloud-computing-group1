import { assertOrigin, authClient, failure } from "@/lib/server";
export async function POST(request) {
  try {
    assertOrigin(request);
    const client = await authClient();
    await client.auth.signOut();
    return Response.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
