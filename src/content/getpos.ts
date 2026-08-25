import type { ViewAngle, WorldPosition } from "../shared/radarCoordinates.ts";

export interface ParsedGetpos {
  worldPosition: WorldPosition;
  viewAngle?: ViewAngle;
}

function parseTriple(value: string, label: string): [number, number, number] {
  const numbers = value.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (numbers.length !== 3 || numbers.some((number) => !Number.isFinite(number))) {
    throw new Error(`${label} must contain exactly three finite numbers.`);
  }
  return [numbers[0], numbers[1], numbers[2]];
}

export function parsePosition(value: string): WorldPosition {
  const [x, y, z] = parseTriple(value.replace(/^setpos_exact\s+/i, "").replace(/;.*$/, ""), "Position");
  return { x, y, z };
}

export function parseViewAngle(value: string): ViewAngle {
  const [pitch, yaw, roll] = parseTriple(value.replace(/^setang_exact\s+/i, "").replace(/;.*$/, ""), "Angle");
  return { pitch, yaw, roll };
}

export function parseGetpos(value: string): ParsedGetpos {
  const positionMatch = value.match(/setpos_exact\s+([^;\r\n]+)/i);
  if (!positionMatch) throw new Error("Input does not contain a setpos_exact X Y Z command.");
  const angleMatch = value.match(/setang_exact\s+([^;\r\n]+)/i);
  return {
    worldPosition: parsePosition(positionMatch[1]),
    viewAngle: angleMatch ? parseViewAngle(angleMatch[1]) : undefined,
  };
}
