export type DifficultyId = "easy" | "medium" | "hard";

export interface Difficulty {
  id: DifficultyId;
  name: string;
  timeLimitSeconds: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: "easy", name: "简单", timeLimitSeconds: 20 },
  { id: "medium", name: "中等", timeLimitSeconds: 14 },
  { id: "hard", name: "难", timeLimitSeconds: 8 }
];

export function getDifficulty(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? DIFFICULTIES[0];
}
