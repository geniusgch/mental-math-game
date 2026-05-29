export type LevelId =
  | "singleAdd"
  | "doubleAdd"
  | "singleSubtract"
  | "doubleSubtract"
  | "singleMultiply"
  | "singleDivisorDivide";

export type Operator = "+" | "-" | "×" | "÷";

export interface LevelDefinition {
  id: LevelId;
  name: string;
  description: string;
}

export interface Question {
  levelId: LevelId;
  left: number;
  right: number;
  operator: Operator;
  answer: number;
  expression: string;
  expressionKey: string;
}

export interface WeightedQuestion {
  expressionKey: string;
  question: Question;
}

export type MissedWeights = Record<string, number>;

export const LEVELS: LevelDefinition[] = [
  { id: "singleAdd", name: "个位数加法", description: "1-9 加 1-9" },
  { id: "doubleAdd", name: "两位数加法", description: "10-99 加 10-99" },
  { id: "singleSubtract", name: "个位数减法", description: "个位数相减，不出负数" },
  { id: "doubleSubtract", name: "两位数减法", description: "两位数相减，不出负数" },
  { id: "singleMultiply", name: "个位数乘法", description: "1-9 乘 1-9" },
  { id: "singleDivisorDivide", name: "个位数除法", description: "整除题，除数为 1-9" }
];

const DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  令: 0,
  领: 0,
  一: 1,
  幺: 1,
  要: 1,
  腰: 1,
  二: 2,
  两: 2,
  儿: 2,
  耳: 2,
  三: 3,
  伞: 3,
  散: 3,
  四: 4,
  是: 4,
  市: 4,
  事: 4,
  试: 4,
  五: 5,
  我: 5,
  无: 5,
  午: 5,
  六: 6,
  溜: 6,
  留: 6,
  七: 7,
  期: 7,
  起: 7,
  其: 7,
  八: 8,
  把: 8,
  吧: 8,
  巴: 8,
  九: 9,
  就: 9,
  久: 9,
  酒: 9
};

const CHINESE_NUMBER_CHARS = Object.keys(DIGITS).join("");

export function generateQuestion(levelId: LevelId): Question {
  const catalog = getQuestionCatalog(levelId);
  return catalog[randomInt(0, catalog.length - 1)];
}

export function getWeightedQuestionPool(levelId: LevelId, missedWeights: MissedWeights): WeightedQuestion[] {
  const pool: WeightedQuestion[] = [];
  for (const question of getQuestionCatalog(levelId)) {
    const repeats = 1 + (missedWeights[question.expressionKey] ?? 0) * 2;
    for (let i = 0; i < repeats; i += 1) {
      pool.push({ expressionKey: question.expressionKey, question });
    }
  }

  return pool;
}

export function generateWeightedQuestion(
  levelId: LevelId,
  missedWeights: MissedWeights,
  excludedExpressionKeys: ReadonlySet<string> = new Set()
): Question {
  const availablePool = getWeightedQuestionPool(levelId, missedWeights).filter(
    (item) => !excludedExpressionKeys.has(item.expressionKey)
  );
  const pool = availablePool.length > 0 ? availablePool : getWeightedQuestionPool(levelId, missedWeights);
  return pool[randomInt(0, pool.length - 1)].question;
}

export function generateUniqueQuestion(levelId: LevelId, excludedExpressionKeys: ReadonlySet<string>): Question {
  const available = getQuestionCatalog(levelId).filter((question) => !excludedExpressionKeys.has(question.expressionKey));
  const pool = available.length > 0 ? available : getQuestionCatalog(levelId);
  return pool[randomInt(0, pool.length - 1)];
}

export function parseSpokenNumber(spoken: string): number | null {
  const normalized = spoken.trim().replace(/\s+/g, "").replace(/[０-９]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  });
  const digitMatch = normalized.match(/-?\d+/);
  if (digitMatch) return Number.parseInt(digitMatch[0], 10);

  const sign = normalized.includes("负") || normalized.includes("負") ? -1 : 1;
  const clean = normalized
    .replace(/答案是|结果是|等于是|等於是/g, "")
    .replace(/答案|结果|等于|等於|负|負|。|！|!|，|,/g, "");
  const chineseMatch = findChineseNumber(clean);
  if (!chineseMatch) return null;

  const parsed = parseChineseInteger(chineseMatch);
  return parsed === null ? null : sign * parsed;
}

export function formatRecognizedAnswer(spoken: string): string {
  const parsed = parseSpokenNumber(spoken);
  if (parsed === null) return spoken;
  return String(parsed);
}

export function matchesExpectedAnswer(spoken: string, expectedAnswer: number): boolean {
  const parsed = parseSpokenNumber(spoken);
  if (parsed === expectedAnswer) return true;

  const normalized = normalizeSpokenText(spoken);
  const candidates = new Set<string>([
    String(expectedAnswer),
    toChineseInteger(expectedAnswer),
    toDigitSpeech(expectedAnswer)
  ]);

  for (const candidate of candidates) {
    if (candidate && normalized.includes(candidate)) return true;
  }

  return false;
}

function normalizeSpokenText(spoken: string): string {
  return spoken
    .trim()
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/答案是|结果是|等于是|等於是/g, "")
    .replace(/答案|结果|等于|等於|。|！|!|，|,|\./g, "")
    .replace(new RegExp(`[${CHINESE_NUMBER_CHARS}]`, "g"), (char) => String(DIGITS[char]));
}

function toDigitSpeech(value: number): string {
  return String(value)
    .split("")
    .map((char) => {
      if (char === "-") return "负";
      return char;
    })
    .join("");
}

function toChineseInteger(value: number): string {
  if (value === 0) return "零";
  if (value < 0) return `负${toChineseInteger(Math.abs(value))}`;

  const units = ["", "十", "百", "千"];
  const sections: string[] = [];
  let rest = value;
  let sectionIndex = 0;

  while (rest > 0) {
    const section = rest % 10000;
    if (section > 0) {
      sections.unshift(`${sectionToChinese(section)}${sectionIndex === 0 ? "" : "万"}`);
    }
    rest = Math.floor(rest / 10000);
    sectionIndex += 1;
  }

  return sections.join("零").replace(/^一十/, "十");

  function sectionToChinese(section: number): string {
    let result = "";
    let needsZero = false;

    for (let i = 3; i >= 0; i -= 1) {
      const divisor = 10 ** i;
      const digit = Math.floor(section / divisor) % 10;
      if (digit === 0) {
        if (result) needsZero = true;
        continue;
      }

      if (needsZero) {
        result += "零";
        needsZero = false;
      }
      result += `${digitToChinese(digit)}${units[i]}`;
    }

    return result.replace(/^一十/, "十");
  }
}

function digitToChinese(digit: number): string {
  return ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"][digit];
}

function parseChineseInteger(input: string): number | null {
  if ([...input].every((char) => char in DIGITS)) {
    return Number([...input].map((char) => DIGITS[char]).join(""));
  }

  const shortHundreds = input.match(new RegExp(`^([${CHINESE_NUMBER_CHARS}])百([${CHINESE_NUMBER_CHARS}])$`));
  if (shortHundreds) {
    return DIGITS[shortHundreds[1]] * 100 + DIGITS[shortHundreds[2]] * 10;
  }

  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of input) {
    if (char in DIGITS) {
      number = DIGITS[char];
      continue;
    }

    if (char === "十") {
      section += (number || 1) * 10;
      number = 0;
      continue;
    }

    if (char === "百") {
      section += (number || 1) * 100;
      number = 0;
      continue;
    }

    if (char === "千") {
      section += (number || 1) * 1000;
      number = 0;
      continue;
    }

    if (char === "万") {
      total += (section + number) * 10000;
      section = 0;
      number = 0;
      continue;
    }

    return null;
  }

  return total + section + number;
}

function findChineseNumber(input: string): string | null {
  const matches = input.matchAll(new RegExp(`[${CHINESE_NUMBER_CHARS}十百千万]+`, "g"));
  for (const match of matches) {
    const value = match[0];
    const nextChar = input[(match.index ?? 0) + value.length];
    if (value.length === 1 && nextChar && "遍次个只".includes(nextChar)) continue;
    return value;
  }

  return null;
}

function getQuestionCatalog(levelId: LevelId): Question[] {
  switch (levelId) {
    case "singleAdd":
      return makeBinaryCatalog(levelId, 1, 9, 1, 9, "+");
    case "doubleAdd":
      return makeBinaryCatalog(levelId, 10, 99, 10, 99, "+");
    case "singleSubtract":
      return makeSubtractionCatalog(levelId, 1, 9);
    case "doubleSubtract":
      return makeSubtractionCatalog(levelId, 10, 99);
    case "singleMultiply":
      return makeBinaryCatalog(levelId, 1, 9, 1, 9, "×");
    case "singleDivisorDivide":
      return makeDivisionCatalog();
  }
}

function makeBinaryCatalog(
  levelId: LevelId,
  leftMin: number,
  leftMax: number,
  rightMin: number,
  rightMax: number,
  operator: Operator
): Question[] {
  const questions: Question[] = [];
  for (let left = leftMin; left <= leftMax; left += 1) {
    for (let right = rightMin; right <= rightMax; right += 1) {
      questions.push(makeQuestion(levelId, left, right, operator));
    }
  }
  return questions;
}

function makeSubtractionCatalog(levelId: LevelId, min: number, max: number): Question[] {
  const questions: Question[] = [];
  for (let left = min; left <= max; left += 1) {
    for (let right = min; right <= left; right += 1) {
      questions.push(makeQuestion(levelId, left, right, "-"));
    }
  }
  return questions;
}

function makeDivisionCatalog(): Question[] {
  const questions: Question[] = [];
  for (let divisor = 1; divisor <= 9; divisor += 1) {
    for (let answer = 1; answer <= 20; answer += 1) {
      questions.push(makeQuestion("singleDivisorDivide", divisor * answer, divisor, "÷"));
    }
  }
  return questions;
}

function makeQuestion(levelId: LevelId, left: number, right: number, operator: Operator): Question {
  const answer = calculate(left, right, operator);
  const expression = `${left} ${operator} ${right}`;
  const compactOperator = operator === "×" ? "*" : operator === "÷" ? "/" : operator;

  return {
    levelId,
    left,
    right,
    operator,
    answer,
    expression,
    expressionKey: `${levelId}:${left}${compactOperator}${right}`
  };
}

function calculate(left: number, right: number, operator: Operator): number {
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "×") return left * right;
  return left / right;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
