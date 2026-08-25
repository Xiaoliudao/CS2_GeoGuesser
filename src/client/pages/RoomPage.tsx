import { useEffect, useMemo } from "react";
import { CLIENT_EVENTS, type ClientEvent } from "../../shared/protocol";
import { navigate } from "../App";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { CopyRoomCodeButton } from "../components/CopyRoomCodeButton";
import { GameResult } from "../components/GameResult";
import { GameScreen } from "../components/GameScreen";
import { InviteRoomButton } from "../components/InviteRoomButton";
import { Lobby } from "../components/Lobby";
import { RoundResult } from "../components/RoundResult";
import { RoundPreparation } from "../components/RoundPreparation";
import { useGameSocket } from "../hooks/useGameSocket";
import { useRoundPreparation } from "../hooks/useRoundPreparation";
import { getNickname, getPlayerId } from "../lib/identity";

export function RoomPage({ roomCode }: { roomCode: string }) {
  const nickname = useMemo(getNickname, []);
  const playerId = useMemo(getPlayerId, []);
  const {
    room,
    connection,
    rttMs,
    serverClockOffsetMs,
    clockSynchronized,
    error,
    clearError,
    send,
  } = useGameSocket(roomCode, playerId, nickname);
  const preparation = useRoundPreparation(room, playerId, send);
  const activePlayerCount = room?.players.filter((player) => player.active).length ?? 0;
  const canInvite = room?.status === "waiting" && activePlayerCount < room.maxPlayers;
  const viewer = room?.players.find((player) => player.id === playerId);
  const viewerIsDnf = Boolean(room && room.status !== "waiting" && viewer?.active === false);

  useEffect(() => {
    if (!nickname) navigate("/");
  }, [nickname]);

  if (!nickname) return null;

  const sendEvent = (event: ClientEvent) => send(event);

  return (
    <main className="room-shell">
      <header className="room-header">
        <button className="wordmark" onClick={() => navigate("/")}>CS2 <span>MG</span></button>
        <div className="room-identity">
          <span>ROOM</span>
          <strong>{roomCode}</strong>
          <CopyRoomCodeButton roomCode={roomCode} />
          {canInvite && <InviteRoomButton roomCode={roomCode} />}
        </div>
        <ConnectionStatus status={connection} rttMs={rttMs} />
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error.message}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}

      {!room && (
        <section className="loading-room">
          <div className="spinner" />
          <h2>JOINING ROOM</h2>
          <p>Establishing a secure game channel…</p>
        </section>
      )}

      {viewerIsDnf && (room?.status === "round_preparing" || room?.status === "playing") && (
        <section className="stage-card dnf-match-panel" aria-live="polite">
          <div className="stage-kicker">ROUND {room.round} · MATCH IN PROGRESS</div>
          <h2>YOU ARE MARKED DNF</h2>
          <p>Your player slot is no longer active. You can view revealed results and the final standings, but you cannot load round assets or submit another guess.</p>
          <div><span>CURRENT SCORE</span><strong>{viewer?.score ?? 0}</strong></div>
          <button className="secondary-button" type="button" onClick={() => navigate("/")}>LEAVE ROOM</button>
        </section>
      )}

      {room?.status === "waiting" && (
        <Lobby
          room={room}
          playerId={playerId}
          onReady={() => sendEvent({ type: CLIENT_EVENTS.READY })}
          onStart={() => sendEvent({ type: CLIENT_EVENTS.START_MATCH })}
        />
      )}
      {room?.status === "round_preparing" && !viewerIsDnf && (
        <RoundPreparation
          room={room}
          playerId={playerId}
          loadState={preparation.loadState}
          errorReason={preparation.errorReason}
          onRetry={preparation.retry}
        />
      )}
      {room?.status === "playing" && !viewerIsDnf && (
        <GameScreen
          room={room}
          playerId={playerId}
          serverClockOffsetMs={serverClockOffsetMs}
          clockSynchronized={clockSynchronized}
          onSend={sendEvent}
        />
      )}
      {room?.status === "round_result" && <RoundResult room={room} playerId={playerId} />}
      {room?.status === "finished" && (
        <GameResult
          room={room}
          playerId={playerId}
          onPlayAgain={() => sendEvent({ type: CLIENT_EVENTS.PLAY_AGAIN })}
          onLeave={() => navigate("/")}
        />
      )}
    </main>
  );
}
