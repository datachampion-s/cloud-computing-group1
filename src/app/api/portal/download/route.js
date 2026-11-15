import { NextResponse } from "next/server";
import { failure, portalSession } from "@/lib/server";
import {
  generateArtifactDownloadUrl,
  isValidArtifactFilename,
  isArtifactReady,
} from "@/lib/aws";

export async function GET(request) {
  try {
    const session = await portalSession();
    if (!session) throw new Error("UNAUTHORIZED");

    const url = new URL(request.url);
    const filename = url.searchParams.get("file") || "artifacts.zip";
    if (!isValidArtifactFilename(filename) || filename !== "artifacts.zip") {
      return Response.json(
        { error: "Invalid artifact filename." },
        { status: 400 },
      );
    }

    const { data: allocation, error } = await session.db
      .from("compute_allocations")
      .select("proposed_end_at")
      .eq("id", session.grant.allocation_id)
      .single();
    if (error || !allocation || !Number.isFinite(Date.parse(allocation.proposed_end_at)) ||
        Date.now() >= Date.parse(allocation.proposed_end_at) + 7 * 86400000) {
      return Response.json({ error: "This download is unavailable or has expired." }, { status: 403 });
    }

    if (!(await isArtifactReady({ allocationId: session.grant.allocation_id }))) {
      return Response.json({ error: "Your files are not ready yet." }, { status: 404 });
    }
    const secondsRemaining = Math.floor(
      (Date.parse(allocation.proposed_end_at) + 7 * 86400000 - Date.now()) / 1000,
    );
    if (secondsRemaining < 1) {
      return Response.json({ error: "This download is unavailable or has expired." }, { status: 403 });
    }
    const downloadUrl = await generateArtifactDownloadUrl({
      allocationId: session.grant.allocation_id,
      filename,
      expiresIn: Math.min(3600, secondsRemaining),
    });

    const wantsJson =
      url.searchParams.get("format") === "json" ||
      request.headers.get("accept")?.includes("application/json");
    if (wantsJson) {
      return Response.json({ downloadUrl });
    }

    return NextResponse.redirect(downloadUrl, 307);
  } catch (error) {
    if (error?.message === "AWS_UNAVAILABLE") {
      return Response.json(
        {
          error:
            "Artifact storage is not configured on this server yet. Contact the administrator.",
        },
        { status: 503 },
      );
    }
    return failure(error);
  }
}
