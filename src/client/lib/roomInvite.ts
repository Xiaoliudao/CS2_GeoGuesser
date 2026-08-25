import { roomCodeSchema } from "../../shared/schemas";

export function createRoomInviteUrl(origin: string, roomCode: string): string {
  const parsed = roomCodeSchema.safeParse(roomCode);
  if (!parsed.success) throw new Error("INVALID_ROOM_CODE");
  return new URL(`/join/${parsed.data}`, origin).toString();
}

export function roomInviteShareText(roomCode: string): string {
  return `Join my CS2 Map Guesser room! Room: ${roomCode}`;
}
