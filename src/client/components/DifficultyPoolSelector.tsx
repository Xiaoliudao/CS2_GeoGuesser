import {
  QUESTION_DIFFICULTIES,
  QUESTION_DIFFICULTY_CHINESE_LABELS,
  QUESTION_DIFFICULTY_LABELS,
  type QuestionDifficulty,
} from "../../shared/questionDifficulty";

export const DEFAULT_DIFFICULTY_POOL_SELECTOR_ID = "question-difficulty-pool";

export function DifficultyPoolSelector({
  difficultyPool,
  onChange,
  id = DEFAULT_DIFFICULTY_POOL_SELECTOR_ID,
  ariaDescribedBy,
  disabled = false,
}: {
  difficultyPool: QuestionDifficulty[];
  onChange: (difficultyPool: QuestionDifficulty[]) => void;
  id?: string;
  ariaDescribedBy?: string;
  disabled?: boolean;
}) {
  const labelId = `${id}-label`;
  const toggleDifficulty = (difficulty: QuestionDifficulty) => {
    onChange(
      QUESTION_DIFFICULTIES.filter((candidate) => (
        candidate === difficulty
          ? !difficultyPool.includes(candidate)
          : difficultyPool.includes(candidate)
      )),
    );
  };

  return (
    <div
      id={id}
      className="setting-group difficulty-pool-selector"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={ariaDescribedBy}
      aria-invalid={difficultyPool.length === 0}
      tabIndex={-1}
    >
      <span id={labelId} className="setting-group-label">DIFFICULTY</span>
      <div className="difficulty-pool-grid">
        {QUESTION_DIFFICULTIES.map((difficulty) => {
          const selected = difficultyPool.includes(difficulty);
          return (
            <button
              key={difficulty}
              className={`${selected ? "is-selected" : ""} difficulty-${difficulty}`}
              type="button"
              role="checkbox"
              aria-checked={selected}
              disabled={disabled}
              title={QUESTION_DIFFICULTY_CHINESE_LABELS[difficulty]}
              onClick={() => toggleDifficulty(difficulty)}
            >
              <span>{QUESTION_DIFFICULTY_LABELS[difficulty]}</span>
              <b aria-hidden="true">{selected ? "✓" : ""}</b>
            </button>
          );
        })}
      </div>
      <small>Select which question difficulties can appear.</small>
    </div>
  );
}
