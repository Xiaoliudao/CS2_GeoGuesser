import { useEffect, useId, useRef } from "react";
import type { PublicPlayer } from "../../shared/types";

export function ConfirmKickDialog({
  target,
  isKicking,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  target: PublicPlayer | null;
  isKicking: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!target) return;
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isKicking) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isKicking, onCancel, target]);

  if (!target) return null;

  return (
    <div className="leave-dialog-backdrop">
      <section
        className="leave-dialog kick-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="stage-kicker">HOST ACTION</div>
        <h2 id={titleId}>KICK PLAYER?</h2>
        <p id={descriptionId}>
          <span>Remove <strong>{target.nickname}</strong> from this room?</span>
          <span>
            {target.connected
              ? "They will be disconnected immediately and cannot restore this room session."
              : "They are currently disconnected. Their reserved slot and reconnect access will be removed."}
          </span>
        </p>
        {errorMessage && <p className="leave-dialog-error" role="alert">{errorMessage}</p>}
        <div className="leave-dialog-actions">
          <button
            ref={cancelButtonRef}
            className="secondary-button leave-dialog-cancel"
            type="button"
            disabled={isKicking}
            onClick={onCancel}
          >
            CANCEL
          </button>
          <button
            className="leave-dialog-confirm kick-dialog-confirm"
            type="button"
            disabled={isKicking}
            onClick={onConfirm}
          >
            {isKicking ? "KICKING…" : "KICK PLAYER"}
          </button>
        </div>
      </section>
    </div>
  );
}
