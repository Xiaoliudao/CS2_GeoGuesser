// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmLeaveDialog } from "./ConfirmLeaveDialog";

afterEach(cleanup);

describe("ConfirmLeaveDialog", () => {
  it("renders the exact waiting-room copy with accessible dialog semantics", () => {
    render(
      <ConfirmLeaveDialog
        open
        mode="room"
        isLeaving={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "LEAVE ROOM?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Are you sure you want to leave this room?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "CANCEL" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "LEAVE ROOM" })).toBeTruthy();
  });

  it("renders the exact active-match copy", () => {
    render(
      <ConfirmLeaveDialog
        open
        mode="match"
        isLeaving={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "LEAVE MATCH?" })).toBeTruthy();
    expect(screen.getByText("Are you sure you want to leave the match?")).toBeTruthy();
    expect(screen.getByText("Your current game may continue without you.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "LEAVE MATCH" })).toBeTruthy();
  });

  it("moves focus to Cancel, does not confirm on Enter, and restores trigger focus", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "LEAVE";
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <ConfirmLeaveDialog
        open
        mode="room"
        isLeaving={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    const cancel = screen.getByRole("button", { name: "CANCEL" });
    expect(document.activeElement).toBe(cancel);

    await user.keyboard("{Enter}");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(
      <ConfirmLeaveDialog
        open={false}
        mode="room"
        isLeaving={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    trigger.remove();
  });

  it("cancels with Escape and never dismisses from a backdrop click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmLeaveDialog
        open
        mode="match"
        isLeaving={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    await user.click(document.querySelector(".leave-dialog-backdrop") as HTMLElement);
    expect(onCancel).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("traps forward and reverse Tab navigation inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmLeaveDialog
        open
        mode="match"
        isLeaving={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const cancel = screen.getByRole("button", { name: "CANCEL" });
    const confirm = screen.getByRole("button", { name: "LEAVE MATCH" });
    expect(document.activeElement).toBe(cancel);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(confirm);
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(cancel);
  });

  it("guards synchronous double submission and reflects async leaving state", async () => {
    const user = userEvent.setup();
    let resolveLeave: (() => void) | undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => {
      resolveLeave = resolve;
    }));
    const { rerender } = render(
      <ConfirmLeaveDialog
        open
        mode="match"
        isLeaving={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.dblClick(screen.getByRole("button", { name: "LEAVE MATCH" }));
    expect(onConfirm).toHaveBeenCalledOnce();

    rerender(
      <ConfirmLeaveDialog
        open
        mode="match"
        isLeaving
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const leaving = screen.getByRole("button", { name: "LEAVING…" }) as HTMLButtonElement;
    expect(leaving.disabled).toBe(true);
    resolveLeave?.();
  });

  it("resets the submission guard after a rejected leave", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new Error("leave failed"))
      .mockResolvedValueOnce(undefined);
    render(
      <ConfirmLeaveDialog
        open
        mode="room"
        isLeaving={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole("button", { name: "LEAVE ROOM" });
    await user.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await user.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });

  it("announces a retryable leave failure inside the dialog", () => {
    render(
      <ConfirmLeaveDialog
        open
        mode="match"
        isLeaving={false}
        errorMessage="The leave request failed. Please try again."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Please try again");
  });
});
