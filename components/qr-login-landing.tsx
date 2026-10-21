"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ChaxterLogo from "./chaxter-logo";
import { signInWithQr, tokenFromQr } from "@/lib/qr-login";
import { errorMessage } from "@/lib/errors";

// Opened by a phone or tablet camera app: the token sits in the URL fragment and never reaches server logs.
export default function QrLoginLanding() {
  const [error, setError] = useState("");
  useEffect(() => {
    const token = tokenFromQr(window.location.hash.slice(1));
    history.replaceState(null, "", "/login/qr");
    if (!token) { setError("Dieser Link enthält keinen gültigen QR-Code."); return; }
    signInWithQr(token).then(() => window.location.assign("/")).catch((err) => setError(errorMessage(err, "Anmeldung fehlgeschlagen.")));
  }, []);
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo-wrap"><ChaxterLogo priority /></div>
        <h1>{error ? "Anmeldung nicht möglich" : "Anmelden …"}</h1>
        <p className="auth-subtitle">{error ? "" : "Mit QR-Code"}</p>
        {error && <p role="alert" className="error-message">{error}</p>}
        {error && <Link className="primary-button auth-link" href="/login">Mit Passwort anmelden</Link>}
      </div>
    </main>
  );
}
