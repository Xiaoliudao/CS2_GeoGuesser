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

  it("does not accept client-provided timing as part of a guess", () => {
    expect(clientEventSchema.parse({
      ...event,
      payload: { ...event.payload, elapsedMs: 0, submittedAt: 0 },
    })).toEqual(event);
  });

  it("accepts bounded asset readiness and safe asset errors", () => {
    expect(clientEventSchema.safeParse({
      type: "round:asset-ready",
      payload: { round: 2, questionId: "q-opaque123456", loadMs: 12_000 },
    }).success).toBe(true);
    expect(clientEventSchema.safeParse({
      type: "round:asset-error",
      payload: { round: 2, questionId: "q-opaque123456", reason: "TIMEOUT" },
    }).success).toBe(true);
  });

  it("rejects unbounded or private asset reports", () => {
    expect(clientEventSchema.safeParse({
      type: "round:asset-ready",
      payload: { round: 0, questionId: "wrong", loadMs: 999_999 },
    }).success).toBe(false);
    expect(clientEventSchema.safeParse({
      type: "round:asset-error",
      payload: { round: 2, questionId: "q-opaque123456", reason: "stack trace: token=secret" },
    }).success).toBe(false);
  });

  it("accepts authoritative clock pings while retaining rolling-deploy compatibility", () => {
    expect(clientEventSchema.safeParse({
      type: "ping",
      payload: { clientSentAt: 1_787_670_123_000 },
    }).success).toBe(true);
    expect(clientEventSchema.safeParse({
      type: "ping",
      payload: { sentAt: 1_787_670_123_000 },
    }).success).toBe(true);
    expect(clientEventSchema.safeParse({
      type: "ping",
      payload: { clientSentAt: Number.NaN },
    }).success).toBe(false);
  });

  it("accepts a payload-free start request and rejects client host claims", () => {
    expect(clientEventSchema.safeParse({ type: "game:start" }).success).toBe(true);
    expect(clientEventSchema.safeParse({ type: "game:start", payload: { host: true } }).success).toBe(false);
  });
});
