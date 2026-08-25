import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent, ServerEvent } from "../../shared/protocol";
import type { GameErrorCode, GameRoomState } from "../../shared/types";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

interface SocketError {
  code: GameErrorCode;
  message: string;
}

export function useGameSocket(roomCode: string, playerId: string, nickname: string) {
  const [room, setRoom] = useState<GameRoomState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [error, setError] = useState<SocketError | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
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

      const ping = () => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "ping", payload: { sentAt: Date.now() } } satisfies ClientEvent));
      };

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        setConnection("connected");
        setError(null);
        socket.send(
          JSON.stringify({ type: "player:join", payload: { playerId, nickname } } satisfies ClientEvent),
        );
        socket.send(JSON.stringify({ type: "room:sync" } satisfies ClientEvent));
        ping();
        pingTimer = window.setInterval(ping, 15_000);
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
          setRoom(event.payload);
          return;
        }
        if (event.type === "game:end") {
          const nextVersion = event.payload.state.stateVersion;
          if (nextVersion > stateVersionRef.current) {
            stateVersionRef.current = nextVersion;
            setRoom(event.payload.state);
          }
          return;
        }
        if (event.type === "pong") {
          if (event.payload.sentAt !== undefined) setRttMs(Math.max(0, Date.now() - event.payload.sentAt));
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
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close(1000, "Leaving room");
      socketRef.current = null;
    };
  }, [nickname, playerId, roomCode]);

  return { room, connection, rttMs, error, clearError: () => setError(null), send };
}
