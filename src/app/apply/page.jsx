import Link from "next/link";
import { ArrowLeft, Clock3, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import ApplicationForm from "@/components/ApplicationForm";
import { PoweredByAWS } from "@/components/Brand";
export const metadata = { title: "Apply for compute access" };
export default function ApplyPage() {
  let templateUrl = "";
  try {
    const url = new URL(process.env.NEXT_PUBLIC_PROPOSAL_TEMPLATE_URL || "");
    if (url.protocol === "https:" && url.hostname === "docs.google.com")
      templateUrl = url.href;
  } catch {}
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
              <span className="eyebrow">LET’S MAKE ROOM FOR YOUR RESEARCH</span>
              <h1>
                Your next idea. <br />
                <em>Our shared possibility.</em>
              </h1>
              <p>
                Request computing time for your research or competition. Start
                with your details, a proposal, and the times that work for you.
              </p>
              <div className="notice review-time">
                <Clock3 size={18} />
                <span>
                  <strong>
                    Applications are reviewed within 3 business days.
                  </strong>
                  <br />
                  We’ll email you with an update.
                </span>
              </div>
              <div className="form-help">
                <ShieldCheck size={20} />
                <p>
                  Free for approved applications. The initial program
                  prioritizes UNNES Statistics students. Resources and session
                  duration are allocated by the admin.
                </p>
              </div>
              <PoweredByAWS />
            </aside>
            <ApplicationForm
              adminEmail={process.env.ADMIN_EMAIL || ""}
              templateUrl={templateUrl}
            />
          </div>
        </div>
      </main>
    </>
  );
}
