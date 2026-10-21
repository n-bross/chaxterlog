"use client";
import { useEffect } from "react";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isField = (target: EventTarget | null): target is Field =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

// A field's own hint (title or aria-describedby) explains its format best.
function hint(field: Field) {
  if (field.title) return field.title;
  const ids = field.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
}

function message(field: Field) {
  const { validity } = field;
  const input = field instanceof HTMLInputElement ? field : null;
  if (validity.valueMissing) return input?.type === "date" ? "Bitte ein Datum wählen." : "Bitte ausfüllen.";
  if (validity.tooShort && !(field instanceof HTMLSelectElement)) return `Mindestens ${field.minLength} Zeichen (aktuell ${field.value.length}).`;
  if (validity.tooLong && !(field instanceof HTMLSelectElement)) return `Höchstens ${field.maxLength} Zeichen.`;
  if (validity.patternMismatch) return hint(field) || "Ungültiges Format.";
  if (validity.rangeUnderflow && input) return `Frühestens ${input.min}.`;
  if (validity.rangeOverflow && input) return `Spätestens ${input.max}.`;
  if (validity.typeMismatch || validity.badInput) return "Ungültige Eingabe.";
  return "";
}

// Native validation bubbles follow the browser language; the app is German throughout.
export default function GermanValidation() {
  useEffect(() => {
    const invalid = (event: Event) => {
      if (!isField(event.target)) return;
      event.target.setCustomValidity("");
      event.target.setCustomValidity(message(event.target));
    };
    const reset = (event: Event) => { if (isField(event.target)) event.target.setCustomValidity(""); };
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", reset, true);
    document.addEventListener("change", reset, true);
    return () => {
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", reset, true);
      document.removeEventListener("change", reset, true);
    };
  }, []);
  return null;
}
