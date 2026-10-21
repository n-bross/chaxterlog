"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./interior/modal";
import { signInWithQr, tokenFromQr } from "@/lib/qr-login";
import { errorMessage } from "@/lib/errors";

// Reads the login QR code with this device's camera, so the session lands in the same app or browser
// that is used for counting (a code scanned with the camera app may open a different browser).
export default function QrScanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "signing-in" | "error">("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null, frame = 0, stopped = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    setState("starting"); setError("");
    (async () => {
      try {
        const { default: jsQR } = await import("jsqr");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setState("scanning");
        const scan = async () => {
          if (stopped || !video.current) return;
          const { videoWidth: width, videoHeight: height } = video.current;
          if (width && height) {
            canvas.width = width; canvas.height = height;
            context.drawImage(video.current, 0, 0, width, height);
            const code = jsQR(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: "dontInvert" });
            const token = code ? tokenFromQr(code.data) : null;
            if (token) {
              stopped = true;
              stream?.getTracks().forEach((track) => track.stop());
              setState("signing-in");
              try { await signInWithQr(token); window.location.assign("/"); }
              catch (err) { setError(errorMessage(err, "Anmeldung fehlgeschlagen.")); setState("error"); }
              return;
            }
          }
          frame = requestAnimationFrame(() => void scan());
        };
        void scan();
      } catch (err) {
        setError((err as Error)?.name === "NotAllowedError" ? "Kein Zugriff auf die Kamera. Bitte in den Browser-Einstellungen erlauben." : "Die Kamera konnte nicht gestartet werden.");
        setState("error");
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Mit QR-Code anmelden" description="Halte deinen Anmelde-QR-Code vor die Kamera." maxWidth={420} className="interior-modal">
      <div className="qr-scanner">
        <div className="qr-viewport" data-state={state}>
          <video ref={video} playsInline muted aria-label="Kamerabild" />
          <span className="qr-frame" aria-hidden="true" />
          {state !== "scanning" && <span className="qr-overlay" role="status">{state === "starting" ? "Kamera wird gestartet …" : state === "signing-in" ? "Anmelden …" : "Gestoppt"}</span>}
        </div>
        {error && <p role="alert" className="error-message">{error}</p>}
        <p className="muted">Den QR-Code erstellt jeder Mitarbeiter selbst unter „Konto“.</p>
      </div>
    </Modal>
  );
}
