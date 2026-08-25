import type { GameRoomState } from "../../shared/types";

export function Lobby({
  room,
  playerId,
  onReady,
}: {
  room: GameRoomState;
  playerId: string;
  onReady: () => void;
}) {
  const me = room.players.find((player) => player.id === playerId);
  return (
    <section className="stage-card lobby-card">
      <div className="stage-kicker">PRE-MATCH</div>
      <h2>WAITING ROOM</h2>
      <p>Two players. Five locations. One winner.</p>
      <div className="lobby-slots">
        {[0, 1].map((slot) => {
          const player = room.players[slot];
          return player ? (
            <div className="lobby-player" key={player.id}>
              <div className="avatar">{player.nickname.slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{player.nickname}</strong>
                <span>{player.connected ? "ONLINE" : "RECONNECTING"}</span>
              </div>
              <b className={player.ready ? "ready" : "not-ready"}>
                {player.ready ? "READY ✓" : "NOT READY"}
              </b>
            </div>
          ) : (
            <div className="lobby-player empty" key={slot}>
              <div className="avatar">?</div>
              <div><strong>OPEN SLOT</strong><span>SHARE THE ROOM CODE</span></div>
            </div>
          );
        })}
      </div>
      {room.questionCount === 0 && (
        <div className="content-empty-state"><strong>NO REAL QUESTIONS AVAILABLE</strong><span>Import a real CS2 question first.</span></div>
      )}
      {room.questionCount > 0 && (
        <div className="content-available-state">
          <strong>{room.questionCount} REAL QUESTION{room.questionCount === 1 ? "" : "S"} AVAILABLE</strong>
          <span>This match will use {Math.min(5, room.questionCount)} verified round{Math.min(5, room.questionCount) === 1 ? "" : "s"}.</span>
        </div>
      )}
      <button className="primary-button ready-button" disabled={me?.ready || room.questionCount === 0} onClick={onReady}>
        {me?.ready ? "YOU'RE READY" : "READY UP"}
      </button>
      {room.players.length < 2 && <small className="waiting-note">WAITING FOR AN OPPONENT…</small>}
    </section>
  );
}
