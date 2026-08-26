import {
  listQaPreviewQuestions,
  loadPendingQuestions,
  previewIdentityAliases,
  publishPreviewQuestion,
  requireQuestionDifficultyForPublish,
} from "./question-workflow";

async function publishValidatedQuestions(dryRun: boolean): Promise<void> {
  const previews = listQaPreviewQuestions();
  const previouslyPublished = previews.filter((question) => question.status === "published").length;
  let published = 0;
  let skipped = previouslyPublished;
  let remaining = 0;
  let validCandidates = 0;

  for (const preview of previews) {
    if (preview.status === "published") {
      console.log(`SKIPPED ${preview.relativeSourcePath} DUPLICATE_OR_ALREADY_PUBLISHED`);
      continue;
    }
    try {
      requireQuestionDifficultyForPublish(preview.difficulty);
      validCandidates += 1;
    } catch (error) {
      remaining += 1;
      console.log(`PUBLISH_PENDING ${preview.relativeSourcePath} ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (dryRun) {
      console.log(
        `READY ${preview.relativeSourcePath} map=${preview.mapId} difficulty=${preview.difficulty} point=${preview.finalPoint.x},${preview.finalPoint.y}`,
      );
      remaining += 1;
      continue;
    }
    const result = await publishPreviewQuestion(preview.previewId);
    if (result.status === "published" && result.disposition === "created") {
      published += 1;
      console.log(`PUBLISHED ${preview.relativeSourcePath} question=${result.questionId}`);
    } else if (result.status === "published") {
      skipped += 1;
      console.log(`SKIPPED ${preview.relativeSourcePath} DUPLICATE_OR_ALREADY_PUBLISHED question=${result.questionId}`);
    } else {
      remaining += 1;
      console.log(`PUBLISH_PENDING ${preview.relativeSourcePath} ${result.message ?? ""}`.trim());
    }
  }

  console.log([
    "QUESTION_PUBLISH_COMPLETE",
    `Published previously: ${previouslyPublished}`,
    `New valid questions: ${validCandidates}`,
    `Published: ${published}`,
    `Skipped duplicate/already-published: ${skipped}`,
    `Remaining: ${remaining}`,
    `DryRun: ${dryRun}`,
  ].join("\n"));
}

async function publishLegacyPendingQuestions(dryRun: boolean): Promise<void> {
  const pending = loadPendingQuestions();
  const previews = listQaPreviewQuestions();
  let published = 0;
  let remaining = 0;
  for (const entry of pending) {
    const preview = previews.find((question) => previewIdentityAliases(question, previews).includes(entry.sourceId));
    try {
      requireQuestionDifficultyForPublish(entry.question.difficulty);
    } catch (error) {
      remaining += 1;
      console.log(`PUBLISH_PENDING_R2 source=${entry.sourceId} ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (dryRun) {
      const point = preview?.finalPoint ?? entry.question.correctPoint;
      const coordinateSource = preview?.manualOverride ? "manual-override" : "world-conversion";
      console.log(
        `PENDING source=${entry.sourceId} question=${entry.question.id} difficulty=${entry.question.difficulty} point=${point.x},${point.y} coordinateSource=${coordinateSource}`,
      );
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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const publishAllValidated = process.env.npm_lifecycle_event === "questions:publish" || process.argv.includes("--all");
  if (publishAllValidated) await publishValidatedQuestions(dryRun);
  else await publishLegacyPendingQuestions(dryRun);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
