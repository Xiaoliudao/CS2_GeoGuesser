import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { selectRadarProvider, type RadarProviderId } from "../../src/content/radarProvider";
import { copyRadarPreviewAsset } from "../../src/content/questionPreviewWriter";
import { GitHubExtractedRadarProvider } from "./providers/github-extracted";
import { LocalCS2RadarProvider } from "./providers/local-cs2";
import { projectRoot, publicDevAssetsRoot, radarRoot, writeRadarRegistry } from "./radar-registry";

function forcedProvider(): RadarProviderId | undefined {
  const index = process.argv.indexOf("--provider");
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value !== "local-cs2" && value !== "github-extracted") {
    throw new Error("INVALID_RADAR_PROVIDER. Expected local-cs2 or github-extracted.");
  }
  return value;
}

function hasUploadCredentials(): boolean {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}

function uploadRadars(): void {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["run", "assets:upload", "--", "--radars"], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("RADAR_R2_UPLOAD_FAILED");
}

async function main() {
  const provider = await selectRadarProvider([
    new LocalCS2RadarProvider(),
    new GitHubExtractedRadarProvider(),
  ], forcedProvider());
  console.log(`RADAR_PROVIDER=${provider.id}`);
  const result = await provider.sync();
  if (Object.keys(result.maps).length !== 8 || result.artifacts.length !== 10 || result.overviews.length !== 8) {
    throw new Error(`REAL_RADAR_SYNC_INCOMPLETE maps=${Object.keys(result.maps).length} artifacts=${result.artifacts.length} overviews=${result.overviews.length}`);
  }
  console.log(`WROTE ${writeRadarRegistry(result)}`);
  for (const artifact of result.artifacts) {
    copyRadarPreviewAsset(join(radarRoot, artifact.mapId, `${artifact.layerId}.webp`), publicDevAssetsRoot, artifact.mapId, artifact.layerId);
  }
  console.log(`DEV_RADAR_PREVIEW_READY ${join(publicDevAssetsRoot, "radars")}`);
  if (process.argv.includes("--no-upload") || !hasUploadCredentials()) {
    console.log("R2_UPLOAD_PENDING: generated real radar assets locally; configure Cloudflare credentials to upload.");
  } else {
    uploadRadars();
  }
  console.log(`RADAR_SYNC_COMPLETE provider=${result.provider} maps=8 artifacts=10`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
