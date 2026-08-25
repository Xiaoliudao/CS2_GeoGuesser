import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { listQaPreviewQuestions, publishPreviewQuestion, saveQuestionOverride } from "./question-workflow.ts";
import { listRemoteQuestions, setRemoteQuestionEnabled, updateRemoteQuestionPoint } from "./question-d1-admin.ts";
import type { MapPoint } from "../../src/shared/types.ts";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 16 * 1024) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isLocalMutation(request: IncomingMessage): boolean {
  const host = request.headers.host?.split(":")[0];
  return request.headers["x-cs2-dev-action"] === "1" && (host === "127.0.0.1" || host === "localhost");
}

export function questionDevServerPlugin(): Plugin {
  return {
    name: "cs2-question-dev-server",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/__dev_api__/questions" && request.method === "GET") {
          try {
            const published = listRemoteQuestions();
            const publishedSources = new Set(published.map((question) => question.source_preview_id).filter(Boolean));
            const questions = listQaPreviewQuestions().filter((question) => !publishedSources.has(question.previewId));
            sendJson(response, 200, { questions, published });
          } catch (error) {
            sendJson(response, 503, {
              error: "QUESTION_DATABASE_UNAVAILABLE",
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        const publishedAction = url.pathname.match(/^\/__dev_api__\/published\/([^/]+)\/(enable|disable|point)$/);
        if (publishedAction) {
          if (!isLocalMutation(request)) {
            sendJson(response, 403, { error: "LOCAL_DEV_ACTION_REQUIRED" });
            return;
          }
          const questionId = decodeURIComponent(publishedAction[1]);
          try {
            if ((publishedAction[2] === "enable" || publishedAction[2] === "disable") && request.method === "POST") {
              const changed = setRemoteQuestionEnabled(questionId, publishedAction[2] === "enable");
              sendJson(response, 200, { changed, published: listRemoteQuestions() });
              return;
            }
            if (publishedAction[2] === "point" && request.method === "POST") {
              const body = await readJsonBody(request) as { point?: MapPoint };
              if (!body.point) throw new Error("POINT_REQUIRED");
              updateRemoteQuestionPoint(questionId, body.point.x, body.point.y);
              sendJson(response, 200, { changed: true, published: listRemoteQuestions() });
              return;
            }
            sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const action = url.pathname.match(/^\/__dev_api__\/questions\/([^/]+)\/(override|publish)$/);
        if (!action) {
          next();
          return;
        }
        if (!isLocalMutation(request)) {
          sendJson(response, 403, { error: "LOCAL_DEV_ACTION_REQUIRED" });
          return;
        }
        const previewId = decodeURIComponent(action[1]);
        try {
          if (action[2] === "override" && request.method === "POST") {
            const body = await readJsonBody(request) as { point?: MapPoint };
            sendJson(response, 200, { question: saveQuestionOverride(previewId, body.point ?? null) });
            return;
          }
          if (action[2] === "override" && request.method === "DELETE") {
            sendJson(response, 200, { question: saveQuestionOverride(previewId, null) });
            return;
          }
          if (action[2] === "publish" && request.method === "POST") {
            const result = await publishPreviewQuestion(previewId);
            sendJson(response, 200, { result, questions: listQaPreviewQuestions() });
            return;
          }
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}
