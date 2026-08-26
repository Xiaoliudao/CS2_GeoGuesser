// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { QUESTION_DIFFICULTIES, type QuestionDifficulty } from "../../shared/questionDifficulty";
import { DifficultyPoolSelector } from "./DifficultyPoolSelector";

afterEach(cleanup);

function ControlledSelector() {
  const [difficultyPool, setDifficultyPool] = useState<QuestionDifficulty[]>([...QUESTION_DIFFICULTIES]);
  return <DifficultyPoolSelector difficultyPool={difficultyPool} onChange={setDifficultyPool} />;
}

describe("DifficultyPoolSelector", () => {
  it("renders exactly EASY, HARD, and HELL in canonical order", () => {
    render(<ControlledSelector />);
    const options = screen.getAllByRole("checkbox");
    expect(options.map((option) => option.textContent?.replace("✓", ""))).toEqual(["EASY", "HARD", "HELL"]);
    expect(options.map((option) => option.getAttribute("aria-checked"))).toEqual(["true", "true", "true"]);
    expect(options.map((option) => option.getAttribute("title"))).toEqual(["简单", "困难", "地狱"]);
  });

  it("supports canonical multi-select and exposes an empty state for parent validation", async () => {
    const user = userEvent.setup();
    render(<ControlledSelector />);
    const group = screen.getByRole("group", { name: "DIFFICULTY" });

    await user.click(screen.getByRole("checkbox", { name: "HARD" }));
    expect(screen.getByRole("checkbox", { name: "EASY" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "HARD" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("checkbox", { name: "HELL" }).getAttribute("aria-checked")).toBe("true");

    await user.click(screen.getByRole("checkbox", { name: "EASY" }));
    await user.click(screen.getByRole("checkbox", { name: "HELL" }));
    expect(group.getAttribute("aria-invalid")).toBe("true");
  });
});
