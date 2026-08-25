import { roomCodeSchema } from "../shared/schemas";
import { getRadarLayer, MAP_IDS } from "../shared/maps";
import { authenticateAdminRequest } from "./admin/accessAuth";
import { handleAdminRequest } from "./admin/adminQuestions";
import { GameRoom } from "./durableObjects/GameRoom";
import type { Env } from "./env";
import { mediaResponse, questionMediaResponse, radarObjectKey } from "./media";
import { QuestionRepository } from "./questions/QuestionRepository";

const OPAQUE_QUESTION_ID = /^[A-Za-z0-9_-]{12,80}$/;

const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => ROOM_CODE_CHARACTERS[byte % ROOM_CODE_CHARACTERS.length]).join("");
}

function roomStub(env: Env, roomCode: string): DurableObjectStub<GameRoom> {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(`ROOM:${roomCode}`));
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

async function createRoom(env: Env): Promise<Response> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = generateRoomCode();
    const response = await roomStub(env, roomCode).fetch(`https://game-room/initialize?roomCode=${roomCode}`, {
      method: "POST",
    });
    if (response.status === 201) return Response.json({ roomCode }, { status: 201 });
    if (response.status !== 409) return new Response("Unable to create room", { status: 500 });
  }
  return new Response("Unable to allocate a unique room code", { status: 503 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/admin/api/")) {
      const authentication = await authenticateAdminRequest(request, env);
      if (!authentication.ok) return authentication.response;
      return handleAdminRequest(request, env, authentication.identity);
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      return createRoom(env);
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
      return mediaResponse(request, env.GAME_ASSETS, radarObjectKey(mapId, layerId), "public, max-age=86400, s-maxage=31536000, immutable");
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

    return new Response("Not found", { status: 404 });
  },
};

export { GameRoom };
