"use client";

export default function SectionLink({ href, children, className }) {
  function navigate(event) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const url = new URL(href, window.location.href);
    if (url.pathname !== window.location.pathname || !url.hash) return;
    const section = document.getElementById(url.hash.slice(1));
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", url.hash);
  }
  return (
    <a href={href} className={className} onClick={navigate}>
      {children}
    </a>
  );
}
