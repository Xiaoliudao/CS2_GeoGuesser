import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLIENT_EVENTS, type ClientEvent } from "../../shared/protocol";
import { navigate, registerNavigationBlocker, type NavigationAttempt } from "../App";
import { ConfirmLeaveDialog, type ConfirmLeaveMode } from "../components/ConfirmLeaveDialog";
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
    leaveRoom,
    leaveConfirmed,
  } = useGameSocket(roomCode, playerId, nickname);
  const [leaveMode, setLeaveMode] = useState<ConfirmLeaveMode | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const roomRef = useRef(room);
  const leaveModeRef = useRef<ConfirmLeaveMode | null>(null);
  const isLeavingRef = useRef(false);
  const hasNavigatedAfterLeaveRef = useRef(false);
  const pendingNavigationRef = useRef<NavigationAttempt>({ path: "/", source: "push" });
  roomRef.current = room;
  const preparation = useRoundPreparation(room, playerId, send);
  const activePlayerCount = room?.players.filter((player) => player.active).length ?? 0;
  const canInvite = room?.status === "waiting" && activePlayerCount < room.maxPlayers;
  const viewer = room?.players.find((player) => player.id === playerId);
  const viewerIsDnf = Boolean(room && room.status !== "waiting" && viewer?.active === false);

  useEffect(() => {
    if (!nickname) navigate("/");
  }, [nickname]);

  const completeLeaveNavigation = useCallback(() => {
    if (hasNavigatedAfterLeaveRef.current) return;
    hasNavigatedAfterLeaveRef.current = true;
    const navigation = pendingNavigationRef.current;
    leaveModeRef.current = null;
    setLeaveMode(null);
    navigate(navigation.path, {
      bypassBlocker: true,
      replace: navigation.source === "pop",
    });
  }, []);

  const performLeave = useCallback(async (): Promise<void> => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    setIsLeaving(true);
    setLeaveError(null);
    try {
      await leaveRoom();
      completeLeaveNavigation();
    } catch (leaveFailure) {
      const message = leaveFailure instanceof Error
        ? leaveFailure.message
        : "The room could not be left. Please try again.";
      isLeavingRef.current = false;
      setIsLeaving(false);
      setLeaveError(message);
      throw leaveFailure;
    }
  }, [completeLeaveNavigation, leaveRoom]);

  useEffect(() => {
    if (leaveConfirmed) completeLeaveNavigation();
  }, [completeLeaveNavigation, leaveConfirmed]);

  const requestLeave = useCallback((navigation: NavigationAttempt = { path: "/", source: "push" }) => {
    if (isLeavingRef.current || leaveModeRef.current) return;
    pendingNavigationRef.current = navigation;
    setLeaveError(null);
    const currentRoom = roomRef.current;
    if (!currentRoom) {
      navigate(navigation.path, {
        bypassBlocker: true,
        replace: navigation.source === "pop",
      });
      return;
    }

    const fullyCompleted = currentRoom.status === "finished"
      && currentRoom.failureCode === null
      && currentRoom.round >= currentRoom.settings.totalRounds;
    if (fullyCompleted) {
      void leaveRoom().catch(() => undefined);
      completeLeaveNavigation();
      return;
    }

    const mode: ConfirmLeaveMode = currentRoom.status === "waiting" ? "room" : "match";
    leaveModeRef.current = mode;
    setLeaveMode(mode);
  }, [completeLeaveNavigation, leaveRoom]);

  const cancelLeave = useCallback(() => {
    if (isLeavingRef.current) return;
    leaveModeRef.current = null;
    pendingNavigationRef.current = { path: "/", source: "push" };
    setLeaveMode(null);
    setLeaveError(null);
  }, []);

  useEffect(() => registerNavigationBlocker((navigation) => {
    const targetPath = new URL(navigation.path, window.location.href).pathname;
    if (targetPath.toUpperCase() === `/ROOM/${roomCode}`) return false;
    if (!roomRef.current) return false;
    requestLeave(navigation);
    return true;
  }), [requestLeave, roomCode]);

  if (!nickname) return null;

  const sendEvent = (event: ClientEvent) => send(event);
  const fullyCompleted = room?.status === "finished"
    && room.failureCode === null
    && room.round >= room.settings.totalRounds;
  const leaveActionLabel = isLeaving
    ? "LEAVING…"
    : room?.status === "waiting"
      ? "LEAVE ROOM"
      : fullyCompleted
        ? "BACK TO HOME"
        : "LEAVE MATCH";

  return (
    <main className="room-shell">
      <header className="room-header">
        <button className="wordmark" type="button" disabled={isLeaving} onClick={() => requestLeave()}>CS2 <span>MG</span></button>
        <div className="room-identity">
          <span>ROOM</span>
          <strong>{roomCode}</strong>
          <CopyRoomCodeButton roomCode={roomCode} />
          {canInvite && <InviteRoomButton roomCode={roomCode} />}
        </div>
        <div className="room-header-actions">
          <ConnectionStatus status={connection} rttMs={rttMs} />
          {room && (
            <button
              className="multiplayer-leave-button"
              type="button"
              disabled={isLeaving}
              onClick={() => requestLeave()}
            >
              {leaveActionLabel}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error.message}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}

      {leaveError && !leaveMode && (
        <div className="error-banner" role="alert">
          <span>{leaveError}</span>
          <button type="button" aria-label="Dismiss leave error" onClick={() => setLeaveError(null)}>×</button>
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
          <button className="secondary-button" type="button" onClick={() => requestLeave()}>LEAVE MATCH</button>
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
          onLeave={() => requestLeave()}
          isLeaving={isLeaving}
        />
      )}
      <ConfirmLeaveDialog
        open={leaveMode !== null}
        mode={leaveMode ?? "room"}
        isLeaving={isLeaving}
        errorMessage={leaveError}
        onCancel={cancelLeave}
        onConfirm={performLeave}
      />
    </main>
  );
}
