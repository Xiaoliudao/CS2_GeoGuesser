import { getMap, getRadarLayer } from "../../shared/maps";
import type { RoundResultState } from "../../shared/types";

export function RoundRadarResult({ result, playerId }: { result: RoundResultState; playerId: string }) {
  const map = getMap(result.correctMapId);
  const layer = getRadarLayer(result.correctMapId, result.correctLayerId);
  if (!layer) return null;
  const visibleGuesses = result.players.filter(
    (player) => player.mapGuess === result.correctMapId && player.layerGuess === result.correctLayerId && player.pointGuess,
  );
  return (
    <div className="result-radar-panel">
      <div className="radar-title"><span>CORRECT MAP · {layer.name}</span><strong>{map.name}</strong></div>
      <div className="radar-image-wrap result-radar">
        <img src={layer.radarUrl} alt={`${map.name} ${layer.name.toLowerCase()} result radar`} draggable={false} />
        <span
          className="radar-marker result-marker correct-point"
          style={{ left: `${result.correctPoint.x * 100}%`, top: `${result.correctPoint.y * 100}%` }}
        ><i>✓</i><b>CORRECT</b></span>
        {visibleGuesses.map((player) => {
          const point = player.pointGuess!;
          const isMe = player.playerId === playerId;
          return (
            <span
              key={player.playerId}
              className={`radar-marker result-marker ${isMe ? "your-point" : "opponent-point"}`}
              style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            ><i>{isMe ? "Y" : "P2"}</i><b>{isMe ? "YOU" : player.nickname}</b></span>
          );
        })}
      </div>
      <div className="marker-legend"><span>✓ Correct</span><span>Y You</span><span>P2 Opponent</span></div>
    </div>
  );
}
