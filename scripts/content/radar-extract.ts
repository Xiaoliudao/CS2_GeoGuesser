import { LocalCS2RadarProvider } from "./providers/local-cs2";
import { writeRadarRegistry } from "./radar-registry";

async function main() {
  const provider = new LocalCS2RadarProvider();
  if (!(await provider.isAvailable())) {
    throw new Error("LOCAL_RADAR_PROVIDER_UNAVAILABLE. Install Source2Viewer-CLI or run npm run radar:sync for the real extracted fallback.");
  }
  const result = await provider.sync();
  console.log(`WROTE ${writeRadarRegistry(result)}`);
  console.log("NEXT npm run assets:upload -- --radars");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
