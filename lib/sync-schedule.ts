// Keep shared counting responsive during use; quiet tablets don't need a 3s poll.
export function syncDelay(idleMs: number, failures: number): number {
  if (failures > 0) return Math.min(60_000, 3_000 * 2 ** Math.min(failures, 5));
  return idleMs >= 60_000 ? 30_000 : 3_000;
}
