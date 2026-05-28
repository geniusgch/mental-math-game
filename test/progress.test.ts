import { describe, expect, it } from "vitest";
import {
  createDefaultProgress,
  finishArcadeRun,
  finishChallengeRun,
  isDifficultyUnlocked,
  recordMissedQuestion
} from "../src/progress";

describe("challenge progress", () => {
  it("unlocks medium after a perfect easy run on the same level", () => {
    const progress = createDefaultProgress();

    const failed = finishChallengeRun(progress, "singleAdd", "easy", 19, 20, []);
    expect(failed.unlockedLevelIndex).toBe(0);
    expect(isDifficultyUnlocked(failed, "singleAdd", "medium")).toBe(false);

    const perfect = finishChallengeRun(progress, "singleAdd", "easy", 20, 20, []);
    expect(perfect.unlockedLevelIndex).toBe(0);
    expect(isDifficultyUnlocked(perfect, "singleAdd", "medium")).toBe(true);
    expect(isDifficultyUnlocked(perfect, "singleAdd", "hard")).toBe(false);
  });

  it("unlocks hard after a perfect medium run on the same level", () => {
    const afterEasy = finishChallengeRun(createDefaultProgress(), "singleAdd", "easy", 20, 20, []);

    const afterMedium = finishChallengeRun(afterEasy, "singleAdd", "medium", 20, 20, []);

    expect(isDifficultyUnlocked(afterMedium, "singleAdd", "hard")).toBe(true);
    expect(afterMedium.unlockedLevelIndex).toBe(0);
  });

  it("unlocks the next level only after a perfect hard run", () => {
    const afterEasy = finishChallengeRun(createDefaultProgress(), "singleAdd", "easy", 20, 20, []);
    const afterMedium = finishChallengeRun(afterEasy, "singleAdd", "medium", 20, 20, []);

    const afterHard = finishChallengeRun(afterMedium, "singleAdd", "hard", 20, 20, []);

    expect(afterHard.unlockedLevelIndex).toBe(1);
  });

  it("does not advance unlocks by replaying an already unlocked lower level", () => {
    const progress = { ...createDefaultProgress(), unlockedLevelIndex: 3 };

    const replay = finishChallengeRun(progress, "singleAdd", "hard", 20, 20, []);

    expect(replay.unlockedLevelIndex).toBe(3);
  });

  it("records missed question weights by expression", () => {
    const progress = createDefaultProgress();
    const updated = recordMissedQuestion(progress, "singleAdd", "singleAdd:3+4");

    expect(updated.missedWeights["singleAdd:3+4"]).toBe(1);
  });

  it("stores arcade high score without changing challenge unlocks", () => {
    const progress = createDefaultProgress();
    const updated = finishArcadeRun(progress, 17, 24);

    expect(updated.arcadeHighScore).toBe(17);
    expect(updated.unlockedLevelIndex).toBe(0);
  });
});
