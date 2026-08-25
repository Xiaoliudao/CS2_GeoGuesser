// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStoredSoloSessionId,
  getStoredSoloSessionId,
  SOLO_SESSION_STORAGE_KEY,
  storeSoloSessionId,
} from "./soloSessionStorage";

const SESSION_ID = "a".repeat(64);

beforeEach(() => localStorage.clear());

describe("solo session restoration storage", () => {
  it("stores only opaque valid session ids and clears invalid values", () => {
    storeSoloSessionId(SESSION_ID);
    expect(getStoredSoloSessionId()).toBe(SESSION_ID);

    localStorage.setItem(SOLO_SESSION_STORAGE_KEY, "not-a-session");
    expect(getStoredSoloSessionId()).toBeNull();
    expect(localStorage.getItem(SOLO_SESSION_STORAGE_KEY)).toBeNull();

    storeSoloSessionId(SESSION_ID);
    clearStoredSoloSessionId();
    expect(getStoredSoloSessionId()).toBeNull();
  });
});
