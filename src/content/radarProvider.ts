import type { MapId, RadarLayerId } from "../shared/maps";
import type { MapOverview } from "../shared/radarCoordinates";

export type RadarProviderId = "local-cs2" | "github-extracted";

export interface RadarArtifactRecord {
  mapId: MapId;
  layerId: RadarLayerId;
  source: string;
  sourceSha256: string;
  outputSha256: string;
  width: number;
  height: number;
}

export interface OverviewArtifactRecord {
  mapId: MapId;
  source: string;
  sourceSha256: string;
}

export interface RadarProviderResult {
  provider: RadarProviderId;
  providerUrl?: string;
  sourceBuildId: string;
  maps: Partial<Record<MapId, MapOverview>>;
  artifacts: RadarArtifactRecord[];
  overviews: OverviewArtifactRecord[];
}

export interface RadarSourceProvider {
  id: RadarProviderId;
  isAvailable(): Promise<boolean>;
  sync(): Promise<RadarProviderResult>;
}

export async function selectRadarProvider(
  providers: readonly RadarSourceProvider[],
  forcedProvider?: RadarProviderId,
): Promise<RadarSourceProvider> {
  if (forcedProvider) {
    const provider = providers.find((candidate) => candidate.id === forcedProvider);
    if (!provider || !(await provider.isAvailable())) throw new Error(`RADAR_PROVIDER_UNAVAILABLE ${forcedProvider}`);
    return provider;
  }
  for (const provider of providers) {
    if (await provider.isAvailable()) return provider;
  }
  throw new Error("NO_REAL_RADAR_PROVIDER_AVAILABLE");
}
