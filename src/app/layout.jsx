import "./globals.css";
import { Libre_Baskerville } from "next/font/google";
const accent = Libre_Baskerville({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-accent",
  display: "swap",
});
export const metadata = {
  title: {
    default: "DCS HPC — Research beyond hardware",
    template: "%s · DCS HPC",
  },
  description:
    "Free GPU access for student research. Submit a proposal, get your timeslot, and run experiments with DCS Compute Access.",
  icons: { icon: "/images/hpc-favicon.png" },
};
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={accent.variable} data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
