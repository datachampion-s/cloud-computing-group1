import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand, PoweredByAWS } from "./Brand";
import SectionLink from "./SectionLink";
export default function Footer({ landing = false }) {
  return (
    <footer className={`site-footer${landing ? " landing-footer" : ""}`}>
      <div className="container">
        <div className="footer-main">
          <div>
            <Brand />
            <p>
              One data community.
              <br />A little more computing possibility.
            </p>
          </div>
          <div className="footer-links">
            <strong>Explore</strong>
            <Link href="/apply">Apply for access</Link>
            <Link href="/compute">Compute portal</Link>
            <SectionLink href="/landing#guide">Research guide</SectionLink>
          </div>
          <div className="footer-links">
            <strong>Stay connected</strong>
            <a
              href="https://datachampions.tech"
              target="_blank"
              rel="noreferrer"
            >
              DCS main website {!landing && <ArrowUpRight size={14} />}
            </a>
            <a
              href="https://instagram.com/datachampion.s"
              target="_blank"
              rel="noreferrer"
            >
              Instagram {!landing && <ArrowUpRight size={14} />}
            </a>
          </div>
          <PoweredByAWS />
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Data Champion Society · UNNES
          </span>
          <span>For learning. For research. For what’s next.</span>
        </div>
      </div>
    </footer>
  );
}
