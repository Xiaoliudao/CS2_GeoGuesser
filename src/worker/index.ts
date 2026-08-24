import { roomCodeSchema } from "../shared/schemas";
import { getRadarLayer, MAP_IDS } from "../shared/maps";
import { GameRoom } from "./durableObjects/GameRoom";
import type { Env } from "./env";

const OPAQUE_ASSET_ID = /^[A-Za-z0-9_-]{12,80}$/;

const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => ROOM_CODE_CHARACTERS[byte % ROOM_CODE_CHARACTERS.length]).join("");
}

function roomStub(env: Env, roomCode: string): DurableObjectStub<GameRoom> {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(`ROOM:${roomCode}`));
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

async function mediaResponse(request: Request, env: Env, key: string, cacheControl: string): Promise<Response> {
  const object = await env.GAME_ASSETS.get(key);
  if (!object) return new Response("Media not found", { status: 404 });
  if (request.headers.get("if-none-match") === object.httpEtag) {
    return new Response(null, { status: 304, headers: { etag: object.httpEtag, "cache-control": cacheControl } });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", cacheControl);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      return createRoom(env);
    }

    const radarMediaMatch = url.pathname.match(/^\/media\/radars\/([a-z0-9]+)\/([a-z0-9-]+)$/);
    if (radarMediaMatch && request.method === "GET") {
      const mapId = radarMediaMatch[1];
      const layerId = radarMediaMatch[2];
      if (!MAP_IDS.includes(mapId as (typeof MAP_IDS)[number]) || !getRadarLayer(mapId as (typeof MAP_IDS)[number], layerId)) {
        return new Response("Unknown radar", { status: 404 });
      }
      return mediaResponse(request, env, `radars/${mapId}/${layerId}.webp`, "public, max-age=86400, s-maxage=31536000, immutable");
    }

    const questionMediaMatch = url.pathname.match(/^\/media\/questions\/([^/]+)$/);
    if (questionMediaMatch && request.method === "GET") {
      const assetId = questionMediaMatch[1];
      if (!OPAQUE_ASSET_ID.test(assetId)) return new Response("Invalid asset id", { status: 400 });
      return mediaResponse(request, env, `questions/${assetId}.webp`, "public, max-age=3600, s-maxage=31536000, immutable");
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
