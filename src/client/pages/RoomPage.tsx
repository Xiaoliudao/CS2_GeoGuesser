import { useEffect, useMemo } from "react";
import type { ClientEvent } from "../../shared/protocol";
import { navigate } from "../App";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { GameResult } from "../components/GameResult";
import { GameScreen } from "../components/GameScreen";
import { Lobby } from "../components/Lobby";
import { RoundResult } from "../components/RoundResult";
import { useGameSocket } from "../hooks/useGameSocket";
import { getNickname, getPlayerId } from "../lib/identity";

export function RoomPage({ roomCode }: { roomCode: string }) {
  const nickname = useMemo(getNickname, []);
  const playerId = useMemo(getPlayerId, []);
  const { room, connection, error, clearError, send } = useGameSocket(roomCode, playerId, nickname);

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
          <button
            className="copy-button"
            title="Copy room code"
            onClick={() => void navigator.clipboard.writeText(roomCode)}
          >
            COPY
          </button>
        </div>
        <ConnectionStatus status={connection} />
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

      {room?.status === "waiting" && (
        <Lobby room={room} playerId={playerId} onReady={() => sendEvent({ type: "player:ready" })} />
      )}
      {room?.status === "playing" && (
        <GameScreen room={room} playerId={playerId} onSend={sendEvent} />
      )}
      {room?.status === "round_result" && <RoundResult room={room} playerId={playerId} />}
      {room?.status === "finished" && (
        <GameResult
          room={room}
          playerId={playerId}
          onPlayAgain={() => sendEvent({ type: "game:play-again" })}
          onLeave={() => navigate("/")}
        />
      )}
    </main>
  );
}
