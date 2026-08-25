import { getMap, getRadarLayer, type MapId, type RadarLayerId } from "../../shared/maps";
import { radarMediaUrl } from "../../shared/mediaUrls";
import { MAX_MULTIPLAYER_PLAYERS } from "../../shared/multiplayer";
import type { MapPoint, PublicPlayer, RoundResultState } from "../../shared/types";
import { RadarMarker } from "./RadarMarker";
import { RadarViewport } from "./RadarViewport";

export interface ResultRadarMarker {
  key: string;
  point: MapPoint;
  className: string;
  label: string;
  ariaLabel: string;
}

export interface ResultRadarLegendItem {
  key: string;
  label: string;
  className?: string;
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
  legend: Array<string | ResultRadarLegendItem>;
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
      <div className="marker-legend">
        {legend.map((item) => typeof item === "string"
          ? <span key={item}>{item}</span>
          : <span className={item.className} key={item.key}><i aria-hidden="true" />{item.label}</span>)}
      </div>
    </div>
  );
}

export function RoundRadarResult({
  result,
  playerId,
  players = [],
  assetOrigin = "",
}: {
  result: RoundResultState;
  playerId: string;
  players?: PublicPlayer[];
  assetOrigin?: string;
}) {
  const playerSlots = new Map(players.map((player) => [player.id, player.slotIndex]));
  const markerData = result.players
    .filter((player) => player.mapGuess === result.correctMapId && player.layerGuess === result.correctLayerId && player.pointGuess)
    .map((player, fallbackIndex) => {
      const isMe = player.playerId === playerId;
      const knownSlot = playerSlots.get(player.playerId);
      const slotIndex = Number.isInteger(knownSlot)
        ? Math.max(0, Math.min(MAX_MULTIPLAYER_PLAYERS - 1, knownSlot!))
        : Math.max(0, Math.min(MAX_MULTIPLAYER_PLAYERS - 1, fallbackIndex));
      const seat = `P${slotIndex + 1}`;
      return {
        marker: {
          key: player.playerId,
          point: player.pointGuess!,
          className: `player-point player-slot-${slotIndex + 1} ${isMe ? "your-point" : "other-player-point"}`,
          label: seat,
          ariaLabel: `${seat} ${isMe ? "your" : `${player.nickname}'s`} guessed point`,
        } satisfies ResultRadarMarker,
        legend: {
          key: player.playerId,
          label: `${seat} ${player.nickname}${isMe ? " · YOU" : ""}`,
          className: `player-slot-${slotIndex + 1}`,
        } satisfies ResultRadarLegendItem,
      };
    });
  return (
    <ResultRadarView
      correctMapId={result.correctMapId}
      correctLayerId={result.correctLayerId}
      correctPoint={result.correctPoint}
      markers={markerData.map(({ marker }) => marker)}
      legend={["✓ Correct", ...markerData.map(({ legend }) => legend)]}
      assetOrigin={assetOrigin}
    />
  );
}
