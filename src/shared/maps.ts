export interface RadarLayerDefinition {
  id: "main" | "upper" | "lower";
  name: string;
  radarUrl: string;
}

export interface MapDefinition {
  id: "mirage" | "inferno" | "ancient" | "nuke" | "anubis" | "dust2" | "train" | "overpass";
  name: string;
  sourceName: string;
  layers: readonly RadarLayerDefinition[];
}

export const MAPS = [
  { id: "mirage", name: "Mirage", sourceName: "de_mirage", layers: [{ id: "main", name: "MAIN", radarUrl: "/media/radars/mirage/main" }] },
  { id: "inferno", name: "Inferno", sourceName: "de_inferno", layers: [{ id: "main", name: "MAIN", radarUrl: "/media/radars/inferno/main" }] },
  { id: "ancient", name: "Ancient", sourceName: "de_ancient", layers: [{ id: "main", name: "MAIN", radarUrl: "/media/radars/ancient/main" }] },
  { id: "nuke", name: "Nuke", sourceName: "de_nuke", layers: [
    { id: "upper", name: "UPPER", radarUrl: "/media/radars/nuke/upper" },
    { id: "lower", name: "LOWER", radarUrl: "/media/radars/nuke/lower" },
  ] },
  { id: "anubis", name: "Anubis", sourceName: "de_anubis", layers: [{ id: "main", name: "MAIN", radarUrl: "/media/radars/anubis/main" }] },
  { id: "dust2", name: "Dust II", sourceName: "de_dust2", layers: [{ id: "main", name: "MAIN", radarUrl: "/media/radars/dust2/main" }] },
  { id: "train", name: "Train", sourceName: "de_train", layers: [
    { id: "upper", name: "UPPER", radarUrl: "/media/radars/train/upper" },
    { id: "lower", name: "LOWER", radarUrl: "/media/radars/train/lower" },
  ] },
  { id: "overpass", name: "Overpass", sourceName: "de_overpass", layers: [{ id: "main", name: "MAIN", radarUrl: "/media/radars/overpass/main" }] },
] as const satisfies readonly MapDefinition[];

export type MapId = (typeof MAPS)[number]["id"];
export type RadarLayerId = (typeof MAPS)[number]["layers"][number]["id"];
export const MAP_IDS = MAPS.map((map) => map.id) as [MapId, ...MapId[]];

export function getMap(mapId: MapId) {
  return MAPS.find((map) => map.id === mapId)!;
}

export function isLayerForMap(mapId: MapId, layerId: string): layerId is RadarLayerId {
  return (getMap(mapId).layers as readonly RadarLayerDefinition[]).some((layer) => layer.id === layerId);
}

export function getRadarLayer(mapId: MapId, layerId: string) {
  return (getMap(mapId).layers as readonly RadarLayerDefinition[]).find((layer) => layer.id === layerId);
}
