import type { MapId } from "../shared/maps";
import type { MapOverview, RadarLayerOverview } from "../shared/radarCoordinates";

type KeyValuesNode = string | { [key: string]: KeyValuesNode };

function tokenize(text: string): string[] {
  const withoutComments = text.replace(/\/\/.*$/gm, "");
  return withoutComments.match(/"(?:\\.|[^"\\])*"|[{}]|[^\s{}]+/g)?.map((token) =>
    token.startsWith('"') ? JSON.parse(token) as string : token,
  ) ?? [];
}

function parseObject(tokens: string[], cursor: { index: number }): Record<string, KeyValuesNode> {
  const result: Record<string, KeyValuesNode> = {};
  if (tokens[cursor.index] !== "{") throw new Error(`Expected { at token ${cursor.index}.`);
  cursor.index += 1;
  while (cursor.index < tokens.length && tokens[cursor.index] !== "}") {
    const key = tokens[cursor.index++];
    if (!key || key === "{") throw new Error(`Invalid overview key at token ${cursor.index - 1}.`);
    result[key] = tokens[cursor.index] === "{" ? parseObject(tokens, cursor) : tokens[cursor.index++];
  }
  if (tokens[cursor.index] !== "}") throw new Error("Unclosed overview object.");
  cursor.index += 1;
  return result;
}

export function parseKeyValues(text: string): Record<string, KeyValuesNode> {
  const tokens = tokenize(text);
  if (tokens.length < 3) throw new Error("Overview file is empty or malformed.");
  const rootName = tokens[0];
  const cursor = { index: 1 };
  return { [rootName]: parseObject(tokens, cursor) };
}

function objectValue(node: KeyValuesNode | undefined, label: string): Record<string, KeyValuesNode> {
  if (!node || typeof node === "string") throw new Error(`Overview ${label} must be an object.`);
  return node;
}

function numberValue(node: KeyValuesNode | undefined, label: string, fallback?: number): number {
  if (node === undefined && fallback !== undefined) return fallback;
  if (typeof node !== "string" || !Number.isFinite(Number(node))) throw new Error(`Overview ${label} must be numeric.`);
  return Number(node);
}

export interface RadarDimension { width: number; height: number }

export function parseOverview(
  text: string,
  mapId: MapId,
  sourceName: string,
  dimensions: Record<string, RadarDimension>,
  sourceBuildId: string,
): MapOverview {
  const root = objectValue(parseKeyValues(text)[sourceName], sourceName);
  const verticalSections = root.verticalsections === undefined ? null : objectValue(root.verticalsections, "verticalsections");
  let layers: RadarLayerOverview[];
  if (!verticalSections) {
    const dimension = dimensions.main;
    if (!dimension) throw new Error(`Missing extracted radar dimensions for ${mapId}/main.`);
    layers = [{ id: "main", sourceSectionName: "default", radarWidth: dimension.width, radarHeight: dimension.height }];
  } else {
    layers = Object.entries(verticalSections).map(([sourceSectionName, rawSection]) => {
      const section = objectValue(rawSection, `verticalsections.${sourceSectionName}`);
      const id = sourceSectionName === "default" ? "upper" : sourceSectionName.toLowerCase();
      const dimension = dimensions[id];
      if (!dimension) throw new Error(`Missing extracted radar dimensions for ${mapId}/${id}.`);
      return {
        id,
        sourceSectionName,
        radarWidth: dimension.width,
        radarHeight: dimension.height,
        altitudeMin: numberValue(section.AltitudeMin, `${sourceSectionName}.AltitudeMin`),
        altitudeMax: numberValue(section.AltitudeMax, `${sourceSectionName}.AltitudeMax`),
      };
    });
  }

  return {
    mapId,
    sourceName,
    posX: numberValue(root.pos_x, "pos_x"),
    posY: numberValue(root.pos_y, "pos_y"),
    scale: numberValue(root.scale, "scale"),
    rotate: numberValue(root.rotate, "rotate", 0),
    zoom: numberValue(root.zoom, "zoom", 0),
    layers,
    extractedAt: new Date().toISOString(),
    sourceBuildId,
  };
}
