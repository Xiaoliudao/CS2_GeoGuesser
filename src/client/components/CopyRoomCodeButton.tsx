import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";

type CopyStatus = "idle" | "copied" | "failed";

const RESET_DELAY_MS = 2_000;

export function CopyRoomCodeButton({ roomCode }: { roomCode: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = () => {
    if (resetTimerRef.current === null) return;
    window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
  };

  useEffect(() => clearResetTimer, []);

  const copyRoomCode = async () => {
    clearResetTimer();
    setStatus(await copyText(roomCode) ? "copied" : "failed");
    resetTimerRef.current = window.setTimeout(() => {
      setStatus("idle");
      resetTimerRef.current = null;
    }, RESET_DELAY_MS);
  };

  const label = status === "copied" ? "COPIED ✓" : status === "failed" ? "COPY FAILED" : "COPY CODE";
  const title = status === "copied"
    ? "Room code copied"
    : status === "failed"
      ? "Copy failed; try again"
      : "Copy room code";

  return (
    <button
      className={`copy-button ${status === "idle" ? "" : `is-${status}`}`}
      type="button"
      title={title}
      aria-live="polite"
      onClick={() => void copyRoomCode()}
    >
      {label}
    </button>
  );
}
