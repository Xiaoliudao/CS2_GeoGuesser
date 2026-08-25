import { getMap, getRadarLayer } from "../../shared/maps";
import { radarMediaUrl } from "../../shared/mediaUrls";
import type { RoundResultState } from "../../shared/types";
import { RadarMarker } from "./RadarMarker";
import { RadarViewport } from "./RadarViewport";

export function RoundRadarResult({
  result,
  playerId,
  assetOrigin = "",
}: {
  result: RoundResultState;
  playerId: string;
  assetOrigin?: string;
}) {
  const map = getMap(result.correctMapId);
  const layer = getRadarLayer(result.correctMapId, result.correctLayerId);
  if (!layer) return null;
  const visibleGuesses = result.players.filter(
    (player) => player.mapGuess === result.correctMapId && player.layerGuess === result.correctLayerId && player.pointGuess,
  );
  return (
    <div className="result-radar-panel">
      <div className="radar-title"><span>CORRECT MAP · {layer.name}</span><strong>{map.name}</strong></div>
      <RadarViewport
        className="result-radar"
        src={radarMediaUrl(map.id, layer.id, assetOrigin)}
        alt={`${map.name} ${layer.name.toLowerCase()} result radar`}
      >
        <RadarMarker
          point={result.correctPoint}
          className="result-marker correct-point"
          label="CORRECT"
          ariaLabel="Correct answer point"
        />
        {visibleGuesses.map((player) => {
          const point = player.pointGuess!;
          const isMe = player.playerId === playerId;
          return (
            <RadarMarker
              key={player.playerId}
              point={point}
              className={`result-marker ${isMe ? "your-point" : "opponent-point"}`}
              label={isMe ? "YOU" : player.nickname}
              ariaLabel={`${isMe ? "Your" : `${player.nickname}'s`} guessed point`}
            />
          );
        })}
      </RadarViewport>
      <div className="marker-legend"><span>✓ Correct</span><span>Y You</span><span>P2 Opponent</span></div>
    </div>
  );
}
