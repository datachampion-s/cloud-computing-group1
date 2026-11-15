"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, FileText, Search } from "lucide-react";
import {
  buildAdminApplicationsCsv,
  formatDate,
  jakartaToday,
  resolveEffectiveStatus,
} from "@/lib/validation.mjs";

const getEffectiveStatus = (r) =>
  r?.effectiveStatus || resolveEffectiveStatus(r);

const FILTER_TABS = [
  { id: "all", label: "All", match: () => true },
  {
    id: "awaiting_review",
    label: "Awaiting Review",
    match: (r) =>
      [
        "submitted",
        "under_review",
        "approved_in_principle",
        "awaiting_availability",
      ].includes(getEffectiveStatus(r)),
  },
  {
    id: "revision_requested",
    label: "Revision Requested",
    match: (r) => getEffectiveStatus(r) === "revision_requested",
  },
  {
    id: "user_confirmed",
    label: "Confirmed",
    match: (r) => getEffectiveStatus(r) === "user_confirmed",
  },
  {
    id: "scheduled",
    label: "Scheduled",
    match: (r) =>
      ["scheduled", "active", "completed"].includes(getEffectiveStatus(r)),
  },
  {
    id: "unattended",
    label: "Unattended",
    match: (r) => getEffectiveStatus(r) === "unattended",
  },
  {
    id: "rejected",
    label: "Rejected",
    match: (r) => getEffectiveStatus(r) === "rejected",
  },
];

export default function AdminApplicationsTable({ rows = [] }) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [expandedStanding, setExpandedStanding] = useState({});

  function toggleStanding(id) {
    setExpandedStanding((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const tabCounts = useMemo(() => {
    const counts = {};
    for (const tab of FILTER_TABS) {
      counts[tab.id] = rows.filter(tab.match).length;
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const currentTab =
      FILTER_TABS.find((t) => t.id === activeTab) || FILTER_TABS[0];
    const q = searchQuery.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (!currentTab.match(r)) return false;
        if (!q) return true;
        const name = (r.applicant_name || "").toLowerCase();
        const nim = (r.student_id || "").toLowerCase();
        const title = (r.project_title || "").toLowerCase();
        const email = (r.applicant_email || "").toLowerCase();
        const status = getEffectiveStatus(r).toLowerCase().replaceAll("_", " ");
        return (
          name.includes(q) ||
          nim.includes(q) ||
          title.includes(q) ||
          email.includes(q) ||
          status.includes(q)
        );
      })
      .slice()
      .sort((a, b) => {
        const tA = a.created_at ? Date.parse(a.created_at) : 0;
        const tB = b.created_at ? Date.parse(b.created_at) : 0;
        return sortOrder === "oldest" ? tA - tB : tB - tA;
      });
  }, [rows, activeTab, searchQuery, sortOrder]);

  function handleExportCsv() {
    const csv = buildAdminApplicationsCsv(filteredRows);
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dcs-hpc-lpj-report-${jakartaToday()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={18} />
          <h2>Applications</h2>
        </div>
        <button
          type="button"
          className="button button-outline button-small"
          onClick={handleExportCsv}
          disabled={!filteredRows.length}
        >
          <Download size={14} />
          Export to CSV
        </button>
      </div>

      <div className="admin-toolbar">
        <div
          className="admin-filter-tabs"
          role="tablist"
          aria-label="Filter applications by status"
        >
          {FILTER_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`admin-filter-tab ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <span className="admin-filter-count">
                  {tabCounts[tab.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="admin-controls-row">
          <div className="admin-search-wrap">
            <Search size={14} className="admin-search-icon" />
            <input
              type="search"
              placeholder="Search by applicant name, student NIM, or project title…"
              aria-label="Search applications by applicant name, student NIM, or project title"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="admin-sort-wrap">
            <label htmlFor="admin-sort-select">Sort:</label>
            <select
              id="admin-sort-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      {filteredRows.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>APPLICANT</th>
                <th>PROJECT</th>
                <th>STANDING</th>
                <th>STATUS</th>
                <th>DATE</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const standing = r.standing || {
                  flagged: false,
                  label: "Standing: Good Standing",
                };
                const effectiveStatus = getEffectiveStatus(r);
                const title = r.project_title || "";
                return (
                  <tr key={r.id}>
                    <td>
                      {r.applicant_name}
                      <small>{r.student_id}</small>
                    </td>
                    <td>
                      {title.length > 43 ? `${title.slice(0, 43)}…` : title}
                    </td>
                    <td className="admin-standing-cell">
                      <span
                        className={`status-badge ${standing.flagged || standing.needsReview ? "warning" : "good"}`}
                      >
                        {standing.flagged
                          ? "Flagged (Unattended)"
                          : standing.needsReview
                            ? "Attendance Review Needed"
                          : "Good Standing"}
                      </span>
                      {standing.reasons?.length > 0 && (() => {
                        const isExpanded = !!expandedStanding[r.id];
                        return (
                          <div className="admin-standing-details">
                            <small className="admin-standing-summary">
                              {standing.reasons.length}{" "}
                              {standing.reasons.length === 1
                                ? "review note"
                                : "review notes"}
                            </small>
                            <button
                              type="button"
                              className="admin-standing-toggle"
                              aria-expanded={isExpanded}
                              onClick={() => toggleStanding(r.id)}
                            >
                              {isExpanded ? "Hide" : "View more"}
                            </button>
                            {isExpanded && (
                              <ul className="admin-standing-reasons">
                                {standing.reasons.map((reason, idx) => (
                                  <li key={idx}>{reason}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                      <small>Current allocation: {(() => {
                        const allocations = r.compute_allocations || [];
                        const list = Array.isArray(allocations) ? allocations : [allocations];
                        const status = list.find((a) => a.attendance_status)?.attendance_status;
                        return status ? status.replaceAll("_", " ") : "attendance unconfirmed";
                      })()}</small>
                    </td>
                    <td>
                      <span className={`status-badge status-${effectiveStatus}`}>
                        {effectiveStatus.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>{formatDate(r.created_at, { month: "short" })}</td>
                    <td>
                      <Link
                        href={`/admin/applications/${r.id}`}
                        aria-label={`Review application ${r.applicant_name}`}
                      >
                        Review <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <h3>
            {rows.length
              ? "No matching applications"
              : "No applications yet"}
          </h3>
          <p>
            {rows.length
              ? "Try adjusting your search query or status filter tab."
              : "New submissions from the landing form will appear here."}
          </p>
        </div>
      )}
    </section>
  );
}
