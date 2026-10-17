export const CHECK_UPDATE = "chaxterlog:check-update";
export const UPDATE_ATTEMPT = "chaxterlog:update-attempt:v1";
export const IDLE_BEFORE_UPDATE = 10_000;
export const RELOAD_COOLDOWN = 5 * 60_000;
export type UpdateBlock = "offline" | "pending" | "form" | "busy" | "cooldown" | null;
export function updateBlock(input: {
  online: boolean; pending: number; formDirty: boolean; editing: boolean; idleMs: number;
  version: string; attemptedVersion?: string; attemptedAt?: number; now: number;
}): UpdateBlock {
  if (!input.online) return "offline";
  if (input.pending > 0) return "pending";
  if (input.formDirty || input.editing) return "form";
  if (input.idleMs < IDLE_BEFORE_UPDATE) return "busy";
  if (input.attemptedVersion === input.version && input.attemptedAt !== undefined && input.now - input.attemptedAt < RELOAD_COOLDOWN) return "cooldown";
  return null;
}
