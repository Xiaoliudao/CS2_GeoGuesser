import type { ConnectionState } from "../hooks/useGameSocket";

export function ConnectionStatus({ status, rttMs }: { status: ConnectionState; rttMs: number | null }) {
  const connected = status === "connected";
  const quality = rttMs === null ? "" : rttMs < 150 ? "GOOD" : rttMs < 350 ? "HIGH LATENCY" : "UNSTABLE";
  return (
    <div className={`connection-status ${connected ? "is-connected" : ""}`}>
      <i />
      {connected
        ? `CONNECTED${rttMs === null ? "" : ` · ${rttMs} MS · ${quality}`}`
        : status === "disconnected" ? "DISCONNECTED" : "RECONNECTING…"}
    </div>
  );
}
