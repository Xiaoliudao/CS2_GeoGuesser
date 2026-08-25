export const ASSET_PREPARE_TIMEOUT_MS = 15_000;
export const MAX_ASSET_PREPARE_RETRIES = 2;

export interface AssetReportContext {
  status: string;
  reportedRound: number;
  currentRound: number;
  reportedQuestionId: string;
  currentQuestionId: string | null;
}

export function isValidAssetReport(context: AssetReportContext): boolean {
  return context.status === "round_preparing"
    && context.reportedRound === context.currentRound
    && context.currentQuestionId !== null
    && context.reportedQuestionId === context.currentQuestionId;
}

export function allPlayersAssetReady(playerIds: readonly string[], readiness: Readonly<Record<string, boolean>>): boolean {
  return playerIds.length > 0 && playerIds.every((playerId) => readiness[playerId] === true);
}

export function hasAssetPrepareTimedOut(prepareDeadline: number | null, now: number): boolean {
  return prepareDeadline !== null && now >= prepareDeadline;
}

export function canRetryAssetPreparation(
  currentAttempt: number,
  nextQuestionIndex: number,
  questionCount: number,
): boolean {
  return currentAttempt < MAX_ASSET_PREPARE_RETRIES && nextQuestionIndex < questionCount;
}
