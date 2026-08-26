import { describe, expect, it, vi } from "vitest";
import type { AdminQuestion } from "../../shared/adminQuestions";
import type { QuestionDifficulty } from "../../shared/questionDifficulty";
import type { ServerQuestion } from "../game/questions";
import type { PublishQuestionInput, QuestionListItem } from "../questions/QuestionRepository";
import {
  detectImageType,
  handleAdminRequest,
  requireNormalizedPoint,
  resolveWorldCoordinateAnswer,
  type AdminQuestionRepository,
} from "./adminQuestions";

class MemoryAdminRepository implements AdminQuestionRepository {
  readonly questions: QuestionListItem[] = [];

  async list(): Promise<QuestionListItem[]> { return this.questions; }
  async getListItemById(questionId: string): Promise<QuestionListItem | null> {
    return this.questions.find((question) => question.id === questionId) ?? null;
  }
  async contentHashExists(contentHash: string): Promise<boolean> {
    return this.questions.some((question) => question.contentHash === contentHash);
  }
  async publish(input: PublishQuestionInput): Promise<ServerQuestion> {
    const now = "2026-08-24T00:00:00.000Z";
    this.questions.push({
      id: input.id,
      imageAssetKey: input.imageAssetKey,
      mapId: input.correctMapId,
      layerId: input.correctLayerId,
      difficulty: input.difficulty,
      correctPoint: input.correctPoint,
      ...(input.automaticPoint ? { automaticPoint: input.automaticPoint } : {}),
      ...(input.worldPosition ? { worldPosition: input.worldPosition } : {}),
      ...(input.viewAngle ? { viewAngle: input.viewAngle } : {}),
      coordinateSource: input.coordinateSource,
      enabled: input.enabled !== false,
      contentHash: input.contentHash,
      sourcePreviewId: input.sourcePreviewId,
      createdAt: now,
      updatedAt: now,
    });
    return input;
  }
  async updatePoint(questionId: string, point: { x: number; y: number }): Promise<boolean> {
    const question = this.questions.find((candidate) => candidate.id === questionId);
    if (!question) return false;
    question.correctPoint = point;
    question.coordinateSource = "manual-override";
    return true;
  }
  async updateDifficulty(questionId: string, difficulty: QuestionDifficulty): Promise<boolean> {
    const question = this.questions.find((candidate) => candidate.id === questionId);
    if (!question || question.difficulty === difficulty) return false;
    question.difficulty = difficulty;
    question.updatedAt = "2026-08-25T00:00:00.000Z";
    return true;
  }
  async setEnabled(questionId: string, enabled: boolean): Promise<boolean> {
    const question = this.questions.find((candidate) => candidate.id === questionId);
    if (!question) return false;
    question.enabled = enabled;
    return true;
  }
}

function adminEnv(store: unknown): Env {
  return { GAME_ASSETS: store } as Env;
}

function validUploadForm(difficulty?: string): FormData {
  const form = new FormData();
  form.set("image", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], "question.jpg", { type: "image/jpeg" }));
  form.set("mapId", "mirage");
  form.set("layerId", "main");
  form.set("correctX", "0.25");
  form.set("correctY", "0.75");
  form.set("coordinateSource", "manual-override");
  if (difficulty !== undefined) form.set("difficulty", difficulty);
  return form;
}

describe("online admin question management", () => {
  it("recognizes supported image signatures and rejects arbitrary bytes", () => {
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageType(new TextEncoder().encode("not-an-image"))).toBeNull();
  });

  it("rejects answer points outside the normalized radar", () => {
    expect(() => requireNormalizedPoint(-0.1, 0.5)).toThrow("INVALID_CORRECT_POINT");
    expect(() => requireNormalizedPoint(0.5, 1.1)).toThrow("INVALID_CORRECT_POINT");
    expect(requireNormalizedPoint(0.25, 0.75)).toEqual({ x: 0.25, y: 0.75 });
  });

  it("converts pasted CS2 console coordinates into authoritative world metadata and a radar point", () => {
    const answer = resolveWorldCoordinateAnswer(
      "mirage",
      "setpos_exact -2331.545654 -477.949829 -63.248474;setang_exact -13.700989 -145.679047 0.000000",
    );
    expect(answer).toMatchObject({
      mapId: "mirage",
      layerId: "main",
      worldPosition: { x: -2331.545654, y: -477.949829, z: -63.248474 },
      viewAngle: { pitch: -13.700989, yaw: -145.679047, roll: 0 },
      coordinateSource: "world-conversion",
    });
    expect(answer.correctPoint.x).toBeCloseTo(0.175479364453125, 12);
    expect(answer.correctPoint.y).toBeCloseTo(0.42791988847656254, 12);
    expect(answer.automaticPoint).toEqual(answer.correctPoint);
  });

  it("keeps the verified Dust II console position in the displayed lower-left", () => {
    const answer = resolveWorldCoordinateAnswer(
      "dust2",
      "setpos_exact -1248.585815 -246.164001 191.263901;setang_exact -4.004517 88.254547 0.000000",
    );
    expect(answer).toMatchObject({
      mapId: "dust2",
      layerId: "main",
      worldPosition: { x: -1248.585815, y: -246.164001, z: 191.263901 },
      viewAngle: { pitch: -4.004517, yaw: 88.254547, roll: 0 },
      coordinateSource: "world-conversion",
    });
    expect(answer.correctPoint.x).toBeCloseTo(0.2724196966, 9);
    expect(answer.correctPoint.y).toBeCloseTo(0.7735182886, 9);
    expect(answer.correctPoint.x).toBeLessThan(0.5);
    expect(answer.correctPoint.y).toBeGreaterThan(0.5);
    expect(answer.automaticPoint).toEqual(answer.correctPoint);
  });

  it("selects a multi-level radar layer from world Z", () => {
    expect(resolveWorldCoordinateAnswer("nuke", "setpos_exact 0 0 -600").layerId).toBe("lower");
    expect(resolveWorldCoordinateAnswer("nuke", "setpos_exact 0 0 -400").layerId).toBe("upper");
  });

  it("uploads a real image key to R2 before publishing the D1 row", async () => {
    const events: string[] = [];
    const repository = new MemoryAdminRepository();
    const stored = new Map<string, ArrayBuffer>();
    const store = {
      async put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }) {
        events.push(`put:${key}:${options.httpMetadata.contentType}`);
        stored.set(key, value);
        return {};
      },
      async head(key: string) { events.push(`head:${key}`); return stored.has(key) ? {} : null; },
      async delete(key: string) { events.push(`delete:${key}`); stored.delete(key); },
    };
    const form = new FormData();
    form.set("image", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], "question.jpg", { type: "image/jpeg" }));
    form.set("mapId", "ancient");
    form.set("difficulty", "easy");
    form.set("layerId", "main");
    form.set("correctX", "0.25");
    form.set("correctY", "0.75");
    form.set("coordinateSource", "manual-override");
    const response = await handleAdminRequest(
      new Request("https://game.example/admin/api/questions", {
        method: "POST",
        headers: { origin: "https://game.example", "x-cs2-admin-action": "1" },
        body: form,
      }),
      adminEnv(store),
      { email: "admin@example.com" },
      repository,
    );

    expect(response.status).toBe(201);
    const body = await response.json() as { question: AdminQuestion };
    expect(body.question).toMatchObject({ mapId: "ancient", layerId: "main", difficulty: "easy", correctPoint: { x: 0.25, y: 0.75 }, enabled: true });
    expect(body.question.imageUrl).toBe(`/media/questions/${body.question.id}`);
    expect(repository.questions[0].imageAssetKey).toMatch(/^questions\/q-[a-f0-9]{16}\.jpg$/);
    expect(events[0]).toMatch(/^put:questions\/q-[a-f0-9]{16}\.jpg:image\/jpeg$/);
    expect(events[1]).toMatch(/^head:questions\/q-[a-f0-9]{16}\.jpg$/);
  });

  it.each(["easy", "hard", "hell"] as const)("accepts the required %s difficulty on upload", async (difficulty) => {
    const repository = new MemoryAdminRepository();
    const stored = new Map<string, ArrayBuffer>();
    const store = {
      async put(key: string, value: ArrayBuffer) { stored.set(key, value); return {}; },
      async head(key: string) { return stored.has(key) ? {} : null; },
      async delete(key: string) { stored.delete(key); },
    };
    const response = await handleAdminRequest(
      new Request("https://game.example/admin/api/questions", {
        method: "POST",
        headers: { origin: "https://game.example", "x-cs2-admin-action": "1" },
        body: validUploadForm(difficulty),
      }),
      adminEnv(store),
      { email: "admin@example.com" },
      repository,
    );

    expect(response.status).toBe(201);
    const body = await response.json() as { question: AdminQuestion };
    expect(body.question.difficulty).toBe(difficulty);
    expect(repository.questions[0].difficulty).toBe(difficulty);
  });

  it.each([undefined, "medium"])("rejects missing or invalid difficulty %s before writing R2", async (difficulty) => {
    const put = vi.fn();
    const response = await handleAdminRequest(
      new Request("https://game.example/admin/api/questions", {
        method: "POST",
        headers: { origin: "https://game.example", "x-cs2-admin-action": "1" },
        body: validUploadForm(difficulty),
      }),
      adminEnv({ put }),
      { email: "admin@example.com" },
      new MemoryAdminRepository(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_DIFFICULTY" });
    expect(put).not.toHaveBeenCalled();
  });

  it("publishes coordinate-mode uploads using the server calculation instead of client point fields", async () => {
    const repository = new MemoryAdminRepository();
    const stored = new Map<string, ArrayBuffer>();
    const store = {
      async put(key: string, value: ArrayBuffer) { stored.set(key, value); return {}; },
      async head(key: string) { return stored.has(key) ? {} : null; },
      async delete(key: string) { stored.delete(key); },
    };
    const form = new FormData();
    form.set("image", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], "coordinate.jpg", { type: "image/jpeg" }));
    form.set("mapId", "mirage");
    form.set("difficulty", "hell");
    form.set("answerMode", "world-coordinates");
    form.set("consoleCoordinates", "setpos_exact -2331.545654 -477.949829 -63.248474;setang_exact -13.700989 -145.679047 0");
    form.set("correctX", "0");
    form.set("correctY", "0");
    const response = await handleAdminRequest(
      new Request("https://game.example/admin/api/questions", {
        method: "POST",
        headers: { origin: "https://game.example", "x-cs2-admin-action": "1" },
        body: form,
      }),
      adminEnv(store),
      { email: "admin@example.com" },
      repository,
    );

    expect(response.status).toBe(201);
    const body = await response.json() as { question: AdminQuestion };
    expect(body.question.coordinateSource).toBe("world-conversion");
    expect(body.question.worldPosition).toEqual({ x: -2331.545654, y: -477.949829, z: -63.248474 });
    expect(body.question.viewAngle).toEqual({ pitch: -13.700989, yaw: -145.679047, roll: 0 });
    expect(body.question.correctPoint.x).toBeCloseTo(0.175479364453125, 12);
    expect(body.question.correctPoint.y).toBeCloseTo(0.42791988847656254, 12);
    expect(body.question.automaticPoint).toEqual(body.question.correctPoint);
  });

  it("rejects malformed or off-map console coordinates before writing R2", async () => {
    for (const consoleCoordinates of ["setang_exact 0 0 0", "setpos_exact -9000 1713 0"]) {
      const form = new FormData();
      form.set("image", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], "bad.jpg", { type: "image/jpeg" }));
      form.set("mapId", "mirage");
      form.set("difficulty", "hard");
      form.set("answerMode", "world-coordinates");
      form.set("consoleCoordinates", consoleCoordinates);
      const response = await handleAdminRequest(
        new Request("https://game.example/admin/api/questions", {
          method: "POST",
          headers: { origin: "https://game.example", "x-cs2-admin-action": "1" },
          body: form,
        }),
        adminEnv({}),
        { email: "admin@example.com" },
        new MemoryAdminRepository(),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "INVALID_CONSOLE_COORDINATES" });
    }
  });

  it("updates only question difficulty through the metadata PATCH route", async () => {
    const repository = new MemoryAdminRepository();
    await repository.publish({
      id: "q-admin-test0001",
      imageAssetKey: "questions/q-admin-test0001.webp",
      correctMapId: "mirage",
      correctLayerId: "main",
      difficulty: "hard",
      correctPoint: { x: 0.2, y: 0.8 },
      coordinateSource: "manual-override",
      contentHash: "admin-test-hash",
      sourcePreviewId: null,
      enabled: true,
    });
    const before = structuredClone(repository.questions[0]);
    const response = await handleAdminRequest(
      new Request("https://game.example/admin/api/questions/q-admin-test0001/difficulty", {
        method: "PATCH",
        headers: {
          origin: "https://game.example",
          "x-cs2-admin-action": "1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ difficulty: "hell" }),
      }),
      adminEnv({}),
      { email: "admin@example.com" },
      repository,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { question: AdminQuestion };
    expect(body.question.difficulty).toBe("hell");
    expect(repository.questions[0]).toEqual({
      ...before,
      difficulty: "hell",
      updatedAt: "2026-08-25T00:00:00.000Z",
    });
  });

  it("rejects invalid difficulty PATCH values", async () => {
    const response = await handleAdminRequest(
      new Request("https://game.example/admin/api/questions/q-admin-test0001/difficulty", {
        method: "PATCH",
        headers: {
          origin: "https://game.example",
          "x-cs2-admin-action": "1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ difficulty: "medium" }),
      }),
      adminEnv({}),
      { email: "admin@example.com" },
      new MemoryAdminRepository(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_DIFFICULTY" });
  });

  it("requires same-origin proof for mutations", async () => {
    const response = await handleAdminRequest(
      new Request("https://game.example/admin/api/questions", { method: "POST", body: new FormData() }),
      adminEnv({}),
      { email: "admin@example.com" },
      new MemoryAdminRepository(),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "ADMIN_MUTATION_FORBIDDEN" });
  });
});
