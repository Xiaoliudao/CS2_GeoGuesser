import { ROOM_INVITE_MAX_PLAYERS, type RoomInvitePreview } from "../../shared/roomInvite";
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
}: {
  roomCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  playerIds: string[];
  viewerPlayerId: string | null;
}): RoomInvitePreview {
  const reconnectable = viewerPlayerId !== null && playerIds.includes(viewerPlayerId);
  const playerCount = Math.min(playerIds.length, ROOM_INVITE_MAX_PLAYERS);
  let joinable = false;
  let reason: "full" | "in_progress" | "expired" | null = null;

  if (status === "waiting") {
    joinable = reconnectable || playerCount < ROOM_INVITE_MAX_PLAYERS;
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
    maxPlayers: ROOM_INVITE_MAX_PLAYERS,
    settings: {
      totalRounds: settings.totalRounds,
      roundDurationSeconds: settings.roundDurationSeconds,
      mapCount: settings.mapPool.length,
      serverRegion: settings.serverRegion,
    },
  };
}
