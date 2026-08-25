import { listQaPreviewQuestions, loadPendingQuestions, publishPreviewQuestion } from "./question-workflow";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pending = loadPendingQuestions();
  const previews = listQaPreviewQuestions();
  let published = 0;
  let remaining = 0;
  for (const entry of pending) {
    if (dryRun) {
      const preview = previews.find((question) => question.previewId === entry.sourceId);
      const point = preview?.finalPoint ?? entry.question.correctPoint;
      const coordinateSource = preview?.manualOverride ? "manual-override" : "world-conversion";
      console.log(`PENDING source=${entry.sourceId} question=${entry.question.id} point=${point.x},${point.y} coordinateSource=${coordinateSource}`);
      remaining += 1;
      continue;
    }
    const result = await publishPreviewQuestion(entry.sourceId);
    if (result.status === "published") {
      published += 1;
      console.log(`PUBLISHED source=${entry.sourceId} question=${result.questionId}`);
    } else {
      remaining += 1;
      console.log(`PUBLISH_PENDING_R2 source=${entry.sourceId} ${result.message ?? ""}`.trim());
    }
  }
  console.log(`PUBLISH_PENDING_COMPLETE Published: ${published} Remaining: ${remaining} DryRun: ${dryRun}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
