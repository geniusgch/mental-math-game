export function formatAnswerReview(expression: string, playerAnswer: number | null, correctAnswer: number): string {
  const player = playerAnswer === null ? "未作答" : String(playerAnswer);
  return `${expression}  你: ${player}  正确: ${correctAnswer}`;
}
