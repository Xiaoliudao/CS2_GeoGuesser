import { describe, expect, it } from "vitest";
import { clientEventSchema } from "./schemas";

const event = {
  type: "guess:submit",
  payload: {
    round: 1,
    eventId: "8a831d4d-92ef-4db3-86c8-3ac42c988f27",
    mapId: "mirage",
    layerId: "main",
    point: { x: 0.6432, y: 0.3821 },
  },
};

describe("normalized point validation", () => {
  it("accepts finite coordinates within zero and one", () => {
    expect(clientEventSchema.safeParse(event).success).toBe(true);
    expect(clientEventSchema.safeParse({ ...event, payload: { ...event.payload, point: { x: 0, y: 1 } } }).success).toBe(true);
  });

  it.each([
    { x: -0.01, y: 0.5 },
    { x: 1.01, y: 0.5 },
    { x: 0.5, y: Number.NaN },
    { x: Number.POSITIVE_INFINITY, y: 0.5 },
  ])("rejects invalid points", (point) => {
    expect(clientEventSchema.safeParse({ ...event, payload: { ...event.payload, point } }).success).toBe(false);
  });

  it("rejects an unknown map id", () => {
    expect(clientEventSchema.safeParse({ ...event, payload: { ...event.payload, mapId: "cache" } }).success).toBe(false);
  });

  it("rejects a radar layer that does not belong to the selected map", () => {
    expect(clientEventSchema.safeParse({ ...event, payload: { ...event.payload, layerId: "lower" } }).success).toBe(false);
    expect(clientEventSchema.safeParse({ ...event, payload: { ...event.payload, mapId: "nuke", layerId: "lower" } }).success).toBe(true);
  });
});
