import { describe, expect, it } from "vitest";
import { formatAnswerReview } from "../src/result";

describe("answer review formatting", () => {
  it("shows player answer and correct answer for a wrong response", () => {
    expect(formatAnswerReview("9 + 6", 12, 15)).toBe("9 + 6  你: 12  正确: 15");
  });

  it("shows unanswered timeout answers clearly", () => {
    expect(formatAnswerReview("7 + 5", null, 12)).toBe("7 + 5  你: 未作答  正确: 12");
  });
});
