"use client";
import { useEffect, useState } from "react";

export default function StagingBanner() {
  const [isStaging, setIsStaging] = useState(false);

  useEffect(() => {
    const isEnvStaging = process.env.NEXT_PUBLIC_IS_STAGING === "true";
    const isHostStaging =
      typeof window !== "undefined" &&
      (window.location.hostname.includes("staging") || window.location.hostname.includes("localhost"));
    setIsStaging(isEnvStaging || isHostStaging);
  }, []);

  if (!isStaging) return null;

  return (
    <div className="staging-banner" role="status" aria-label="Staging Testumgebung">
      <span className="staging-badge">TESTUMGEBUNG / STAGING</span>
      <span className="staging-text">Unabhängige Testdatenbank · Nicht die Produktivseite</span>
    </div>
  );
}
