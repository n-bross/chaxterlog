"use client";

import { useRef, useState, type ReactNode } from "react";
import { useAsyncAction } from "./interior/loading-button";

export function DownloadIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
  </svg>;
}

export function StatisticGraphic({ as: Tag = "div", className = "", title, subtitle, disabled = false, children }: {
  as?: "div" | "article" | "section";
  className?: string;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const download = useAsyncAction({
    action: async () => {
      setError(false);
      if (!element.current) return;
      const { downloadStatistic } = await import("@/lib/statistic-export");
      const name = ["chaxterlog", title, subtitle].filter(Boolean).join("-")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase();
      await downloadStatistic(element.current, `${name}.tiff`);
    },
    onError: () => setError(true),
  });
  const label = download.pending ? "TIFF wird erstellt …" : `${title} als TIFF herunterladen`;
  return <Tag ref={element} className={`statistic-graphic ${className}`} aria-label={title}>
    <button type="button" className="statistic-download icon-button" data-export-exclude=""
      aria-label={label} title={label} aria-busy={download.pending} disabled={disabled || download.pending} onClick={download.run}>
      <DownloadIcon />
    </button>
    {children}
    {error && <p className="error-message" role="alert" data-export-exclude="">TIFF konnte nicht erstellt werden. Bitte erneut versuchen.</p>}
  </Tag>;
}
