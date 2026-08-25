import type { AdminQuestion } from "../../shared/adminQuestions";
import { getMap, getRadarLayer, MAP_IDS, type MapId, type RadarLayerId } from "../../shared/maps";
import type { MapPoint } from "../../shared/types";
import type { Env } from "../env";
import type { ServerQuestion } from "../game/questions";
import { QuestionRepository, type PublishQuestionInput, type QuestionListItem } from "../questions/QuestionRepository";
import type { AccessIdentity } from "./accessAuth";

export const MAX_ADMIN_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_ADMIN_REQUEST_BYTES = MAX_ADMIN_IMAGE_BYTES + 64 * 1024;
const MAX_JSON_BYTES = 8 * 1024;
const OPAQUE_QUESTION_ID = /^[A-Za-z0-9_-]{12,80}$/;
const ADMIN_MUTATION_HEADER = "x-cs2-admin-action";

type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

export interface AdminQuestionRepository {
  list(): Promise<QuestionListItem[]>;
  getListItemById(questionId: string): Promise<QuestionListItem | null>;
  contentHashExists(contentHash: string): Promise<boolean>;
  publish(input: PublishQuestionInput): Promise<ServerQuestion>;
  updatePoint(questionId: string, point: MapPoint, coordinateSource: ServerQuestion["coordinateSource"]): Promise<boolean>;
  setEnabled(questionId: string, enabled: boolean): Promise<boolean>;
}

interface AdminAssetStore {
  put(
    key: string,
    value: ArrayBuffer,
    options: {
      httpMetadata: { contentType: string; cacheControl: string };
      customMetadata: Record<string, string>;
      sha256: ArrayBuffer;
    },
  ): Promise<unknown | null>;
  head(key: string): Promise<unknown | null>;
  delete(key: string): Promise<void>;
}

class AdminRequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function adminJson(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(data, { ...init, headers });
}

function questionDto(question: QuestionListItem): AdminQuestion {
  const layer = getRadarLayer(question.mapId, question.layerId);
  if (!layer) throw new Error(`QUESTION_DATABASE_INVALID_LAYER ${question.mapId}/${question.layerId}`);
  return {
    id: question.id,
    mapId: question.mapId,
    layerId: question.layerId,
    correctPoint: question.correctPoint,
    ...(question.automaticPoint ? { automaticPoint: question.automaticPoint } : {}),
    ...(question.worldPosition ? { worldPosition: question.worldPosition } : {}),
    ...(question.viewAngle ? { viewAngle: question.viewAngle } : {}),
    coordinateSource: question.coordinateSource,
    enabled: question.enabled,
    contentHash: question.contentHash,
    sourcePreviewId: question.sourcePreviewId,
    imageUrl: `/media/questions/${encodeURIComponent(question.id)}`,
    radarUrl: layer.radarUrl,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

function requireSameOriginMutation(request: Request): void {
  const requestUrl = new URL(request.url);
  if (
    request.headers.get(ADMIN_MUTATION_HEADER) !== "1"
    || request.headers.get("origin") !== requestUrl.origin
  ) {
    throw new AdminRequestError(403, "ADMIN_MUTATION_FORBIDDEN");
  }
}

function parseContentLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new AdminRequestError(400, "INVALID_CONTENT_LENGTH");
  return parsed;
}

function requireString(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminRequestError(400, `INVALID_${key.toUpperCase()}`);
  }
  return value.trim();
}

function optionalNumber(form: FormData, key: string): number | undefined {
  const value = form.get(key);
  if (value === null || value === "") return undefined;
  if (typeof value !== "string") throw new AdminRequestError(400, `INVALID_${key.toUpperCase()}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AdminRequestError(400, `INVALID_${key.toUpperCase()}`);
  return parsed;
}

function requiredNumber(form: FormData, key: string): number {
  const value = optionalNumber(form, key);
  if (value === undefined) throw new AdminRequestError(400, `INVALID_${key.toUpperCase()}`);
  return value;
}

export function requireNormalizedPoint(x: number, y: number): MapPoint {
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new AdminRequestError(400, "INVALID_CORRECT_POINT");
  return { x, y };
}

function requireMapAndLayer(mapValue: string, layerValue: string): { mapId: MapId; layerId: RadarLayerId } {
  if (!MAP_IDS.includes(mapValue as MapId)) throw new AdminRequestError(400, "INVALID_MAP_ID");
  const mapId = mapValue as MapId;
  const layer = getRadarLayer(mapId, layerValue);
  if (!layer) throw new AdminRequestError(400, "INVALID_LAYER_ID");
  return { mapId, layerId: layer.id };
}

export function detectImageType(bytes: Uint8Array): SupportedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

function extensionForImageType(contentType: SupportedImageType): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return "webp";
}

function hexDigest(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function optionalTriple(
  first: number | undefined,
  second: number | undefined,
  third: number | undefined,
  errorCode: string,
): [number, number, number] | undefined {
  if (first === undefined && second === undefined && third === undefined) return undefined;
  if (first === undefined || second === undefined || third === undefined) throw new AdminRequestError(400, errorCode);
  return [first, second, third];
}

async function readSmallJson(request: Request): Promise<unknown> {
  const contentLength = parseContentLength(request);
  if (contentLength !== null && contentLength > MAX_JSON_BYTES) throw new AdminRequestError(413, "ADMIN_JSON_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new AdminRequestError(413, "ADMIN_JSON_TOO_LARGE");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdminRequestError(400, "INVALID_JSON");
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminRequestError(400, "INVALID_JSON");
  return value as Record<string, unknown>;
}

async function createQuestion(
  request: Request,
  store: AdminAssetStore,
  repository: AdminQuestionRepository,
): Promise<Response> {
  requireSameOriginMutation(request);
  const contentLength = parseContentLength(request);
  if (contentLength !== null && contentLength > MAX_ADMIN_REQUEST_BYTES) {
    throw new AdminRequestError(413, "QUESTION_UPLOAD_TOO_LARGE");
  }

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) throw new AdminRequestError(400, "QUESTION_IMAGE_REQUIRED");
  if (image.size > MAX_ADMIN_IMAGE_BYTES) throw new AdminRequestError(413, "QUESTION_IMAGE_TOO_LARGE");

  const mapAndLayer = requireMapAndLayer(requireString(form, "mapId"), requireString(form, "layerId"));
  const correctPoint = requireNormalizedPoint(requiredNumber(form, "correctX"), requiredNumber(form, "correctY"));
  const coordinateSource = requireString(form, "coordinateSource");
  if (coordinateSource !== "world-conversion" && coordinateSource !== "manual-override") {
    throw new AdminRequestError(400, "INVALID_COORDINATE_SOURCE");
  }

  const automaticX = optionalNumber(form, "automaticX");
  const automaticY = optionalNumber(form, "automaticY");
  if ((automaticX === undefined) !== (automaticY === undefined)) throw new AdminRequestError(400, "INVALID_AUTOMATIC_POINT");
  const automaticPoint = automaticX === undefined || automaticY === undefined
    ? undefined
    : requireNormalizedPoint(automaticX, automaticY);
  const world = optionalTriple(
    optionalNumber(form, "worldX"),
    optionalNumber(form, "worldY"),
    optionalNumber(form, "worldZ"),
    "INVALID_WORLD_POSITION",
  );
  const pitch = optionalNumber(form, "viewPitch");
  const yaw = optionalNumber(form, "viewYaw");
  const roll = optionalNumber(form, "viewRoll");
  if ((pitch === undefined) !== (yaw === undefined) || (roll !== undefined && pitch === undefined)) {
    throw new AdminRequestError(400, "INVALID_VIEW_ANGLE");
  }
  if (coordinateSource === "world-conversion" && (!automaticPoint || !world)) {
    throw new AdminRequestError(400, "WORLD_CONVERSION_METADATA_REQUIRED");
  }

  const imageBuffer = await image.arrayBuffer();
  const detectedType = detectImageType(new Uint8Array(imageBuffer));
  if (!detectedType || image.type !== detectedType) throw new AdminRequestError(415, "UNSUPPORTED_OR_MISMATCHED_IMAGE_TYPE");
  const digest = await crypto.subtle.digest("SHA-256", imageBuffer);
  const contentHash = hexDigest(digest);
  if (await repository.contentHashExists(contentHash)) throw new AdminRequestError(409, "QUESTION_IMAGE_ALREADY_EXISTS");

  const id = `q-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const imageAssetKey = `questions/${id}.${extensionForImageType(detectedType)}`;
  let uploaded = false;
  try {
    const object = await store.put(imageAssetKey, imageBuffer, {
      httpMetadata: {
        contentType: detectedType,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { questionId: id, uploadedBy: "admin-question-editor" },
      sha256: digest,
    });
    if (!object) throw new Error("R2_QUESTION_UPLOAD_FAILED");
    uploaded = true;
    if (!await store.head(imageAssetKey)) throw new Error("R2_QUESTION_UPLOAD_NOT_VISIBLE");

    const question: ServerQuestion = {
      id,
      imageAssetKey,
      correctMapId: mapAndLayer.mapId,
      correctLayerId: mapAndLayer.layerId,
      correctPoint,
      ...(automaticPoint ? { automaticPoint } : {}),
      ...(world ? { worldPosition: { x: world[0], y: world[1], z: world[2] } } : {}),
      ...(pitch !== undefined && yaw !== undefined
        ? { viewAngle: { pitch, yaw, roll: roll ?? 0 } }
        : {}),
      coordinateSource,
    };
    await repository.publish({
      ...question,
      contentHash,
      sourcePreviewId: null,
      enabled: form.get("enabled") !== "false",
    });
    const created = await repository.getListItemById(id);
    if (!created) throw new Error("QUESTION_CREATED_ROW_MISSING");
    return adminJson({ question: questionDto(created) }, { status: 201 });
  } catch (error) {
    if (uploaded) await store.delete(imageAssetKey);
    throw error;
  }
}

async function updatePoint(request: Request, repository: AdminQuestionRepository, questionId: string): Promise<Response> {
  requireSameOriginMutation(request);
  const body = objectRecord(await readSmallJson(request));
  if (typeof body.x !== "number" || typeof body.y !== "number") throw new AdminRequestError(400, "INVALID_CORRECT_POINT");
  const point = requireNormalizedPoint(body.x, body.y);
  if (!await repository.updatePoint(questionId, point, "manual-override")) {
    throw new AdminRequestError(404, "QUESTION_NOT_FOUND");
  }
  const updated = await repository.getListItemById(questionId);
  if (!updated) throw new AdminRequestError(404, "QUESTION_NOT_FOUND");
  return adminJson({ question: questionDto(updated) });
}

async function updateEnabled(request: Request, repository: AdminQuestionRepository, questionId: string): Promise<Response> {
  requireSameOriginMutation(request);
  const body = objectRecord(await readSmallJson(request));
  if (typeof body.enabled !== "boolean") throw new AdminRequestError(400, "INVALID_ENABLED_VALUE");
  const existing = await repository.getListItemById(questionId);
  if (!existing) throw new AdminRequestError(404, "QUESTION_NOT_FOUND");
  if (existing.enabled !== body.enabled) await repository.setEnabled(questionId, body.enabled);
  const updated = await repository.getListItemById(questionId);
  if (!updated) throw new AdminRequestError(404, "QUESTION_NOT_FOUND");
  return adminJson({ question: questionDto(updated) });
}

export async function handleAdminRequest(
  request: Request,
  env: Env,
  identity: AccessIdentity,
  repository: AdminQuestionRepository = new QuestionRepository(env.QUESTIONS_DB),
): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/admin/api/session" && request.method === "GET") {
      return adminJson({ email: identity.email });
    }
    if (url.pathname === "/admin/api/questions" && request.method === "GET") {
      const questions = await repository.list();
      return adminJson({ questions: questions.map(questionDto) });
    }
    if (url.pathname === "/admin/api/questions" && request.method === "POST") {
      return await createQuestion(request, env.GAME_ASSETS, repository);
    }

    const pointMatch = url.pathname.match(/^\/admin\/api\/questions\/([^/]+)\/point$/);
    if (pointMatch && request.method === "PATCH") {
      if (!OPAQUE_QUESTION_ID.test(pointMatch[1])) throw new AdminRequestError(400, "INVALID_QUESTION_ID");
      return await updatePoint(request, repository, pointMatch[1]);
    }
    const enabledMatch = url.pathname.match(/^\/admin\/api\/questions\/([^/]+)\/enabled$/);
    if (enabledMatch && request.method === "PATCH") {
      if (!OPAQUE_QUESTION_ID.test(enabledMatch[1])) throw new AdminRequestError(400, "INVALID_QUESTION_ID");
      return await updateEnabled(request, repository, enabledMatch[1]);
    }
    return adminJson({ error: "ADMIN_ROUTE_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    if (error instanceof AdminRequestError) return adminJson({ error: error.code }, { status: error.status });
    console.error(JSON.stringify({
      error: "ADMIN_QUESTION_REQUEST_FAILED",
      operation: `${request.method} ${url.pathname}`,
      actor: identity.email,
      message: error instanceof Error ? error.message : String(error),
    }));
    return adminJson({ error: "ADMIN_QUESTION_REQUEST_FAILED" }, { status: 500 });
  }
}

export function mapOptionsForAdmin(): { id: MapId; name: string; layers: readonly { id: RadarLayerId; name: string }[] }[] {
  return MAP_IDS.map((mapId) => {
    const map = getMap(mapId);
    return { id: map.id, name: map.name, layers: map.layers };
  });
}
