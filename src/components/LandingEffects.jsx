"use client";

import { useEffect } from "react";

export default function LandingEffects() {
  useEffect(() => {
    const root = document.querySelector(".landing-page");
    if (!root) return;
    root.classList.add("motion-ready");
    const targets = root.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return null;
}
