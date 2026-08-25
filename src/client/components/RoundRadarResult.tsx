import { getMap, getRadarLayer, type MapId, type RadarLayerId } from "../../shared/maps";
import { radarMediaUrl } from "../../shared/mediaUrls";
import type { MapPoint, RoundResultState } from "../../shared/types";
import { RadarMarker } from "./RadarMarker";
import { RadarViewport } from "./RadarViewport";

export interface ResultRadarMarker {
  key: string;
  point: MapPoint;
  className: string;
  label: string;
  ariaLabel: string;
}

export function ResultRadarView({
  correctMapId,
  correctLayerId,
  correctPoint,
  markers,
  legend,
  assetOrigin = "",
}: {
  correctMapId: MapId;
  correctLayerId: RadarLayerId;
  correctPoint: MapPoint;
  markers: ResultRadarMarker[];
  legend: string[];
  assetOrigin?: string;
}) {
  const map = getMap(correctMapId);
  const layer = getRadarLayer(correctMapId, correctLayerId);
  if (!layer) return null;
  return (
    <div className="result-radar-panel">
      <div className="radar-title"><span>CORRECT MAP · {layer.name}</span><strong>{map.name}</strong></div>
      <RadarViewport className="result-radar" src={radarMediaUrl(map.id, layer.id, assetOrigin)} alt={`${map.name} ${layer.name.toLowerCase()} result radar`}>
        <RadarMarker point={correctPoint} className="result-marker correct-point" label="CORRECT" ariaLabel="Correct answer point" />
        {markers.map((marker) => (
          <RadarMarker key={marker.key} point={marker.point} className={`result-marker ${marker.className}`} label={marker.label} ariaLabel={marker.ariaLabel} />
        ))}
      </RadarViewport>
      <div className="marker-legend">{legend.map((label) => <span key={label}>{label}</span>)}</div>
    </div>
  );
}

export function RoundRadarResult({
  result,
  playerId,
  assetOrigin = "",
}: {
  result: RoundResultState;
  playerId: string;
  assetOrigin?: string;
}) {
  const markers: ResultRadarMarker[] = result.players
    .filter((player) => player.mapGuess === result.correctMapId && player.layerGuess === result.correctLayerId && player.pointGuess)
    .map((player) => {
      const isMe = player.playerId === playerId;
      return {
        key: player.playerId,
        point: player.pointGuess!,
        className: isMe ? "your-point" : "opponent-point",
        label: isMe ? "YOU" : player.nickname,
        ariaLabel: `${isMe ? "Your" : `${player.nickname}'s`} guessed point`,
      };
    });
  return (
    <ResultRadarView
      correctMapId={result.correctMapId}
      correctLayerId={result.correctLayerId}
      correctPoint={result.correctPoint}
      markers={markers}
      legend={["✓ Correct", "Y You", "P2 Opponent"]}
      assetOrigin={assetOrigin}
    />
  );
}
