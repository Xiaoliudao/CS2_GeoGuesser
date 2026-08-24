import type { ConnectionState } from "../hooks/useGameSocket";

export function ConnectionStatus({ status }: { status: ConnectionState }) {
  const connected = status === "connected";
  return (
    <div className={`connection-status ${connected ? "is-connected" : ""}`}>
      <i />
      {connected ? "CONNECTED" : status === "disconnected" ? "DISCONNECTED" : "RECONNECTING…"}
    </div>
  );
}
