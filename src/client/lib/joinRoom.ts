import { RoomInvitePreviewSchema, type RoomInviteUnavailableReason } from "../../shared/roomInvite";
import { nicknameSchema, roomCodeSchema } from "../../shared/schemas";
import { getPlayerId, saveNickname } from "./identity";

export type JoinRoomErrorCode =
  | "invalid_nickname"
  | "invalid_room_code"
  | "not_found"
  | RoomInviteUnavailableReason
  | "unavailable";

export type JoinRoomResult =
  | { ok: true; roomCode: string; reconnecting: boolean }
  | { ok: false; code: JoinRoomErrorCode; message: string };

const ERROR_MESSAGES: Record<JoinRoomErrorCode, string> = {
  invalid_nickname: "Nickname must be between 2 and 20 characters.",
  invalid_room_code: "Enter a valid 5-character room code.",
  not_found: "This room may have expired or the invite link is invalid.",
  full: "This room is full.",
  in_progress: "This match has already started.",
  expired: "This room has finished and the invite has expired.",
  kicked: "You were removed from this room by the host.",
  unavailable: "Could not reach the game server. Please try again.",
};

export function joinRoomErrorMessage(code: JoinRoomErrorCode): string {
  return ERROR_MESSAGES[code];
}

export async function joinRoom({ roomCode, nickname }: { roomCode: string; nickname: string }): Promise<JoinRoomResult> {
  const parsedNickname = nicknameSchema.safeParse(nickname);
  if (!parsedNickname.success) {
    return { ok: false, code: "invalid_nickname", message: ERROR_MESSAGES.invalid_nickname };
  }
  const parsedRoomCode = roomCodeSchema.safeParse(roomCode);
  if (!parsedRoomCode.success) {
    return { ok: false, code: "invalid_room_code", message: ERROR_MESSAGES.invalid_room_code };
  }

  saveNickname(parsedNickname.data);
  const playerId = getPlayerId();
  try {
    const response = await fetch(`/api/rooms/${parsedRoomCode.data}/preview`, {
      headers: {
        accept: "application/json",
        "x-cs2-player-id": playerId,
      },
    });
    const body = await response.json().catch(() => null);
    const preview = RoomInvitePreviewSchema.safeParse(body);
    if (response.status === 404 || (preview.success && !preview.data.exists)) {
      return { ok: false, code: "not_found", message: ERROR_MESSAGES.not_found };
    }
    if (!response.ok || !preview.success || !preview.data.exists) {
      return { ok: false, code: "unavailable", message: ERROR_MESSAGES.unavailable };
    }
    if (!preview.data.joinable) {
      const code = preview.data.reason ?? "unavailable";
      return { ok: false, code, message: ERROR_MESSAGES[code] };
    }
    return { ok: true, roomCode: preview.data.roomCode, reconnecting: preview.data.reconnectable };
  } catch {
    return { ok: false, code: "unavailable", message: ERROR_MESSAGES.unavailable };
  }
}
