"use client";
import { useEffect } from "react";

// Staging uses distinct counter colors instead of taking space away from the controls.
export default function StagingEnvironment() {
  useEffect(() => {
    const staging = process.env.NEXT_PUBLIC_IS_STAGING === "true"
      || location.hostname.includes("staging") || location.hostname === "localhost";
    document.documentElement.dataset.environment = staging ? "staging" : "production";
  }, []);
  return <span className="sr-only" role="status">{process.env.NEXT_PUBLIC_IS_STAGING === "true" ? "Staging · Testumgebung" : ""}</span>;
}
