import { describe, expect, it } from "vitest";
import {
  LEVELS,
  generateQuestion,
  generateUniqueQuestion,
  generateWeightedQuestion,
  getWeightedQuestionPool,
  matchesExpectedAnswer,
  parseSpokenNumber
} from "../src/math";

describe("question generation", () => {
  it("generates single digit addition questions", () => {
    for (let i = 0; i < 100; i += 1) {
      const question = generateQuestion("singleAdd");

      expect(question.left).toBeGreaterThanOrEqual(1);
      expect(question.left).toBeLessThanOrEqual(9);
      expect(question.right).toBeGreaterThanOrEqual(1);
      expect(question.right).toBeLessThanOrEqual(9);
      expect(question.answer).toBe(question.left + question.right);
    }
  });

  it("generates two digit subtraction without negative answers", () => {
    for (let i = 0; i < 100; i += 1) {
      const question = generateQuestion("doubleSubtract");

      expect(question.left).toBeGreaterThanOrEqual(10);
      expect(question.left).toBeLessThanOrEqual(99);
      expect(question.right).toBeGreaterThanOrEqual(10);
      expect(question.right).toBeLessThanOrEqual(99);
      expect(question.answer).toBeGreaterThanOrEqual(0);
      expect(question.answer).toBe(question.left - question.right);
    }
  });

  it("generates exact division questions with single digit divisors", () => {
    for (let i = 0; i < 100; i += 1) {
      const question = generateQuestion("singleDivisorDivide");

      expect(question.right).toBeGreaterThanOrEqual(1);
      expect(question.right).toBeLessThanOrEqual(9);
      expect(question.left % question.right).toBe(0);
      expect(question.answer).toBe(question.left / question.right);
    }
  });

  it("defines the six planned levels in order", () => {
    expect(LEVELS.map((level) => level.id)).toEqual([
      "singleAdd",
      "doubleAdd",
      "singleSubtract",
      "doubleSubtract",
      "singleMultiply",
      "singleDivisorDivide"
    ]);
  });

  it("weights missed expressions by one plus twice their error count", () => {
    const pool = getWeightedQuestionPool("singleAdd", {
      "singleAdd:3+4": 2
    });

    expect(pool.filter((item) => item.expressionKey === "singleAdd:3+4")).toHaveLength(5);
  });

  it("can exclude questions that already appeared in the current run", () => {
    const seen = new Set<string>();
    for (let left = 1; left <= 9; left += 1) {
      for (let right = 1; right <= 9; right += 1) {
        if (left === 3 && right === 4) continue;
        seen.add(`singleAdd:${left}+${right}`);
      }
    }

    expect(generateUniqueQuestion("singleAdd", seen).expressionKey).toBe("singleAdd:3+4");
    expect(generateWeightedQuestion("singleAdd", { "singleAdd:3+4": 5 }, seen).expressionKey).toBe("singleAdd:3+4");
  });

  it("allows easy difficulty to include hard-looking questions", () => {
    const easyAddPool = getWeightedQuestionPool("singleAdd", {}, "easy").map((item) => item.question);
    const easyMultiplyPool = getWeightedQuestionPool("singleMultiply", {}, "easy").map((item) => item.question);

    expect(easyAddPool.some((question) => question.answer > 10)).toBe(true);
    expect(easyMultiplyPool.some((question) => question.left >= 6 && question.right >= 6)).toBe(true);
  });

  it("removes simple questions from hard difficulty pools", () => {
    for (let i = 0; i < 100; i += 1) {
      const singleAdd = generateQuestion("singleAdd", "hard");
      const doubleAdd = generateQuestion("doubleAdd", "hard");
      const singleSubtract = generateQuestion("singleSubtract", "hard");
      const singleMultiply = generateQuestion("singleMultiply", "hard");

      expect(singleAdd.answer).toBeGreaterThan(10);
      expect(doubleAdd.answer).toBeGreaterThanOrEqual(100);
      expect(singleSubtract.left).toBeGreaterThanOrEqual(6);
      expect(singleMultiply.left + singleMultiply.right).toBeGreaterThanOrEqual(12);
    }
  });

  it("uses carry and borrow combinations in hard difficulty pools", () => {
    const hardAddPool = getWeightedQuestionPool("singleAdd", {}, "hard").map((item) => item.question);
    const hardSubtractPool = getWeightedQuestionPool("doubleSubtract", {}, "hard").map((item) => item.question);

    expect(hardAddPool.every((question) => question.answer > 10)).toBe(true);
    expect(hardSubtractPool.some((question) => question.right % 10 > question.left % 10)).toBe(true);
  });

  it("scales multiplication and division by difficulty", () => {
    for (let i = 0; i < 100; i += 1) {
      const hardDivision = generateQuestion("singleDivisorDivide", "hard");

      expect(hardDivision.answer).toBeGreaterThanOrEqual(6);
      expect(hardDivision.right).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("spoken number parsing", () => {
  it.each([
    ["识别到 87", 87],
    ["答案是120", 120],
    ["１２", 12],
    ["三十六", 36],
    ["十二", 12],
    ["一百二十", 120],
    ["两百零四", 204],
    ["十五点", 15],
    ["等于三十五。", 35],
    ["一百二", 120],
    ["二百一", 210],
    ["一百二十三", 123],
    ["令", 0],
    ["领", 0],
    ["要", 1],
    ["腰", 1],
    ["儿", 2],
    ["耳", 2],
    ["伞", 3],
    ["散", 3],
    ["是", 4],
    ["市", 4],
    ["事", 4],
    ["试", 4],
    ["我", 5],
    ["无", 5],
    ["午", 5],
    ["溜", 6],
    ["留", 6],
    ["期", 7],
    ["起", 7],
    ["其", 7],
    ["切", 7],
    ["接", 7],
    ["把", 8],
    ["吧", 8],
    ["巴", 8],
    ["就", 9],
    ["久", 9],
    ["酒", 9],
    ["答案是八", 8],
    ["结果是我", 5],
    ["等于市", 4],
    ["一百领四", 104],
    ["-5", -5]
  ])("parses %s as %i", (spoken, expected) => {
    expect(parseSpokenNumber(spoken)).toBe(expected);
  });

  it("returns null when no number can be understood", () => {
    expect(parseSpokenNumber("再说一遍")).toBeNull();
  });
});

describe("expected answer matching", () => {
  it.each([
    [8, "把"],
    [4, "是"],
    [5, "我"],
    [9, "就"],
    [18, "要八"],
    [18, "一八"],
    [18, "十八"],
    [104, "一百领四"],
    [120, "一百二"],
    [36, "三十六"],
    [7, "切"],
    [7, "接"],
    [7, "气"],
    [7, "齐"],
    [7, "器"],
    [7, "鸡"],
    [17, "要气"],
    [27, "二气"],
    [48, "是把"]
  ])("accepts %s when transcript is %s", (expected, transcript) => {
    expect(matchesExpectedAnswer(transcript, expected)).toBe(true);
  });

  it.each([
    [8, "是"],
    [18, "一九"],
    [104, "一百领五"]
  ])("rejects %s when transcript is %s", (expected, transcript) => {
    expect(matchesExpectedAnswer(transcript, expected)).toBe(false);
  });
});
