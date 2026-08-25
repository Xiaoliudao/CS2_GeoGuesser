import { useCallback, useEffect, useMemo, useState } from "react";
import { MAPS } from "../../shared/maps";
import { radarMediaUrl } from "../../shared/mediaUrls";
import type { SoloSessionState } from "../../shared/solo";
import { ImagePreloadError, preloadImage } from "../lib/preloadImage";

export type SoloAssetLoadState = "idle" | "loading" | "ready" | "error";

export function useSoloRoundPreparation(
  session: SoloSessionState | null,
  onReady: (round: number, questionId: string, loadMs: number) => Promise<SoloSessionState | null>,
) {
  const [loadState, setLoadState] = useState<SoloAssetLoadState>("idle");
  const [errorReason, setErrorReason] = useState<ImagePreloadError["reason"] | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const question = session?.currentQuestion ?? null;
  const preparationKey = session?.status === "round_preparing" && question
    ? `${session.generation}:${session.round}:${question.questionId}`
    : "";
  const radarUrls = useMemo(() => {
    if (!session) return [];
    return MAPS
      .filter((map) => session.settings.mapPool.includes(map.id))
      .flatMap((map) => map.layers.map((layer) => radarMediaUrl(map.id, layer.id, session.assetOrigin)));
  }, [session?.assetOrigin, session?.settings.mapPool.join(",")]);

  useEffect(() => {
    if (!session || session.status !== "round_preparing" || !question || !preparationKey) {
      setLoadState("idle");
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
    ]).then(async () => {
      if (controller.signal.aborted) return;
      const loadMs = Math.max(0, Math.min(120_000, Math.round(performance.now() - startedAt)));
      const next = await onReady(session.round, question.questionId, loadMs);
      if (controller.signal.aborted) return;
      if (next) setLoadState("ready");
      else {
        setLoadState("error");
        setErrorReason("NETWORK");
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setLoadState("error");
      setErrorReason(error instanceof ImagePreloadError ? error.reason : "NETWORK");
    });
    return () => controller.abort();
  }, [onReady, preparationKey, question?.imageUrl, radarUrls, retryNonce, session?.round, session?.status]);

  useEffect(() => {
    const nextQuestion = session?.nextQuestion;
    if (!session || !nextQuestion || (session.status !== "playing" && session.status !== "round_result")) return;
    const controller = new AbortController();
    void preloadImage(nextQuestion.imageUrl, { signal: controller.signal }).catch((error: unknown) => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      console.warn(JSON.stringify({ event: "SOLO_NEXT_QUESTION_PREFETCH_FAILED" }));
    });
    return () => controller.abort();
  }, [session?.generation, session?.nextQuestion?.questionId, session?.nextQuestion?.imageUrl, session?.status]);

  const retry = useCallback(() => setRetryNonce((current) => current + 1), []);
  return { loadState, errorReason, retry };
}
