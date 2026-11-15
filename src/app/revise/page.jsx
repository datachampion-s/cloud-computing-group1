import Link from "next/link";
import { ArrowLeft, FileEdit, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import RevisionForm from "@/components/RevisionForm";
import { PoweredByAWS } from "@/components/Brand";
import { database, timingSafeMatch } from "@/lib/server";

export const metadata = {
  title: "Submit proposal revision",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RevisePage({ searchParams }) {
  const params = await searchParams;
  const id = typeof params?.id === "string" ? params.id.trim() : "";
  const key = typeof params?.key === "string" ? params.key.trim() : "";

  let application = null;
  let latestReview = null;
  let loadError = "";

  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !key) {
    loadError =
      "This revision link is incomplete or invalid. Please open the exact link from your revision request email.";
  } else {
    try {
      const db = database();
      const { data: app, error } = await db
        .from("applications")
        .select(
          "id,applicant_name,applicant_email,project_title,status,proposal_drive_url,ktm_drive_url,submission_key",
        )
        .eq("id", id)
        .maybeSingle();

      if (error || !app) {
        loadError =
          "Application not found. Please verify the link from your revision request email.";
      } else {
        // Legacy applications without a submission key fall back to the application ID.
        const expectedKey = app.submission_key
          ? String(app.submission_key)
          : String(app.id);
        const validKey = timingSafeMatch(key, expectedKey);

        if (!validKey) {
          loadError =
            "Invalid revision key. Please open the direct link sent to your email.";
        } else {
          application = {
            id: app.id,
            applicant_name: app.applicant_name,
            applicant_email: app.applicant_email,
            project_title: app.project_title,
            status: app.status,
            proposal_drive_url: app.proposal_drive_url || "",
            ktm_drive_url: app.ktm_drive_url || "",
          };

          const { data: reviews } = await db
            .from("application_reviews")
            .select("id,decision,note,created_at")
            .eq("application_id", id)
            .order("created_at", { ascending: false })
            .limit(5);

          latestReview =
            reviews?.find((r) => r.decision === "revision_requested") ||
            reviews?.[0] ||
            null;
        }
      }
    } catch {
      // Allow client form to render if server DB is unreachable in preview environments
      application = {
        id,
        applicant_name: params?.name || "Student Researcher",
        applicant_email: "",
        project_title: params?.title || "Research Compute Application",
        status: "revision_requested",
        proposal_drive_url: "",
        ktm_drive_url: "",
      };
    }
  }

  return (
    <>
      <Navbar />
      <main id="main" className="app-background">
        <div className="container">
          <Link className="back-link" href="/landing">
            <ArrowLeft size={14} />
            Back to DCS Compute
          </Link>
          <div className="form-layout">
            <aside className="form-intro">
              <span className="eyebrow">PROPOSAL REVISION</span>
              <h1>
                Refine your scope. <br />
                <em>Keep your momentum.</em>
              </h1>
              <p>
                Address the reviewer feedback below, update your shared Google
                Drive documents if needed, and submit your revision note so the
                DCS Compute committee can re-evaluate your request.
              </p>
              <div className="notice review-time">
                <FileEdit size={18} />
                <span>
                  <strong>Direct re-evaluation workflow.</strong>
                  <br />
                  Submitting this form moves your application back to{" "}
                  <strong>under review</strong> and notifies the administrator
                  immediately.
                </span>
              </div>
              <div className="form-help">
                <ShieldCheck size={20} />
                <div>
                  <strong>Document access reminder</strong>
                  <p>
                    If you provide a new Google Drive link for your proposal or
                    KTM, ensure Viewer access is enabled for the DCS reviewer.
                  </p>
                </div>
              </div>
              <PoweredByAWS className="aws-sidebar" />
            </aside>
            <RevisionForm
              application={application}
              submissionKey={key}
              latestFeedback={latestReview?.note || ""}
              feedbackDate={latestReview?.created_at || ""}
              loadError={loadError}
            />
          </div>
        </div>
      </main>
    </>
  );
}
