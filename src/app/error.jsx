"use client";
export default function ErrorPage({ reset }) {
  return (
    <main id="main" className="app-background">
      <div className="container center-page">
        <div className="form-card">
          <h1>We hit a little pause.</h1>
          <p style={{ marginBlock: 20 }}>
            This page could not be loaded. Please try again or contact the DCS
            admin.
          </p>
          <button className="button button-primary" onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
