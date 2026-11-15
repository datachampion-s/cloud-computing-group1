"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "./Brand";
import SectionLink from "./SectionLink";
export default function Navbar({ hideDuringHero = false, landing = false }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [heroVisible, setHeroVisible] = useState(hideDuringHero);
  const header = useRef(null);
  const menuButton = useRef(null);
  const brandHidden = hideDuringHero && heroVisible;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!hideDuringHero) return;
    const hero = document.getElementById("compute-hero");
    if (!hero) {
      setHeroVisible(false);
      return;
    }
    const headerHeight = header.current?.getBoundingClientRect().height || 0;
    const sectionOffset =
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
      0;
    const boundary = Math.max(headerHeight, sectionOffset) + 16;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { rootMargin: `-${boundary}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [hideDuringHero]);

  return (
    <header className={`site-header${landing ? " landing-header" : ""}`} ref={header}>
      <div className="container nav-inner">
        <div
          className={`nav-brand${brandHidden ? " nav-brand-hidden" : ""}`}
          aria-hidden={brandHidden}
          inert={brandHidden}
        >
          <Brand />
        </div>
        <button
          ref={menuButton}
          className="icon-button menu-button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          {open ? <X size={23} /> : <Menu size={23} />}
        </button>
        <nav
          id="main-nav"
          className={open ? "nav-links is-open" : "nav-links"}
          aria-label="Main navigation"
          inert={mobile && !open}
          onClick={() => setOpen(false)}
        >
          <SectionLink href="/landing#how-it-works">How it works</SectionLink>
          <SectionLink href="/landing#guide">Getting started</SectionLink>
          <SectionLink href="/landing#faq">FAQ</SectionLink>
          <Link href="/compute" className="button button-small button-outline">
            Compute portal {!landing && <ArrowUpRight size={16} />}
          </Link>
        </nav>
      </div>
    </header>
  );
}
