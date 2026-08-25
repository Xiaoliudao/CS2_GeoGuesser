import { describe, expect, it } from "vitest";
import type { AdminQuestion } from "../../shared/adminQuestions";
import type { ServerQuestion } from "../game/questions";
import type { PublishQuestionInput, QuestionListItem } from "../questions/QuestionRepository";
import {
  detectImageType,
  handleAdminRequest,
  requireNormalizedPoint,
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
    expect(body.question).toMatchObject({ mapId: "ancient", layerId: "main", correctPoint: { x: 0.25, y: 0.75 }, enabled: true });
    expect(body.question.imageUrl).toBe(`/media/questions/${body.question.id}`);
    expect(repository.questions[0].imageAssetKey).toMatch(/^questions\/q-[a-f0-9]{16}\.jpg$/);
    expect(events[0]).toMatch(/^put:questions\/q-[a-f0-9]{16}\.jpg:image\/jpeg$/);
    expect(events[1]).toMatch(/^head:questions\/q-[a-f0-9]{16}\.jpg$/);
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
