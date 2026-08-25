import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent, ServerEvent } from "../../shared/protocol";
import type { GameErrorCode, GameRoomState } from "../../shared/types";
import { estimatedServerNow, ServerClockEstimator } from "../lib/serverClock";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

interface SocketError {
  code: GameErrorCode;
  message: string;
}

export function useGameSocket(roomCode: string, playerId: string, nickname: string) {
  const [room, setRoom] = useState<GameRoomState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [clockSynchronized, setClockSynchronized] = useState(false);
  const [error, setError] = useState<SocketError | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<GameRoomState | null>(null);
  const clockEstimatorRef = useRef(new ServerClockEstimator());
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const stateVersionRef = useRef(0);
  const stoppedRef = useRef(false);

  const send = useCallback((event: ClientEvent): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError({ code: "WEBSOCKET_DISCONNECTED", message: "Connection lost. Reconnecting…" });
      return false;
    }
    socket.send(JSON.stringify(event));
    return true;
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    stateVersionRef.current = 0;
    reconnectAttemptRef.current = 0;
    roomRef.current = null;
    setRoom(null);
    clockEstimatorRef.current.reset();
    setServerClockOffsetMs(0);
    setClockSynchronized(false);

    const sendClockPing = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: "ping",
        payload: { clientSentAt: Date.now() },
      } satisfies ClientEvent));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") sendClockPing();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const connect = async () => {
      if (stoppedRef.current) return;
      setConnection(reconnectAttemptRef.current === 0 ? "connecting" : "reconnecting");
      try {
        const roomResponse = await fetch(`/api/rooms/${roomCode}`);
        if (roomResponse.status === 404) {
          stoppedRef.current = true;
          setConnection("disconnected");
          setError({ code: "ROOM_NOT_FOUND", message: "This room does not exist." });
          return;
        }
      } catch {
        // A WebSocket attempt below provides the normal reconnect behavior.
      }
      if (stoppedRef.current) return;
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${window.location.host}/ws/${roomCode}`);
      socketRef.current = socket;
      let pingTimer: number | null = null;

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        setConnection("connected");
        setError(null);
        socket.send(
          JSON.stringify({ type: "player:join", payload: { playerId, nickname } } satisfies ClientEvent),
        );
        socket.send(JSON.stringify({ type: "room:sync" } satisfies ClientEvent));
        sendClockPing();
        pingTimer = window.setInterval(sendClockPing, 15_000);
      });

      socket.addEventListener("message", (message) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(String(message.data)) as ServerEvent;
        } catch {
          setError({ code: "INVALID_MESSAGE", message: "Received an invalid server message." });
          return;
        }

        if (event.type === "room:state") {
          const nextVersion = event.payload.stateVersion;
          if (nextVersion <= stateVersionRef.current) return;
          if (stateVersionRef.current > 0 && nextVersion > stateVersionRef.current + 1) {
            socket.send(JSON.stringify({ type: "room:sync" } satisfies ClientEvent));
          }
          stateVersionRef.current = nextVersion;
          roomRef.current = event.payload;
          setRoom(event.payload);
          return;
        }
        if (event.type === "round:start") {
          if (event.payload.stateVersion < stateVersionRef.current) return;
          stateVersionRef.current = Math.max(stateVersionRef.current, event.payload.stateVersion);
          setRoom((current) => {
            if (!current) {
              socket.send(JSON.stringify({ type: "room:sync" } satisfies ClientEvent));
              return current;
            }
            const next: GameRoomState = {
              ...current,
              status: "playing",
              round: event.payload.round,
              currentQuestion: {
                questionId: event.payload.questionId,
                imageUrl: event.payload.imageUrl,
              },
              prepareDeadline: null,
              roundStartedAt: event.payload.roundStartedAt,
              roundEndsAt: event.payload.roundEndsAt,
              stateVersion: event.payload.stateVersion,
              serverNow: event.payload.serverNow,
            };
            roomRef.current = next;
            return next;
          });
          return;
        }
        if (event.type === "game:end") {
          const nextVersion = event.payload.state.stateVersion;
          if (nextVersion > stateVersionRef.current) {
            stateVersionRef.current = nextVersion;
            roomRef.current = event.payload.state;
            setRoom(event.payload.state);
          }
          return;
        }
        if (event.type === "pong") {
          const clientReceivedAt = Date.now();
          const estimate = clockEstimatorRef.current.addSample(
            event.payload.clientSentAt,
            event.payload.serverNow,
            clientReceivedAt,
          );
          if (!estimate) return;
          setRttMs(Math.round(estimate.rttMs));
          setServerClockOffsetMs(estimate.synchronizedOffsetMs);
          setClockSynchronized(true);
          if (import.meta.env.DEV) {
            const currentRoom = roomRef.current;
            console.info(JSON.stringify({
              event: "ROUND_TIMER_SYNC",
              rttMs: Math.round(estimate.rttMs),
              offsetMs: Math.round(estimate.synchronizedOffsetMs),
              roundStartedAt: currentRoom?.roundStartedAt ?? null,
              roundEndsAt: currentRoom?.roundEndsAt ?? null,
              calculatedRemainingMs: currentRoom?.roundEndsAt === null || currentRoom?.roundEndsAt === undefined
                ? null
                : Math.max(0, Math.round(currentRoom.roundEndsAt - estimatedServerNow(clientReceivedAt, estimate.synchronizedOffsetMs))),
            }));
          }
          return;
        }
        if (event.type === "error") setError(event.payload);
      });

      socket.addEventListener("close", (closeEvent) => {
        if (pingTimer !== null) window.clearInterval(pingTimer);
        if (socketRef.current === socket) socketRef.current = null;
        if (stoppedRef.current) return;
        if (closeEvent.code === 4002 || closeEvent.code === 4003) {
          setConnection("disconnected");
          return;
        }
        reconnectAttemptRef.current += 1;
        const baseDelay = Math.min(10_000, 1_000 * 2 ** (reconnectAttemptRef.current - 1));
        const delay = Math.round(baseDelay * (0.85 + Math.random() * 0.3));
        setRttMs(null);
        console.info(JSON.stringify({ event: "WEBSOCKET_RECONNECT", attempt: reconnectAttemptRef.current, delayMs: delay }));
        setConnection("reconnecting");
        reconnectTimerRef.current = window.setTimeout(() => void connect(), delay);
      });

      socket.addEventListener("error", () => {
        setConnection("reconnecting");
      });
    };

    void connect();
    return () => {
      stoppedRef.current = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close(1000, "Leaving room");
      socketRef.current = null;
    };
  }, [nickname, playerId, roomCode]);

  return {
    room,
    connection,
    rttMs,
    serverClockOffsetMs,
    clockSynchronized,
    error,
    clearError: () => setError(null),
    send,
  };
}
