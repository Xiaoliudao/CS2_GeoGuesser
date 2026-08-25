// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteRoomButton } from "./InviteRoomButton";

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InviteRoomButton", () => {
  it("copies an origin-relative invite URL with feedback", async () => {
    render(<InviteRoomButton roomCode="87MDB" />);
    fireEvent.click(screen.getByRole("button", { name: "COPY INVITE LINK" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "LINK COPIED ✓" })).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/join/87MDB`);
  });

  it("uses native share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<InviteRoomButton roomCode="87MDB" />);
    fireEvent.click(screen.getByRole("button", { name: "SHARE INVITE" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "INVITE SHARED ✓" })).toBeTruthy());
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/join/87MDB` }));
  });

  it("falls back to copying if native share fails", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new Error("unavailable")) });
    render(<InviteRoomButton roomCode="87MDB" />);
    fireEvent.click(screen.getByRole("button", { name: "SHARE INVITE" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "LINK COPIED ✓" })).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/join/87MDB`);
  });
});
