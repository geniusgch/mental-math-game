import { LEVELS, type LevelId, type MissedWeights } from "./math";
import type { DifficultyId } from "./difficulty";

export interface ChallengeResult {
  levelId: LevelId;
  difficultyId: DifficultyId;
  correct: number;
  total: number;
  accuracy: number;
  misses: string[];
  completedAt: string;
}

export interface AppProgress {
  unlockedLevelIndex: number;
  bestAccuracyByLevel: Partial<Record<LevelId, number>>;
  bestAccuracyByLevelDifficulty: Partial<Record<string, number>>;
  challengeHistory: ChallengeResult[];
  arcadeHighScore: number;
  arcadeBestAccuracy: number;
  missedWeights: MissedWeights;
}

const STORAGE_KEY = "mentalMathProgress:v1";

export function createDefaultProgress(): AppProgress {
  return {
    unlockedLevelIndex: 0,
    bestAccuracyByLevel: {},
    bestAccuracyByLevelDifficulty: {},
    challengeHistory: [],
    arcadeHighScore: 0,
    arcadeBestAccuracy: 0,
    missedWeights: {}
  };
}

export function loadProgress(storage: Storage = localStorage): AppProgress {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProgress();
    return { ...createDefaultProgress(), ...JSON.parse(raw) } as AppProgress;
  } catch {
    return createDefaultProgress();
  }
}

export function saveProgress(progress: AppProgress, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function finishChallengeRun(
  progress: AppProgress,
  levelId: LevelId,
  difficultyId: DifficultyId,
  correct: number,
  total: number,
  misses: string[]
): AppProgress {
  const accuracy = total === 0 ? 0 : correct / total;
  const currentBest = progress.bestAccuracyByLevel[levelId] ?? 0;
  const difficultyKey = levelDifficultyKey(levelId, difficultyId);
  const currentDifficultyBest = progress.bestAccuracyByLevelDifficulty[difficultyKey] ?? 0;
  const next: AppProgress = {
    ...progress,
    bestAccuracyByLevel: {
      ...progress.bestAccuracyByLevel,
      [levelId]: Math.max(currentBest, accuracy)
    },
    bestAccuracyByLevelDifficulty: {
      ...progress.bestAccuracyByLevelDifficulty,
      [difficultyKey]: Math.max(currentDifficultyBest, accuracy)
    },
    challengeHistory: [
      ...progress.challengeHistory,
      {
        levelId,
        difficultyId,
        correct,
        total,
        accuracy,
        misses,
        completedAt: new Date().toISOString()
      }
    ]
  };

  if (difficultyId === "hard" && correct === total && total > 0) {
    const completedIndex = LEVELS.findIndex((level) => level.id === levelId);
    next.unlockedLevelIndex = Math.max(progress.unlockedLevelIndex, completedIndex + 1);
  }

  return next;
}

export function isDifficultyUnlocked(progress: AppProgress, levelId: LevelId, difficultyId: DifficultyId): boolean {
  if (difficultyId === "easy") return true;
  if (difficultyId === "medium") return (progress.bestAccuracyByLevelDifficulty[levelDifficultyKey(levelId, "easy")] ?? 0) >= 1;
  return (progress.bestAccuracyByLevelDifficulty[levelDifficultyKey(levelId, "medium")] ?? 0) >= 1;
}

export function getBestAccuracy(progress: AppProgress, levelId: LevelId, difficultyId: DifficultyId): number {
  return progress.bestAccuracyByLevelDifficulty[levelDifficultyKey(levelId, difficultyId)] ?? 0;
}

function levelDifficultyKey(levelId: LevelId, difficultyId: DifficultyId): string {
  return `${levelId}:${difficultyId}`;
}

export function recordMissedQuestion(progress: AppProgress, levelId: LevelId, expressionKey: string): AppProgress {
  if (!expressionKey.startsWith(`${levelId}:`)) return progress;

  return {
    ...progress,
    missedWeights: {
      ...progress.missedWeights,
      [expressionKey]: (progress.missedWeights[expressionKey] ?? 0) + 1
    }
  };
}

export function finishArcadeRun(progress: AppProgress, correct: number, total: number): AppProgress {
  const accuracy = total === 0 ? 0 : correct / total;
  return {
    ...progress,
    arcadeHighScore: Math.max(progress.arcadeHighScore, correct),
    arcadeBestAccuracy: Math.max(progress.arcadeBestAccuracy, accuracy)
  };
}
