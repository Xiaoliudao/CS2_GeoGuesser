export const RADAR_ASSET_VERSION = "2026-08-25";

export function normalizePublicOrigin(origin: string | undefined): string {
  const value = origin?.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function objectUrl(assetOrigin: string, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${assetOrigin}/${encodedKey}`;
}

export function questionMediaUrl(questionId: string, imageAssetKey: string, rawAssetOrigin?: string): string {
  const assetOrigin = normalizePublicOrigin(rawAssetOrigin);
  return assetOrigin
    ? objectUrl(assetOrigin, imageAssetKey)
    : `/media/questions/${encodeURIComponent(questionId)}`;
}

export function radarMediaUrl(mapId: string, layerId: string, rawAssetOrigin?: string): string {
  const assetOrigin = normalizePublicOrigin(rawAssetOrigin);
  const base = assetOrigin
    ? objectUrl(assetOrigin, `radars/${mapId}/${layerId}.webp`)
    : `/media/radars/${encodeURIComponent(mapId)}/${encodeURIComponent(layerId)}`;
  return `${base}?v=${RADAR_ASSET_VERSION}`;
}
