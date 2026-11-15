"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { jakartaToday } from "@/lib/validation.mjs";
export default function DatePicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    (value || jakartaToday()).slice(0, 7),
  );
  const ref = useRef(null);
  const trigger = useRef(null);
  const today = jakartaToday();
  const max = new Date(`${today}T12:00:00+07:00`);
  max.setUTCDate(max.getUTCDate() + 90);
  const maxDate = jakartaToday(max);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const [year, m] = month.split("-").map(Number);
  const firstDay = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  function move(n) {
    const d = new Date(Date.UTC(year, m - 1 + n, 1));
    setMonth(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return (
    <div className="date-picker" ref={ref}>
      <button
        type="button"
        className="date-trigger"
        ref={trigger}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>
          {value
            ? new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Jakarta",
              }).format(new Date(`${value}T12:00:00+07:00`))
            : "Choose a date"}
        </span>
        <CalendarDays size={15} />
      </button>
      {open && (
        <div
          className="calendar-popover"
          role="dialog"
          aria-label="Choose an access date"
        >
          <div className="calendar-header">
            <button
              type="button"
              className="icon-button"
              disabled={month <= today.slice(0, 7)}
              onClick={() => move(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <strong aria-live="polite">
              {new Intl.DateTimeFormat("en-GB", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(year, m - 1, 1)))}
            </strong>
            <button
              type="button"
              className="icon-button"
              disabled={month >= maxDate.slice(0, 7)}
              onClick={() => move(1)}
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={date < today || date > maxDate}
                  className={date === value ? "selected" : ""}
                  aria-label={`${i + 1} ${month}`}
                  aria-pressed={date === value}
                  onClick={() => {
                    onChange(date);
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <small>Time zone: WIB (UTC+7)</small>
        </div>
      )}
    </div>
  );
}
