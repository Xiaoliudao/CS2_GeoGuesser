import { useEffect, useState } from "react";
import type { RoomStatus } from "../../shared/types";
import { estimatedServerNow } from "../lib/serverClock";

export interface CountdownBaseline {
  serverNowAtBaseline: number;
  monotonicAtBaseline: number;
}

export function createCountdownBaseline(
  clientNow: number,
  serverClockOffsetMs: number,
  monotonicNow: number,
): CountdownBaseline {
  return {
    serverNowAtBaseline: estimatedServerNow(clientNow, serverClockOffsetMs),
    monotonicAtBaseline: monotonicNow,
  };
}

export function remainingFromBaseline(
  roundEndsAt: number,
  baseline: CountdownBaseline,
  monotonicNow: number,
): number {
  const estimatedNow = baseline.serverNowAtBaseline + Math.max(0, monotonicNow - baseline.monotonicAtBaseline);
  return Math.max(0, roundEndsAt - estimatedNow);
}

interface CountdownState {
  roundEndsAt: number;
  remainingMs: number;
}

export function useAuthoritativeCountdown({
  status,
  roundEndsAt,
  serverClockOffsetMs,
  clockSynchronized,
}: {
  status: RoomStatus;
  roundEndsAt: number | null;
  serverClockOffsetMs: number;
  clockSynchronized: boolean;
}): number | null {
  const [countdown, setCountdown] = useState<CountdownState | null>(null);
  const active = status === "playing" && roundEndsAt !== null && clockSynchronized;

  useEffect(() => {
    if (!active || roundEndsAt === null) {
      setCountdown(null);
      return;
    }

    let baseline = createCountdownBaseline(Date.now(), serverClockOffsetMs, performance.now());
    const update = () => {
      setCountdown({
        roundEndsAt,
        remainingMs: remainingFromBaseline(roundEndsAt, baseline, performance.now()),
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      baseline = createCountdownBaseline(Date.now(), serverClockOffsetMs, performance.now());
      update();
    };

    update();
    const timer = window.setInterval(update, 100);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active, roundEndsAt, serverClockOffsetMs]);

  if (
    !active
    || roundEndsAt === null
    || countdown?.roundEndsAt !== roundEndsAt
  ) return null;
  return countdown.remainingMs;
}
