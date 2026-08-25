interface MediaObject {
  readonly body: ReadableStream;
  readonly httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

interface MediaStore {
  get(key: string): Promise<MediaObject | null>;
}

interface QuestionMediaRepository {
  getImageAssetKey(questionId: string): Promise<string | null>;
}

export function radarObjectKey(mapId: string, layerId: string): string {
  return `radars/${mapId}/${layerId}.webp`;
}

export function questionObjectKey(assetId: string): string {
  return `questions/${assetId}.webp`;
}

export async function mediaResponse(
  request: Request,
  store: MediaStore,
  key: string,
  cacheControl: string,
  missingResponse?: () => Response,
): Promise<Response> {
  const object = await store.get(key);
  if (!object) {
    const error = { error: "R2_OBJECT_NOT_FOUND", binding: "GAME_ASSETS", key };
    console.error(JSON.stringify(error));
    if (missingResponse) return missingResponse();
    return Response.json(error, {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }
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

export async function questionMediaResponse(
  request: Request,
  repository: QuestionMediaRepository,
  store: MediaStore,
  questionId: string,
): Promise<Response> {
  const imageAssetKey = await repository.getImageAssetKey(questionId);
  if (!imageAssetKey) {
    return Response.json(
      { error: "QUESTION_NOT_FOUND", questionId },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  return mediaResponse(
    request,
    store,
    imageAssetKey,
    "public, max-age=31536000, immutable",
    () => Response.json(
      { error: "QUESTION_MEDIA_NOT_FOUND", questionId },
      { status: 404, headers: { "cache-control": "no-store" } },
    ),
  );
}
