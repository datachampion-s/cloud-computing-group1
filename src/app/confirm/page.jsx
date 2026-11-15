import Navbar from "@/components/Navbar";
import ConfirmationCard from "@/components/ConfirmationCard";
export const metadata = {
  title: "Schedule confirmation",
  robots: { index: false, follow: false },
};
export default function ConfirmPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="app-background">
        <div className="container center-page">
          <ConfirmationCard />
        </div>
      </main>
    </>
  );
}
