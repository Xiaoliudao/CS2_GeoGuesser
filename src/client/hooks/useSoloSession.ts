import { useCallback, useEffect, useRef, useState } from "react";
import type { MapId, RadarLayerId } from "../../shared/maps";
import type { SoloSessionState, SoloSettings } from "../../shared/solo";
import type { MapPoint } from "../../shared/types";
import { ServerClockEstimator } from "../lib/serverClock";
import {
  clearStoredSoloSessionId,
  getStoredSoloSessionId,
  storeSoloSessionId,
} from "../lib/soloSessionStorage";

export type SoloActionName = "start" | "ready" | "hint" | "guess" | "next" | "play-again";

export interface SoloClientError {
  code: string;
  message: string;
}

class SoloRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SoloRequestError";
  }
}

function isSoloState(value: unknown): value is SoloSessionState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SoloSessionState>;
  return typeof candidate.sessionId === "string"
    && typeof candidate.generation === "number"
    && typeof candidate.serverNow === "number"
    && ["round_preparing", "playing", "round_result", "finished"].includes(String(candidate.status));
}

function errorMessage(code: string, fallback?: string): string {
  const messages: Record<string, string> = {
    SOLO_SESSION_NOT_FOUND: "This single-player session has expired. Start a new run.",
    INVALID_SOLO_SETTINGS: "Review the round count, timer, and map pool.",
    NOT_ENOUGH_QUESTIONS: "There are not enough enabled questions for these settings.",
    QUESTION_DATABASE_UNAVAILABLE: "The question bank is temporarily unavailable.",
    INVALID_ASSET_REPORT: "The loaded question no longer matches this round.",
    INVALID_SOLO_STATE: "That action is not available in the current round.",
    STALE_SESSION_GENERATION: "This single-player run has already been replaced.",
    STALE_ROUND: "This round has already advanced.",
    HINT_ALREADY_USED: "The map hint has already been used for this round.",
    ALREADY_SUBMITTED: "This round has already been submitted.",
    ROUND_EXPIRED: "The round timer has expired.",
  };
  return fallback || messages[code] || "The single-player session could not be updated.";
}

export function useSoloSession() {
  const [state, setState] = useState<SoloSessionState | null>(null);
  const [restoring, setRestoring] = useState(() => getStoredSoloSessionId() !== null);
  const [busyAction, setBusyAction] = useState<SoloActionName | null>(null);
  const [error, setError] = useState<SoloClientError | null>(null);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [clockSynchronized, setClockSynchronized] = useState(false);
  const stateRef = useRef<SoloSessionState | null>(null);
  const clockEstimatorRef = useRef(new ServerClockEstimator());

  const applyState = useCallback((next: SoloSessionState, clientSentAt: number, clientReceivedAt: number) => {
    const estimate = clockEstimatorRef.current.addSample(clientSentAt, next.serverNow, clientReceivedAt);
    if (estimate) {
      setServerClockOffsetMs(estimate.synchronizedOffsetMs);
      setClockSynchronized(true);
    }
    stateRef.current = next;
    setState(next);
    storeSoloSessionId(next.sessionId);
    setError(null);
    return next;
  }, []);

  const requestState = useCallback(async (url: string, init?: RequestInit): Promise<SoloSessionState> => {
    const clientSentAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new SoloRequestError("NETWORK", "Could not reach the single-player session. Check your connection and retry.");
    }
    const clientReceivedAt = Date.now();
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const details = payload && typeof payload === "object" ? payload as { error?: string; message?: string } : null;
      const code = details?.error || (response.status === 404 ? "SOLO_SESSION_NOT_FOUND" : "SOLO_REQUEST_FAILED");
      throw new SoloRequestError(code, errorMessage(code, details?.message));
    }
    if (!isSoloState(payload)) throw new SoloRequestError("INVALID_RESPONSE", "The server returned an invalid single-player state.");
    return applyState(payload, clientSentAt, clientReceivedAt);
  }, [applyState]);

  const runAction = useCallback(async (
    action: SoloActionName,
    url: string,
    body?: unknown,
  ): Promise<SoloSessionState | null> => {
    setBusyAction(action);
    setError(null);
    try {
      return await requestState(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    } catch (requestError) {
      const nextError = requestError instanceof SoloRequestError
        ? { code: requestError.code, message: requestError.message }
        : { code: "UNKNOWN", message: "The single-player action failed." };
      setError(nextError);
      if (nextError.code === "SOLO_SESSION_NOT_FOUND") {
        clearStoredSoloSessionId();
        stateRef.current = null;
        setState(null);
      }
      return null;
    } finally {
      setBusyAction(null);
    }
  }, [requestState]);

  const refresh = useCallback(async (): Promise<SoloSessionState | null> => {
    const sessionId = stateRef.current?.sessionId ?? getStoredSoloSessionId();
    if (!sessionId) return null;
    try {
      return await requestState(`/api/solo/${sessionId}`);
    } catch (requestError) {
      const nextError = requestError instanceof SoloRequestError
        ? { code: requestError.code, message: requestError.message }
        : { code: "UNKNOWN", message: "Could not restore the single-player session." };
      setError(nextError);
      if (nextError.code === "SOLO_SESSION_NOT_FOUND") {
        clearStoredSoloSessionId();
        stateRef.current = null;
        setState(null);
      }
      return null;
    }
  }, [requestState]);

  useEffect(() => {
    const sessionId = getStoredSoloSessionId();
    if (!sessionId) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    void refresh().finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    if (!state) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh, state?.sessionId]);

  const start = useCallback(async (nickname: string, settings: SoloSettings) => {
    clockEstimatorRef.current.reset();
    setClockSynchronized(false);
    setServerClockOffsetMs(0);
    return runAction("start", "/api/solo", { nickname, settings });
  }, [runAction]);

  const ready = useCallback((round: number, questionId: string, loadMs: number) => {
    const current = stateRef.current;
    if (!current) return Promise.resolve(null);
    return runAction("ready", `/api/solo/${current.sessionId}/ready`, {
      generation: current.generation,
      round,
      questionId,
      loadMs,
    });
  }, [runAction]);

  const requestHint = useCallback((round: number) => {
    const current = stateRef.current;
    if (!current) return Promise.resolve(null);
    return runAction("hint", `/api/solo/${current.sessionId}/hint`, { generation: current.generation, round });
  }, [runAction]);

  const submitGuess = useCallback((guess: {
    round: number;
    mapId: MapId;
    layerId: RadarLayerId;
    point: MapPoint;
  }) => {
    const current = stateRef.current;
    if (!current) return Promise.resolve(null);
    return runAction("guess", `/api/solo/${current.sessionId}/guess`, {
      ...guess,
      generation: current.generation,
      eventId: crypto.randomUUID(),
    });
  }, [runAction]);

  const nextRound = useCallback((round: number) => {
    const current = stateRef.current;
    if (!current) return Promise.resolve(null);
    return runAction("next", `/api/solo/${current.sessionId}/next`, { generation: current.generation, round });
  }, [runAction]);

  const playAgain = useCallback(() => {
    const current = stateRef.current;
    if (!current) return Promise.resolve(null);
    return runAction("play-again", `/api/solo/${current.sessionId}/play-again`, {
      generation: current.generation,
      round: current.round,
    });
  }, [runAction]);

  const discard = useCallback(() => {
    clearStoredSoloSessionId();
    stateRef.current = null;
    setState(null);
    setError(null);
    setBusyAction(null);
    clockEstimatorRef.current.reset();
    setClockSynchronized(false);
    setServerClockOffsetMs(0);
  }, []);

  return {
    state,
    restoring,
    busyAction,
    error,
    serverClockOffsetMs,
    clockSynchronized,
    start,
    ready,
    requestHint,
    submitGuess,
    nextRound,
    playAgain,
    refresh,
    discard,
    clearError: () => setError(null),
  };
}
