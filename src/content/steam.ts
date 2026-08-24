import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CS2Installation { cs2Path: string; steamLibrary: string; buildId: string }

function registrySteamPaths(): string[] {
  if (process.platform !== "win32") return [];
  const keys = [
    ["HKCU\\Software\\Valve\\Steam", "SteamPath"],
    ["HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath"],
    ["HKLM\\SOFTWARE\\Valve\\Steam", "InstallPath"],
  ];
  const paths: string[] = [];
  for (const [key, valueName] of keys) {
    try {
      const output = execFileSync("reg.exe", ["query", key, "/v", valueName], { encoding: "utf8", windowsHide: true });
      const match = output.match(new RegExp(`${valueName}\\s+REG_\\w+\\s+(.+)$`, "mi"));
      if (match) paths.push(match[1].trim());
    } catch { /* Registry key is optional. */ }
  }
  return paths;
}

function librariesFromSteamRoot(steamRoot: string): string[] {
  const file = join(steamRoot, "steamapps", "libraryfolders.vdf");
  if (!existsSync(file)) return [steamRoot];
  const text = readFileSync(file, "utf8");
  const libraries = [...text.matchAll(/"path"\s+"([^"]+)"/g)].map((match) => match[1].replace(/\\\\/g, "\\"));
  return [steamRoot, ...libraries];
}

export function locateCS2(): CS2Installation {
  const explicit = process.env.CS2_PATH;
  const roots = [
    ...registrySteamPaths(),
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam",
  ].filter((value, index, all) => value && all.indexOf(value) === index);
  const candidates = explicit
    ? [{ game: explicit, library: join(explicit, "..", "..", "..") }]
    : roots.flatMap((root) => librariesFromSteamRoot(root).map((library) => ({
      library,
      game: join(library, "steamapps", "common", "Counter-Strike Global Offensive"),
    })));

  for (const candidate of candidates) {
    const vpk = join(candidate.game, "game", "csgo", "pak01_dir.vpk");
    if (!existsSync(vpk)) continue;
    const manifest = join(candidate.library, "steamapps", "appmanifest_730.acf");
    const manifestText = existsSync(manifest) ? readFileSync(manifest, "utf8") : "";
    const buildId = manifestText.match(/"buildid"\s+"([^"]+)"/)?.[1] ?? "unknown";
    return { cs2Path: candidate.game, steamLibrary: candidate.library, buildId };
  }
  throw new Error("REAL CS2 INSTALLATION REQUIRED. Set CS2_PATH to the Counter-Strike Global Offensive install directory.");
}
