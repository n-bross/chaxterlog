export type Correction = {
  id: string;
  kind: "undo" | "redo";
  timestamp: string;
  order?: number;
  userId?: string;
  username?: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
};
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function isCorrection(value: unknown): value is Correction {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return isUuid(item.id) && (item.kind === "undo" || item.kind === "redo")
    && typeof item.timestamp === "string" && Number.isFinite(Date.parse(item.timestamp))
    && (item.order === undefined || typeof item.order === "number" && Number.isFinite(item.order))
    && ["userId", "username", "deviceId", "deviceName", "platform"].every((key) => item[key] === undefined || typeof item[key] === "string" && item[key].length <= 100)
    && (item.deviceId === undefined || isUuid(item.deviceId));
}
