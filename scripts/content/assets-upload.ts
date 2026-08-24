import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const generatedRoot = join(projectRoot, "content", "generated");
const manifestPath = join(generatedRoot, "upload-manifest.json");
const bucket = process.env.R2_BUCKET_NAME || "cs2-map-guesser-assets";

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function upload(path: string, key: string): void {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", path, "--content-type", "image/webp", "--remote"], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`R2_UPLOAD_FAILED ${key}`);
}

const selection = new Set(process.argv.slice(2));
const includeRadars = selection.size === 0 || selection.has("--radars");
const includeQuestions = selection.size === 0 || selection.has("--questions");
const roots = [
  ...(includeRadars ? [{ directory: join(generatedRoot, "radars"), prefix: "radars" }] : []),
  ...(includeQuestions ? [{ directory: join(generatedRoot, "assets", "questions"), prefix: "questions" }] : []),
];
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, string> : {};
const next = { ...previous };
let uploaded = 0;
let skipped = 0;

for (const root of roots) {
  for (const file of filesBelow(root.directory).filter((path) => extname(path).toLowerCase() === ".webp")) {
    const key = `${root.prefix}/${relative(root.directory, file).split(sep).join("/")}`;
    const hash = digest(file);
    if (previous[key] === hash) {
      skipped += 1;
      continue;
    }
    upload(file, key);
    next[key] = hash;
    uploaded += 1;
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  }
}

console.log(`R2_UPLOAD_COMPLETE uploaded=${uploaded} unchanged=${skipped} bucket=${bucket}`);
