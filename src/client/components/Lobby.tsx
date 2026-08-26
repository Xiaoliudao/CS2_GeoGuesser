import type { GameRoomState } from "../../shared/types";
import type { GameErrorCode } from "../../shared/types";
import { MIN_MULTIPLAYER_PLAYERS } from "../../shared/multiplayer";
import type { RoomSettingsUpdate } from "../../shared/roomSettings";
import { InviteRoomButton } from "./InviteRoomButton";
import { HostKickButton } from "./HostKickButton";
import { WaitingRoomSettings } from "./WaitingRoomSettings";

const NOOP = () => undefined;
const REJECT_SETTINGS_UPDATE = () => false;

export function Lobby({
  room,
  playerId,
  onReady,
  onStart,
  onKick,
  kickingPlayerId,
  onUpdateSettings,
  settingsError,
  onClearSettingsError,
}: {
  room: GameRoomState;
  playerId: string;
  onReady: () => void;
  onStart: () => void;
  onKick?: (playerId: string) => void;
  kickingPlayerId?: string | null;
  onUpdateSettings?: (settings: RoomSettingsUpdate) => boolean;
  settingsError?: { code: GameErrorCode; message: string } | null;
  onClearSettingsError?: () => void;
}) {
  const me = room.players.find((player) => player.id === playerId);
  const activePlayers = room.players
    .filter((player) => player.active)
    .sort((left, right) => left.slotIndex - right.slotIndex);
  const playersBySlot = new Map(activePlayers.map((player) => [player.slotIndex, player]));
  const isHost = room.hostPlayerId === playerId;
  const enoughPlayers = activePlayers.length >= MIN_MULTIPLAYER_PLAYERS;
  const allPlayersReady = enoughPlayers
    && activePlayers.every((player) => player.ready && player.connected);
  const questionsReady = room.questionCount >= room.settings.totalRounds;
  const canStart = isHost && allPlayersReady && questionsReady;
  const openSlots = Math.max(0, room.maxPlayers - activePlayers.length);
  const unreadyCount = activePlayers.filter((player) => !player.ready || !player.connected).length;

  const waitingMessage = !enoughPlayers
    ? "WAITING FOR AT LEAST ONE MORE PLAYER…"
    : !allPlayersReady
      ? `WAITING FOR ${unreadyCount} PLAYER${unreadyCount === 1 ? "" : "S"} TO READY UP…`
      : isHost
        ? "ALL PLAYERS READY · START THE MATCH WHEN READY"
        : "ALL PLAYERS READY · WAITING FOR THE HOST TO START…";

  return (
    <section className="stage-card lobby-card">
      <div className="stage-kicker">PRE-MATCH</div>
      <h2>WAITING ROOM</h2>
      <p>{activePlayers.length} / {room.maxPlayers} players · {room.settings.totalRounds} locations · One winner.</p>
      <WaitingRoomSettings
        room={room}
        playerId={playerId}
        socketError={settingsError ?? null}
        onClearSocketError={onClearSettingsError ?? NOOP}
        onApply={onUpdateSettings ?? REJECT_SETTINGS_UPDATE}
      />
      <div className="lobby-slots" aria-label="Room players">
        {Array.from({ length: room.maxPlayers }, (_, slot) => {
          const player = playersBySlot.get(slot);
          return player ? (
            <div className={`lobby-player player-slot-${slot + 1}`} key={player.id}>
              <div className="avatar">{player.nickname.slice(0, 1).toUpperCase()}</div>
              <div className="lobby-player-identity">
                <div>
                  <span className="player-seat">P{slot + 1}</span>
                  <strong>{player.nickname}</strong>
                  {player.id === room.hostPlayerId && <small>HOST</small>}
                  {player.id === playerId && <small>YOU</small>}
                </div>
                <span>{player.connected ? "ONLINE" : "RECONNECTING"}</span>
              </div>
              <div className="lobby-player-actions">
                <b className={player.ready ? "ready" : "not-ready"}>
                  {player.ready ? "READY ✓" : "NOT READY"}
                </b>
                {onKick && (
                  <HostKickButton
                    viewerPlayerId={playerId}
                    hostPlayerId={room.hostPlayerId}
                    target={player}
                    status={room.status}
                    isKicking={kickingPlayerId === player.id}
                    onKick={onKick}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="lobby-player empty" key={slot}>
              <div className="avatar">?</div>
              <div><strong>P{slot + 1} · OPEN SLOT</strong><span>WAITING FOR A PLAYER</span></div>
            </div>
          );
        })}
      </div>
      {openSlots > 0 && (
        <div className="lobby-invite-row">
          <span>{openSlots} OPEN SLOT{openSlots === 1 ? "" : "S"}</span>
          <InviteRoomButton roomCode={room.roomCode} compact />
        </div>
      )}
      {room.questionCount === 0 && (
        <div className="content-empty-state"><strong>NO REAL QUESTIONS AVAILABLE</strong><span>Import a real CS2 question first.</span></div>
      )}
      {room.questionCount > 0 && room.questionCount < room.settings.totalRounds && (
        <div className="content-empty-state">
          <strong>NOT ENOUGH QUESTIONS</strong>
          <span>Only {room.questionCount} questions remain for the selected maps and difficulties; this match requires {room.settings.totalRounds}.</span>
        </div>
      )}
      {room.questionCount >= room.settings.totalRounds && (
        <div className="content-available-state">
          <strong>{room.questionCount} REAL QUESTION{room.questionCount === 1 ? "" : "S"} AVAILABLE</strong>
          <span>This match requires {room.settings.totalRounds} verified round{room.settings.totalRounds === 1 ? "" : "s"} from the selected maps and difficulties.</span>
        </div>
      )}
      <div className={`lobby-actions ${isHost ? "has-start" : ""}`}>
        <button
          className="primary-button ready-button"
          type="button"
          aria-pressed={Boolean(me?.ready)}
          disabled={!me || !me.active}
          onClick={onReady}
        >
          {me?.ready ? "CANCEL READY" : "READY UP"}
        </button>
        {isHost && (
          <button
            className="secondary-button start-match-button"
            type="button"
            disabled={!canStart}
            onClick={onStart}
          >
            START MATCH
          </button>
        )}
      </div>
      <small className="waiting-note">{waitingMessage}</small>
    </section>
  );
}
