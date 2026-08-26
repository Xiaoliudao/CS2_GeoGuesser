import { useEffect, useId, useRef } from "react";

export type ConfirmLeaveMode = "room" | "match";

interface ConfirmLeaveDialogProps {
  open: boolean;
  mode: ConfirmLeaveMode;
  isLeaving: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmLeaveDialog({
  open,
  mode,
  isLeaving,
  errorMessage,
  onCancel,
  onConfirm,
}: ConfirmLeaveDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const confirmStartedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      confirmStartedRef.current = false;
      return;
    }

    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus();

    return () => {
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isLeaving) return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;
      const focusableButtons = [cancelButtonRef.current, confirmButtonRef.current]
        .filter((button): button is HTMLButtonElement => Boolean(button && !button.disabled));
      if (focusableButtons.length === 0) {
        event.preventDefault();
        return;
      }

      const firstButton = focusableButtons[0];
      const lastButton = focusableButtons[focusableButtons.length - 1];
      const activeElement = document.activeElement;
      if (!focusableButtons.includes(activeElement as HTMLButtonElement)) {
        event.preventDefault();
        firstButton.focus();
      } else if (event.shiftKey && activeElement === firstButton) {
        event.preventDefault();
        lastButton.focus();
      } else if (!event.shiftKey && activeElement === lastButton) {
        event.preventDefault();
        firstButton.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isLeaving, onCancel, open]);

  if (!open) return null;

  const isRoom = mode === "room";
  const title = isRoom ? "LEAVE ROOM?" : "LEAVE MATCH?";
  const confirmLabel = isRoom ? "LEAVE ROOM" : "LEAVE MATCH";

  const handleConfirm = async () => {
    if (isLeaving || confirmStartedRef.current) return;
    confirmStartedRef.current = true;
    try {
      await onConfirm();
    } catch {
      confirmStartedRef.current = false;
    }
  };

  return (
    <div className="leave-dialog-backdrop">
      <section
        className="leave-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={errorMessage ? `${descriptionId} ${errorId}` : descriptionId}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>
          {isRoom ? (
            "Are you sure you want to leave this room?"
          ) : (
            <>
              <span>Are you sure you want to leave the match?</span>
              <span>Your current game may continue without you.</span>
            </>
          )}
        </p>
        {errorMessage && <p className="leave-dialog-error" id={errorId} role="alert">{errorMessage}</p>}
        <div className="leave-dialog-actions">
          <button
            ref={cancelButtonRef}
            className="secondary-button leave-dialog-cancel"
            type="button"
            disabled={isLeaving}
            onClick={onCancel}
          >
            CANCEL
          </button>
          <button
            ref={confirmButtonRef}
            className="leave-dialog-confirm"
            type="button"
            disabled={isLeaving}
            onClick={() => void handleConfirm()}
          >
            {isLeaving ? "LEAVING…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
