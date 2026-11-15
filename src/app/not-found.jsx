import Link from "next/link";
import Navbar from "@/components/Navbar";
export default function NotFound() {
  return (
    <>
      <Navbar />
      <main id="main" className="app-background">
        <div className="container center-page">
          <div className="form-card">
            <span className="eyebrow">404 · PAGE NOT FOUND</span>
            <h1>Let’s find your way back.</h1>
            <p>
              The page you are looking for is unavailable or its link has
              changed.
            </p>
            <Link
              className="button button-primary"
              style={{ marginTop: 25 }}
              href="/landing"
            >
              Back to DCS Compute
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
