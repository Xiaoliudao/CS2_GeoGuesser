import { useCallback, useEffect, useMemo, useState } from "react";
import { MAPS } from "../../shared/maps";
import { radarMediaUrl } from "../../shared/mediaUrls";
import type { ClientEvent } from "../../shared/protocol";
import type { GameRoomState } from "../../shared/types";
import { ImagePreloadError, preloadImage } from "../lib/preloadImage";

export type RoundAssetLoadState = "idle" | "loading" | "ready" | "error";

export function useRoundPreparation(
  room: GameRoomState | null,
  playerId: string,
  send: (event: ClientEvent) => boolean,
) {
  const [loadState, setLoadState] = useState<RoundAssetLoadState>("idle");
  const [errorReason, setErrorReason] = useState<ImagePreloadError["reason"] | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const question = room?.currentQuestion ?? null;
  const me = room?.players.find((player) => player.id === playerId);
  const preparationKey = room?.status === "round_preparing" && question
    ? `${room.round}:${question.questionId}:${room.assetPrepareAttempt}`
    : "";
  const radarUrls = useMemo(() => {
    if (!room) return [];
    return MAPS
      .filter((map) => room.settings.mapPool.includes(map.id))
      .flatMap((map) => map.layers.map((layer) => radarMediaUrl(map.id, layer.id, room.assetOrigin)));
  }, [room?.assetOrigin, room?.settings.mapPool.join(",")]);

  useEffect(() => {
    if (!room || room.status !== "round_preparing" || !question || !preparationKey || me?.active === false) {
      setLoadState("idle");
      setErrorReason(null);
      return;
    }
    if (me?.assetReady) {
      setLoadState("ready");
      setErrorReason(null);
      return;
    }

    const controller = new AbortController();
    const startedAt = performance.now();
    setLoadState("loading");
    setErrorReason(null);
    void Promise.all([
      preloadImage(question.imageUrl, { signal: controller.signal }),
      ...radarUrls.map((url) => preloadImage(url, { signal: controller.signal })),
    ]).then(() => {
      if (controller.signal.aborted) return;
      const loadMs = Math.max(0, Math.min(120_000, Math.round(performance.now() - startedAt)));
      const sent = send({
        type: "round:asset-ready",
        payload: { round: room.round, questionId: question.questionId, loadMs },
      });
      if (sent) setLoadState("ready");
      console.info(JSON.stringify({ event: "QUESTION_ASSET_READY", round: room.round, loadMs }));
    }).catch((error: unknown) => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      const reason = error instanceof ImagePreloadError ? error.reason : "NETWORK";
      setLoadState("error");
      setErrorReason(reason);
      send({
        type: "round:asset-error",
        payload: { round: room.round, questionId: question.questionId, reason },
      });
      console.warn(JSON.stringify({ event: "QUESTION_ASSET_ERROR", round: room.round, reason }));
    });
    return () => controller.abort();
  }, [me?.active, me?.assetReady, preparationKey, question?.imageUrl, radarUrls, retryNonce, room?.round, room?.status, send]);

  useEffect(() => {
    const nextQuestion = room?.nextQuestion;
    if (!room || !nextQuestion || me?.active === false || (room.status !== "playing" && room.status !== "round_result")) return;
    const controller = new AbortController();
    void preloadImage(nextQuestion.imageUrl, { signal: controller.signal })
      .then((result) => console.info(JSON.stringify({ event: "NEXT_QUESTION_PREFETCHED", loadMs: result.elapsedMs })))
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        console.warn(JSON.stringify({ event: "NEXT_QUESTION_PREFETCH_FAILED" }));
      });
    return () => controller.abort();
  }, [me?.active, room?.nextQuestion?.questionId, room?.nextQuestion?.imageUrl, room?.status]);

  const retry = useCallback(() => setRetryNonce((current) => current + 1), []);
  return { loadState, errorReason, retry };
}
