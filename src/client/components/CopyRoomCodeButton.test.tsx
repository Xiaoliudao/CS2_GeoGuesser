// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyRoomCodeButton } from "./CopyRoomCodeButton";

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CopyRoomCodeButton", () => {
  it("shows clear success feedback after copying", async () => {
    writeText.mockResolvedValue(undefined);
    render(<CopyRoomCodeButton roomCode="K7P2A" />);

    fireEvent.click(screen.getByRole("button", { name: "COPY" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "COPIED ✓" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith("K7P2A");
    expect(screen.getByRole("button", { name: "COPIED ✓" }).classList.contains("is-copied")).toBe(true);
  });

  it("shows failure feedback when clipboard access is rejected", async () => {
    writeText.mockRejectedValue(new Error("permission denied"));
    render(<CopyRoomCodeButton roomCode="K7P2A" />);

    fireEvent.click(screen.getByRole("button", { name: "COPY" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "COPY FAILED" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "COPY FAILED" }).classList.contains("is-failed")).toBe(true);
  });

  it("returns to the default label after the feedback delay", async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue(undefined);
    render(<CopyRoomCodeButton roomCode="K7P2A" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "COPY" }));
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "COPIED ✓" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole("button", { name: "COPY" })).toBeTruthy();
  });
});
