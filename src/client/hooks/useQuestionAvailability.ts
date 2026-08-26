import { useEffect, useMemo, useState } from "react";
import type { MapId } from "../../shared/maps";
import type { QuestionDifficulty } from "../../shared/questionDifficulty";
import type { QuestionAvailability } from "../../shared/roomSettings";

export function useQuestionAvailability(
  mapPool: readonly MapId[],
  difficultyPool: readonly QuestionDifficulty[],
  enabled = true,
) {
  const filterKey = useMemo(
    () => `${mapPool.join(",")}|${difficultyPool.join(",")}`,
    [difficultyPool, mapPool],
  );
  const [availability, setAvailability] = useState<QuestionAvailability | null>(null);
  const [resolvedFilterKey, setResolvedFilterKey] = useState("");
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  useEffect(() => {
    if (!enabled || mapPool.length === 0 || difficultyPool.length === 0) {
      setAvailability(null);
      setResolvedFilterKey("");
      setCheckingAvailability(false);
      setAvailabilityError("");
      return;
    }

    const controller = new AbortController();
    const requestedFilterKey = filterKey;
    setAvailability(null);
    setResolvedFilterKey("");
    setCheckingAvailability(true);
    setAvailabilityError("");
    void fetch("/api/questions/availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mapPool, difficultyPool }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Question bank unavailable");
      const data = await response.json() as QuestionAvailability;
      if (!controller.signal.aborted) {
        setAvailability(data);
        setResolvedFilterKey(requestedFilterKey);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setAvailabilityError(error instanceof Error ? error.message : "Question bank unavailable");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setCheckingAvailability(false);
    });
    return () => controller.abort();
  }, [difficultyPool, enabled, filterKey, mapPool]);

  const availabilityIsCurrent = resolvedFilterKey === filterKey;
  return {
    availability: availabilityIsCurrent ? availability : null,
    checkingAvailability: enabled && (checkingAvailability || !availabilityIsCurrent),
    availabilityError,
  };
}
