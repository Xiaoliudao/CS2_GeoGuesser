import type { PublicPlayer, RoomStatus } from "../../shared/types";

export function HostKickButton({
  viewerPlayerId,
  hostPlayerId,
  target,
  status,
  isKicking = false,
  onKick,
}: {
  viewerPlayerId: string;
  hostPlayerId: string | null;
  target: PublicPlayer;
  status: RoomStatus;
  isKicking?: boolean;
  onKick: (playerId: string) => void;
}) {
  if (
    viewerPlayerId !== hostPlayerId
    || target.id === hostPlayerId
    || !target.active
    || status === "finished"
  ) return null;

  return (
    <button
      className="host-kick-button"
      type="button"
      aria-label={`Kick ${target.nickname}`}
      disabled={isKicking}
      onClick={() => onKick(target.id)}
    >
      {isKicking ? "KICKING…" : "KICK"}
    </button>
  );
}
