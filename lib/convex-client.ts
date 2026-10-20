"use client";
import { ConvexReactClient } from "convex/react";
export const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { unsavedChangesWarning: false });
// Right after a page load the WebSocket is still connecting; give it a moment before treating the browser as offline.
export function waitForConnection(timeoutMs = 5000): Promise<boolean> {
  if (!navigator.onLine) return Promise.resolve(false);
  if (convex.connectionState().isWebSocketConnected) return Promise.resolve(true);
  return new Promise((resolve) => {
    let finished = false, unsubscribe = () => {};
    const done = (connected: boolean) => { finished = true; clearTimeout(timer); unsubscribe(); resolve(connected); };
    const timer = setTimeout(() => done(false), timeoutMs);
    unsubscribe = convex.subscribeToConnectionState((state) => { if (state.isWebSocketConnected) done(true); });
    if (finished) unsubscribe();
  });
}
