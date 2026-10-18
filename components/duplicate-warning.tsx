"use client";

export type DuplicateWarningData = {
  group: "u15" | "o15";
  diffSeconds: number;
  user1: string;
  user2: string;
};

export default function DuplicateWarning({ warning, onUndo, onDismiss }: {
  warning: DuplicateWarningData;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const group = warning.group === "u15" ? "U15" : "Ü15";
  const seconds = warning.diffSeconds || 1;
  const description = `Mögliche Doppelzählung: 2× ${group} innerhalb von ${seconds} ${seconds === 1 ? "Sekunde" : "Sekunden"} erfasst (${warning.user1} und ${warning.user2}).`;

  return (
    <aside className="duplicate-notice" role="alert" title={description}>
      <span className="duplicate-summary" aria-hidden="true">
        <strong>Mögliche Doppelzählung</strong>
        <span>{group} wurde zweimal innerhalb von {seconds} {seconds === 1 ? "Sekunde" : "Sekunden"} gezählt.</span>
      </span>
      <span className="sr-only">{description}</span>
      <button type="button" className="duplicate-undo-btn" onClick={onUndo} aria-label={`${group}: eine mögliche Doppelzählung abziehen`}>1× {group} abziehen</button>
      <button type="button" className="duplicate-dismiss" onClick={onDismiss} aria-label="Hinweis zur Doppelzählung schließen">×</button>
    </aside>
  );
}
