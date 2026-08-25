import { SOLO_SESSION_ID_PATTERN } from "../../shared/solo";

export const SOLO_SESSION_STORAGE_KEY = "cs2-guesser-solo-session-id";

export function getStoredSoloSessionId(): string | null {
  try {
    const sessionId = localStorage.getItem(SOLO_SESSION_STORAGE_KEY);
    if (!sessionId) return null;
    if (SOLO_SESSION_ID_PATTERN.test(sessionId)) return sessionId;
    localStorage.removeItem(SOLO_SESSION_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function storeSoloSessionId(sessionId: string): void {
  if (!SOLO_SESSION_ID_PATTERN.test(sessionId)) return;
  try {
    localStorage.setItem(SOLO_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Storage can be unavailable in private browsing. The active tab still works.
  }
}

export function clearStoredSoloSessionId(): void {
  try {
    localStorage.removeItem(SOLO_SESSION_STORAGE_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}
