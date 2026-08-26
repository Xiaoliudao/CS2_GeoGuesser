import type { GameErrorCode, RoomStatus } from "../../shared/types";
import { MAX_MULTIPLAYER_PLAYERS, MIN_MULTIPLAYER_PLAYERS } from "../../shared/multiplayer";
import { normalizeScore } from "./scoring";

export interface GuessValidationInput {
  playerExists: boolean;
  status: string;
  submittedRound: number;
  currentRound: number;
  eventId: string;
  processedEventIds: readonly string[];
  alreadySubmitted: boolean;
  now: number;
  roundEndsAt: number | null;
}

export function validateGuess(input: GuessValidationInput): GameErrorCode | null {
  if (!input.playerExists) return "INVALID_PLAYER";
  if (input.status !== "playing") return "ROUND_EXPIRED";
  if (input.submittedRound !== input.currentRound) return "ROUND_EXPIRED";
  if (input.processedEventIds.includes(input.eventId)) return "ALREADY_SUBMITTED";
  if (input.alreadySubmitted) return "ALREADY_SUBMITTED";
  if (input.roundEndsAt === null || input.now > input.roundEndsAt) return "ROUND_EXPIRED";
  return null;
}

export interface VisibleScoreInput {
  status: RoomStatus;
  playerId: string;
  viewerPlayerId: string | null;
  totalScore: number;
  currentRoundPoints: number;
}

export function scoreVisibleToViewer(input: VisibleScoreInput): number {
  if (input.status !== "playing" || input.playerId === input.viewerPlayerId) return normalizeScore(input.totalScore);
  return normalizeScore(Math.max(0, input.totalScore - input.currentRoundPoints));
}

export function toggledReadyState(currentReady: boolean): boolean {
  return !currentReady;
}

export interface LobbyPlayerState {
  ready: boolean;
  connected?: boolean;
  active?: boolean;
}

export function activeLobbyPlayers<T extends LobbyPlayerState>(players: readonly T[]): T[] {
  return players.filter((player) => player.active !== false);
}

export function allLobbyPlayersReady(players: readonly LobbyPlayerState[]): boolean {
  const activePlayers = activeLobbyPlayers(players);
  return activePlayers.length >= MIN_MULTIPLAYER_PLAYERS
    && activePlayers.length <= MAX_MULTIPLAYER_PLAYERS
    && activePlayers.every((player) => player.ready && player.connected !== false);
}

export function validateMatchStart({
  status,
  requestingPlayerId,
  hostPlayerId,
  players,
}: {
  status: RoomStatus;
  requestingPlayerId: string;
  hostPlayerId: string | null;
  players: readonly LobbyPlayerState[];
}): GameErrorCode | null {
  if (status !== "waiting") return "GAME_ALREADY_STARTED";
  if (requestingPlayerId !== hostPlayerId) return "NOT_HOST";
  const activePlayers = activeLobbyPlayers(players);
  if (
    activePlayers.length < MIN_MULTIPLAYER_PLAYERS
    || activePlayers.length > MAX_MULTIPLAYER_PLAYERS
  ) return "NOT_ENOUGH_PLAYERS";
  if (!allLobbyPlayersReady(activePlayers)) return "PLAYERS_NOT_READY";
  return null;
}

export interface KickablePlayerState {
  id: string;
  active: boolean;
}

export function validatePlayerKick({
  status,
  requestingPlayerId,
  hostPlayerId,
  players,
  targetPlayerId,
}: {
  status: RoomStatus;
  requestingPlayerId: string;
  hostPlayerId: string | null;
  players: readonly KickablePlayerState[];
  targetPlayerId: string;
}): GameErrorCode | null {
  const requester = players.find((player) => player.id === requestingPlayerId);
  if (!requester?.active) return "INVALID_PLAYER";
  if (requestingPlayerId !== hostPlayerId) return "NOT_HOST";
  if (targetPlayerId === hostPlayerId) return "CANNOT_KICK_HOST";
  if (status === "finished") return "KICK_NOT_ALLOWED";
  const target = players.find((player) => player.id === targetPlayerId);
  if (!target?.active) return "PLAYER_NOT_FOUND";
  return null;
}

export function lowestAvailableSlotIndex(
  players: readonly { slotIndex: number }[],
  maxPlayers = MAX_MULTIPLAYER_PLAYERS,
): number | null {
  const occupied = new Set(
    players
      .map((player) => player.slotIndex)
      .filter((slotIndex) => Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < maxPlayers),
  );
  for (let slotIndex = 0; slotIndex < maxPlayers; slotIndex += 1) {
    if (!occupied.has(slotIndex)) return slotIndex;
  }
  return null;
}

export function selectHostPlayerId<T extends {
  id: string;
  joinedAt: number;
  slotIndex: number;
  active?: boolean;
}>(players: readonly T[]): string | null {
  const candidates = players
    .filter((player) => player.active !== false)
    .slice()
    .sort((left, right) => left.joinedAt - right.joinedAt
      || left.slotIndex - right.slotIndex
      || left.id.localeCompare(right.id));
  return candidates[0]?.id ?? null;
}

export interface DepartablePlayer {
  id: string;
  joinedAt: number;
  slotIndex: number;
  active: boolean;
  connected: boolean;
  ready: boolean;
  disconnectExpiresAt: number | null;
}

export interface PlayerDepartureInput<T extends DepartablePlayer> {
  status: RoomStatus;
  players: readonly T[];
  hostPlayerId: string | null;
  inactivePlayerIds: readonly string[];
  playerId: string;
}

export interface PlayerDepartureResult<T extends DepartablePlayer> {
  players: T[];
  hostPlayerId: string | null;
  inactivePlayerIds: string[];
  changed: boolean;
}

function samePlayerIdOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((playerId, index) => playerId === right[index]);
}

export function applyPlayerDeparture<T extends DepartablePlayer>({
  status,
  players,
  hostPlayerId,
  inactivePlayerIds,
  playerId,
}: PlayerDepartureInput<T>): PlayerDepartureResult<T> {
  const departingPlayer = players.find((player) => player.id === playerId);
  if (!departingPlayer) {
    return {
      players: [...players],
      hostPlayerId,
      inactivePlayerIds: [...inactivePlayerIds],
      changed: false,
    };
  }

  if (status === "waiting") {
    const nextPlayers = players.filter((player) => player.id !== playerId);
    const nextInactivePlayerIds = Array.from(new Set(inactivePlayerIds.filter((id) => id !== playerId)));
    const hostRemainsActive = nextPlayers.some((player) => player.id === hostPlayerId && player.active);
    return {
      players: nextPlayers,
      hostPlayerId: hostRemainsActive ? hostPlayerId : selectHostPlayerId(nextPlayers),
      inactivePlayerIds: nextInactivePlayerIds,
      changed: true,
    };
  }

  const playerAlreadyInactive = !departingPlayer.active
    && !departingPlayer.connected
    && !departingPlayer.ready
    && departingPlayer.disconnectExpiresAt === null;
  const nextPlayers = playerAlreadyInactive
    ? [...players]
    : players.map((player) => player.id === playerId
      ? {
          ...player,
          active: false,
          connected: false,
          ready: false,
          disconnectExpiresAt: null,
        }
      : player);
  const nextInactivePlayerIds = Array.from(new Set([...inactivePlayerIds, playerId]));
  const hostRemainsActive = nextPlayers.some((player) => player.id === hostPlayerId && player.active);
  const nextHostPlayerId = hostRemainsActive ? hostPlayerId : selectHostPlayerId(nextPlayers);
  const inactivePlayerIdsChanged = !samePlayerIdOrder(inactivePlayerIds, nextInactivePlayerIds);

  return {
    players: nextPlayers,
    hostPlayerId: nextHostPlayerId,
    inactivePlayerIds: nextInactivePlayerIds,
    changed: !playerAlreadyInactive || inactivePlayerIdsChanged || nextHostPlayerId !== hostPlayerId,
  };
}

export function shouldFinishMatchAfterDeparture(status: RoomStatus, activePlayerCount: number): boolean {
  const matchIsLive = status === "round_preparing" || status === "playing" || status === "round_result";
  return matchIsLive && activePlayerCount < MIN_MULTIPLAYER_PLAYERS;
}

export function activeMatchPlayerIds(
  matchPlayerIds: readonly string[],
  inactivePlayerIds: readonly string[],
): string[] {
  const inactive = new Set(inactivePlayerIds);
  return matchPlayerIds.filter((playerId) => !inactive.has(playerId));
}

export function allActivePlayersSubmitted(
  activePlayerIds: readonly string[],
  submissions: Readonly<Record<string, unknown>>,
): boolean {
  return activePlayerIds.every((playerId) => Boolean(submissions[playerId]));
}

export function activeStateAfterReconnect(status: RoomStatus, wasActive: boolean): boolean {
  return status === "waiting" ? true : wasActive;
}

export function expiredPlayerDisposition(status: RoomStatus): "remove" | "inactive" {
  return status === "waiting" ? "remove" : "inactive";
}

export function canReceiveRoomBroadcast(
  roomPlayerIds: readonly string[],
  attachmentPlayerId: string | null,
): boolean {
  return attachmentPlayerId !== null && roomPlayerIds.includes(attachmentPlayerId);
}

export function shouldRetainForRematch(
  player: { connected: boolean; disconnectExpiresAt: number | null },
  now: number,
): boolean {
  return player.connected || (player.disconnectExpiresAt !== null && player.disconnectExpiresAt > now);
}
