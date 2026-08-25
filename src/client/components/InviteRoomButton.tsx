import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";
import { createRoomInviteUrl, roomInviteShareText } from "../lib/roomInvite";

type InviteStatus = "idle" | "copied" | "shared" | "failed";

const RESET_DELAY_MS = 2_000;

export function InviteRoomButton({ roomCode, compact = false }: { roomCode: string; compact?: boolean }) {
  const [status, setStatus] = useState<InviteStatus>("idle");
  const resetTimerRef = useRef<number | null>(null);
  const canShare = typeof navigator.share === "function";

  const clearResetTimer = () => {
    if (resetTimerRef.current === null) return;
    window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
  };

  useEffect(() => clearResetTimer, []);

  const scheduleReset = () => {
    resetTimerRef.current = window.setTimeout(() => {
      setStatus("idle");
      resetTimerRef.current = null;
    }, RESET_DELAY_MS);
  };

  const invite = async () => {
    clearResetTimer();
    const inviteUrl = createRoomInviteUrl(window.location.origin, roomCode);
    if (canShare) {
      try {
        await navigator.share({
          title: "CS2 Map Guesser invitation",
          text: roomInviteShareText(roomCode),
          url: inviteUrl,
        });
        setStatus("shared");
        scheduleReset();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    const copied = await copyText(inviteUrl);
    setStatus(copied ? "copied" : "failed");
    scheduleReset();
  };

  const label = status === "copied"
    ? "LINK COPIED ✓"
    : status === "shared"
      ? "INVITE SHARED ✓"
      : status === "failed"
        ? "SHARE FAILED"
        : compact
          ? "INVITE PLAYER"
          : canShare
            ? "SHARE INVITE"
            : "COPY INVITE LINK";

  return (
    <button
      className={`copy-button invite-button ${status === "idle" ? "" : `is-${status}`}`}
      type="button"
      aria-live="polite"
      title="Share a room invite link"
      onClick={() => void invite()}
    >
      {label}
    </button>
  );
}
