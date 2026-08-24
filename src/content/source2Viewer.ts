import { spawnSync } from "node:child_process";

export function resolveSource2Viewer(): string {
  const command = process.env.SOURCE2VIEWER_CLI || "Source2Viewer-CLI";
  const result = spawnSync(command, ["--version"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error("SOURCE2VIEWER_CLI_REQUIRED. Set SOURCE2VIEWER_CLI to the official ValveResourceFormat Source2Viewer-CLI executable.");
  }
  return command;
}

export function runSource2Viewer(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Source2Viewer-CLI exited with code ${result.status}.`);
}
