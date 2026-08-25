import type { GameRoomState } from "../../shared/types";
import { getMap } from "../../shared/maps";

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
      <p>Two players. {room.settings.totalRounds} locations. One winner.</p>
      <div className="lobby-settings" aria-label="Match settings">
        <div><span>ROUNDS</span><strong>{room.settings.totalRounds}</strong></div>
        <div><span>ROUND TIME</span><strong>{room.settings.roundDurationSeconds} SEC</strong></div>
        <div><span>SERVER</span><strong>{room.settings.serverRegion === "asia" ? "ASIA" : "AUTO"}</strong></div>
        <div className="lobby-map-pool">
          <span>MAP POOL</span>
          <strong>{room.settings.mapPool.map((mapId) => getMap(mapId).name).join(" · ")}</strong>
        </div>
      </div>
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
      {room.questionCount > 0 && room.questionCount < room.settings.totalRounds && (
        <div className="content-empty-state">
          <strong>NOT ENOUGH QUESTIONS</strong>
          <span>Only {room.questionCount} questions remain for this map pool; this match requires {room.settings.totalRounds}.</span>
        </div>
      )}
      {room.questionCount >= room.settings.totalRounds && (
        <div className="content-available-state">
          <strong>{room.questionCount} REAL QUESTION{room.questionCount === 1 ? "" : "S"} AVAILABLE</strong>
          <span>This match requires {room.settings.totalRounds} verified round{room.settings.totalRounds === 1 ? "" : "s"} from the selected maps.</span>
        </div>
      )}
      <button
        className="primary-button ready-button"
        aria-pressed={Boolean(me?.ready)}
        disabled={!me || (!me.ready && room.questionCount < room.settings.totalRounds)}
        onClick={onReady}
      >
        {me?.ready ? "CANCEL READY" : "READY UP"}
      </button>
      {room.players.length < 2 && <small className="waiting-note">WAITING FOR AN OPPONENT…</small>}
    </section>
  );
}
