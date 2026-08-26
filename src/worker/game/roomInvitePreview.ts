import { MAX_MULTIPLAYER_PLAYERS } from "../../shared/multiplayer";
import type { RoomInvitePreview } from "../../shared/roomInvite";
import type { RoomSettings } from "../../shared/roomSettings";
import type { RoomStatus } from "../../shared/types";

export function missingRoomInvitePreview(roomCode: string): RoomInvitePreview {
  return {
    exists: false,
    joinable: false,
    reconnectable: false,
    roomCode,
    reason: "not_found",
  };
}

export function roomInvitePreview({
  roomCode,
  status,
  settings,
  playerIds,
  viewerPlayerId,
  kickedPlayerIds = [],
}: {
  roomCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  playerIds: string[];
  viewerPlayerId: string | null;
  kickedPlayerIds?: string[];
}): RoomInvitePreview {
  const viewerWasKicked = viewerPlayerId !== null && kickedPlayerIds.includes(viewerPlayerId);
  const reconnectable = viewerPlayerId !== null && playerIds.includes(viewerPlayerId);
  const playerCount = Math.min(playerIds.length, MAX_MULTIPLAYER_PLAYERS);
  let joinable = false;
  let reason: "full" | "in_progress" | "expired" | "kicked" | null = null;

  if (viewerWasKicked) {
    reason = "kicked";
  } else if (status === "waiting") {
    joinable = reconnectable || playerCount < MAX_MULTIPLAYER_PLAYERS;
    reason = joinable ? null : "full";
  } else if (status === "finished") {
    reason = "expired";
  } else {
    joinable = reconnectable;
    reason = reconnectable ? null : "in_progress";
  }

  return {
    exists: true,
    joinable,
    reconnectable,
    roomCode,
    reason,
    playerCount,
    maxPlayers: MAX_MULTIPLAYER_PLAYERS,
    settings: {
      totalRounds: settings.totalRounds,
      roundDurationSeconds: settings.roundDurationSeconds,
      mapCount: settings.mapPool.length,
      difficultyPool: [...settings.difficultyPool],
      serverRegion: settings.serverRegion,
    },
  };
}
