// src/services/activeGenerations.ts
// Tracks the in-flight chat generation for each conversation, so a separate
// request can cancel it. In-memory only: a cancel only works against the
// server instance actually holding the generation, and everything here is
// lost on restart — acceptable for this app's scale (single instance, and a
// restart already drops any in-flight HTTP connections anyway).
const activeGenerations = new Map<string, AbortController>();

export function registerGeneration(conversationId: string): AbortController {
  const controller = new AbortController();
  activeGenerations.set(conversationId, controller);
  return controller;
}

export function unregisterGeneration(conversationId: string, controller: AbortController): void {
  // Only clear the entry if it's still the one we registered — a newer
  // generation for the same conversation may have already replaced it.
  if (activeGenerations.get(conversationId) === controller) {
    activeGenerations.delete(conversationId);
  }
}

// Returns true if a generation was actually in flight and got cancelled.
export function cancelGeneration(conversationId: string): boolean {
  const controller = activeGenerations.get(conversationId);
  if (!controller) return false;
  controller.abort(new Error("Cancelled by user"));
  return true;
}
