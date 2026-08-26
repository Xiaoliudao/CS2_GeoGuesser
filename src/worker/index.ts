import { playerIdSchema, roomCodeSchema } from "../shared/schemas";
import { getRadarLayer, MAP_IDS } from "../shared/maps";
import { CreateSoloSessionRequestSchema, SoloSessionIdSchema } from "../shared/solo";
import {
  CreateRoomRequestSchema,
  QuestionAvailabilityRequestSchema,
  roomSettingsValidationErrorCode,
  type CreateRoomRequest,
  type RoomSettings,
  type ServerRegion,
} from "../shared/roomSettings";
import { authenticateAdminRequest } from "./admin/accessAuth";
import { handleAdminRequest } from "./admin/adminQuestions";
import { GameRoom } from "./durableObjects/GameRoom";
import { SoloSession, type SoloRpcResult } from "./durableObjects/SoloSession";
import type { Env } from "./env";
import { mediaResponse, questionMediaResponse, radarObjectKey } from "./media";
import { QuestionRepository } from "./questions/QuestionRepository";
import { faviconResponse, isNoIndexPath, isSpaDocumentPath, robotsResponse, sitemapResponse, spaDocumentResponse, withNoIndex } from "./seo";

const OPAQUE_QUESTION_ID = /^[A-Za-z0-9_-]{12,80}$/;

const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => ROOM_CODE_CHARACTERS[byte % ROOM_CODE_CHARACTERS.length]).join("");
}

function roomStub(env: Env, roomCode: string, serverRegion: ServerRegion = "auto"): DurableObjectStub<GameRoom> {
  const id = env.GAME_ROOM.idFromName(`ROOM:${roomCode}`);
  return serverRegion === "asia"
    ? env.GAME_ROOM.get(id, { locationHint: "apac" })
    : env.GAME_ROOM.get(id);
}

function soloStub(env: Env, sessionId: string): DurableObjectStub<SoloSession> | null {
  const parsed = SoloSessionIdSchema.safeParse(sessionId);
  if (!parsed.success) return null;
  try {
    return env.SOLO_SESSION.get(env.SOLO_SESSION.idFromString(parsed.data));
  } catch {
    return null;
  }
}

const SOLO_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function soloRpcResponse(result: SoloRpcResult): Response {
  if (result.ok) return Response.json(result.state, { status: result.status, headers: SOLO_RESPONSE_HEADERS });
  return Response.json({
    error: result.error,
    ...(result.availableQuestions === undefined ? {} : { availableQuestions: result.availableQuestions }),
    ...(result.requestedRounds === undefined ? {} : { requestedRounds: result.requestedRounds }),
  }, { status: result.status, headers: SOLO_RESPONSE_HEADERS });
}

async function createSoloSession(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null);
  const parsed = CreateSoloSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_SOLO_SETTINGS" }, { status: 400, headers: SOLO_RESPONSE_HEADERS });
  }
  const id = env.SOLO_SESSION.newUniqueId();
  const result = await env.SOLO_SESSION.get(id).initialize({
    sessionId: id.toString(),
    nickname: parsed.data.nickname,
    settings: parsed.data.settings,
  });
  return soloRpcResponse(result);
}

async function handleSoloSessionRequest(
  request: Request,
  env: Env,
  sessionId: string,
  action: string | undefined,
): Promise<Response> {
  const stub = soloStub(env, sessionId);
  if (!stub) return Response.json({ error: "SOLO_SESSION_NOT_FOUND" }, { status: 404, headers: SOLO_RESPONSE_HEADERS });
  if (!action && request.method === "GET") return soloRpcResponse(await stub.getState());
  if (request.method !== "POST" || !action) {
    return Response.json({ error: "INVALID_SOLO_STATE" }, { status: 405, headers: SOLO_RESPONSE_HEADERS });
  }
  const body = await request.json().catch(() => null);
  if (action === "ready") return soloRpcResponse(await stub.assetReady(body));
  if (action === "hint") return soloRpcResponse(await stub.hint(body));
  if (action === "guess") return soloRpcResponse(await stub.guess(body));
  if (action === "next") return soloRpcResponse(await stub.next(body));
  if (action === "play-again") return soloRpcResponse(await stub.playAgain(body));
  return Response.json({ error: "INVALID_SOLO_STATE" }, { status: 404, headers: SOLO_RESPONSE_HEADERS });
}

function questionDatabaseUnavailable(operation: string, error: unknown): Response {
  console.error(JSON.stringify({
    error: "QUESTION_DATABASE_UNAVAILABLE",
    operation,
    message: error instanceof Error ? error.message : String(error),
  }));
  return Response.json(
    { error: "QUESTION_DATABASE_UNAVAILABLE", retryable: true },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

function invalidRoomSettingsResponse(error: Parameters<typeof roomSettingsValidationErrorCode>[0]): Response {
  const code = roomSettingsValidationErrorCode(error);
  return Response.json({ error: code }, { status: 400, headers: { "cache-control": "no-store" } });
}

async function initializeRoom(
  env: Env,
  roomCode: string,
  settings: RoomSettings,
  questionCount: number,
  creator: CreateRoomRequest["creator"],
): Promise<Response> {
  return roomStub(env, roomCode, settings.serverRegion).fetch(`https://game-room/initialize?roomCode=${roomCode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings, questionCount, creator }),
  });
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null);
  const parsed = CreateRoomRequestSchema.safeParse(body);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "creator")) {
      return Response.json(
        { error: "INVALID_PLAYER" },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    return invalidRoomSettingsResponse(parsed.error);
  }

  let availableQuestions: number;
  try {
    availableQuestions = await new QuestionRepository(env.QUESTIONS_DB).countEnabledForSelection(
      parsed.data.settings.mapPool,
      parsed.data.settings.difficultyPool,
    );
  } catch (error) {
    return questionDatabaseUnavailable("create-room-availability", error);
  }
  if (parsed.data.settings.totalRounds > availableQuestions) {
    return Response.json(
      {
        error: "NOT_ENOUGH_QUESTIONS",
        availableQuestions,
        requestedRounds: parsed.data.settings.totalRounds,
      },
      { status: 409, headers: { "cache-control": "no-store" } },
    );
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = generateRoomCode();
    const response = await initializeRoom(
      env,
      roomCode,
      parsed.data.settings,
      availableQuestions,
      parsed.data.creator,
    );
    if (response.status === 201) {
      return Response.json({ roomCode, settings: parsed.data.settings }, { status: 201 });
    }
    if (response.status !== 409) return new Response(response.body, { status: response.status, headers: response.headers });
  }
  return new Response("Unable to allocate a unique room code", { status: 503 });
}

async function questionAvailability(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null);
  const parsed = QuestionAvailabilityRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRoomSettingsResponse(parsed.error);
  try {
    const repository = new QuestionRepository(env.QUESTIONS_DB);
    const [availableQuestions, byMap, byDifficulty] = await Promise.all([
      repository.countEnabledForSelection(parsed.data.mapPool, parsed.data.difficultyPool),
      repository.countEnabledByMap(parsed.data.mapPool, parsed.data.difficultyPool),
      repository.countEnabledByDifficulty(parsed.data.mapPool, parsed.data.difficultyPool),
    ]);
    return Response.json(
      { availableQuestions, byMap, byDifficulty },
      { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
    );
  } catch (error) {
    return questionDatabaseUnavailable("question-availability", error);
  }
}

export async function routeRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/robots.txt" && (request.method === "GET" || request.method === "HEAD")) {
      return robotsResponse();
    }

    if (url.pathname === "/sitemap.xml" && (request.method === "GET" || request.method === "HEAD")) {
      return sitemapResponse();
    }

    if (url.pathname === "/favicon.svg" && (request.method === "GET" || request.method === "HEAD")) {
      return faviconResponse();
    }

    if (url.pathname === "/seo/og-image.jpg" && (request.method === "GET" || request.method === "HEAD")) {
      return mediaResponse(request, env.GAME_ASSETS, "seo/og-image.jpg", "public, max-age=86400, s-maxage=604800");
    }

    if (url.pathname.startsWith("/admin/api/")) {
      const authentication = await authenticateAdminRequest(request, env);
      if (!authentication.ok) return authentication.response;
      return handleAdminRequest(request, env, authentication.identity);
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      return createRoom(request, env);
    }

    if (url.pathname === "/api/solo" && request.method === "POST") {
      return createSoloSession(request, env);
    }

    const soloSessionMatch = url.pathname.match(/^\/api\/solo\/([a-f0-9]{64})(?:\/(ready|hint|guess|next|play-again))?$/);
    if (soloSessionMatch) {
      return handleSoloSessionRequest(request, env, soloSessionMatch[1], soloSessionMatch[2]);
    }

    if (url.pathname === "/api/questions/availability" && request.method === "POST") {
      return questionAvailability(request, env);
    }

    if (url.pathname === "/api/questions/meta" && request.method === "GET") {
      try {
        const repository = new QuestionRepository(env.QUESTIONS_DB);
        const [count, catalog] = await Promise.all([repository.countEnabled(), repository.getCatalogMeta()]);
        return Response.json(
          { count, version: catalog.version },
          { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
        );
      } catch (error) {
        return questionDatabaseUnavailable("questions-meta", error);
      }
    }

    const radarMediaMatch = url.pathname.match(/^\/media\/radars\/([a-z0-9]+)\/([a-z0-9-]+)$/);
    if (radarMediaMatch && request.method === "GET") {
      const mapId = radarMediaMatch[1];
      const layerId = radarMediaMatch[2];
      if (!MAP_IDS.includes(mapId as (typeof MAP_IDS)[number]) || !getRadarLayer(mapId as (typeof MAP_IDS)[number], layerId)) {
        return new Response("Unknown radar", { status: 404 });
      }
      return mediaResponse(request, env.GAME_ASSETS, radarObjectKey(mapId, layerId), "public, max-age=31536000, immutable");
    }

    const questionMediaMatch = url.pathname.match(/^\/media\/questions\/([^/]+)$/);
    if (questionMediaMatch && request.method === "GET") {
      const questionId = questionMediaMatch[1];
      if (!OPAQUE_QUESTION_ID.test(questionId)) return new Response("Invalid question id", { status: 400 });
      try {
        return questionMediaResponse(
          request,
          new QuestionRepository(env.QUESTIONS_DB),
          env.GAME_ASSETS,
          questionId,
        );
      } catch (error) {
        return questionDatabaseUnavailable("question-media", error);
      }
    }

    const roomPreviewMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/preview$/);
    if (roomPreviewMatch && request.method === "GET") {
      const parsed = roomCodeSchema.safeParse(roomPreviewMatch[1]);
      if (!parsed.success) {
        return Response.json({ error: "INVALID_ROOM_CODE" }, {
          status: 400,
          headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
        });
      }
      const viewerPlayerId = playerIdSchema.safeParse(request.headers.get("x-cs2-player-id"));
      const headers = new Headers({
        accept: "application/json",
        "x-room-code": parsed.data,
      });
      if (viewerPlayerId.success) headers.set("x-viewer-player-id", viewerPlayerId.data);
      const response = await roomStub(env, parsed.data).fetch("https://game-room/preview", { headers });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    const roomApiMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if (roomApiMatch && request.method === "GET") {
      const parsed = roomCodeSchema.safeParse(roomApiMatch[1]);
      if (!parsed.success) return Response.json({ exists: false }, { status: 400 });
      const response = await roomStub(env, parsed.data).fetch("https://game-room/exists");
      const data = (await response.json()) as { exists: boolean };
      return Response.json(data, { status: data.exists ? 200 : 404 });
    }

    const webSocketMatch = url.pathname.match(/^\/ws\/([^/]+)$/);
    if (webSocketMatch) {
      const parsed = roomCodeSchema.safeParse(webSocketMatch[1]);
      if (!parsed.success) return new Response("Invalid room code", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      const forwardedUrl = new URL("https://game-room/websocket");
      return roomStub(env, parsed.data).fetch(new Request(forwardedUrl, request));
    }

    const isDocumentRequest = request.method === "GET" || request.method === "HEAD";
    if (isDocumentRequest && isSpaDocumentPath(url.pathname, import.meta.env.DEV)) {
      return spaDocumentResponse(request, env.ASSETS);
    }

    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=UTF-8", "X-Content-Type-Options": "nosniff" },
    });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const response = await routeRequest(request, env);
    return isNoIndexPath(pathname) ? withNoIndex(response) : response;
  },
};

export { GameRoom, SoloSession };
