import { describe, expect, it } from "vitest";
import { DIFFICULTIES, getDifficulty } from "../src/difficulty";

describe("difficulty settings", () => {
  it("maps challenge difficulties to the planned time limits", () => {
    expect(getDifficulty("easy").timeLimitSeconds).toBe(20);
    expect(getDifficulty("medium").timeLimitSeconds).toBe(14);
    expect(getDifficulty("hard").timeLimitSeconds).toBe(8);
  });

  it("orders difficulties for the home screen", () => {
    expect(DIFFICULTIES.map((difficulty) => difficulty.id)).toEqual(["easy", "medium", "hard"]);
  });
});
