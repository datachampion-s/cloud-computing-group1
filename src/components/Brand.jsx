import Image from "next/image";
import Link from "next/link";
export function Brand({ hero = false }) {
  return (
    <Link
      href="/landing"
      className={`brand ${hero ? "brand-hero" : ""}`}
      aria-label="DCS HPC — home"
    >
      <Image
        src="/images/hpc-logo.png"
        alt="DCS HPC — High-Performance Compute"
        width={512}
        height={512}
        priority
      />
      <span className="brand-divider" />
      <span className="brand-description">
        An initiative by
        <br />
        <strong>Data Champion Society</strong>
      </span>
    </Link>
  );
}
export function PoweredByAWS({ dark = false }) {
  return (
    <a
      href="https://aws.amazon.com/what-is-cloud-computing/"
      target="_blank"
      rel="noreferrer"
      className={`powered-aws ${dark ? "powered-dark" : ""}`}
      aria-label="Powered by AWS"
    >
      <Image
        src="/images/powered-by-aws.png"
        alt="Powered by AWS"
        width={150}
        height={55}
      />
    </a>
  );
}
