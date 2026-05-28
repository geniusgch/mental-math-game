import { describe, expect, it } from "vitest";
import { speechErrorMessage, shouldAutoRestartAfterUnclearAnswer, shouldAutoRestartSpeech } from "../src/speech";

describe("speech retry policy", () => {
  it("restarts automatically for transient listening failures", () => {
    expect(shouldAutoRestartSpeech("no-speech")).toBe(true);
    expect(shouldAutoRestartSpeech("network")).toBe(true);
    expect(shouldAutoRestartSpeech("aborted")).toBe(true);
  });

  it("does not restart automatically when microphone permission is denied", () => {
    expect(shouldAutoRestartSpeech("not-allowed")).toBe(false);
    expect(shouldAutoRestartSpeech("service-not-allowed")).toBe(false);
  });

  it("shows permission errors as microphone denial", () => {
    expect(speechErrorMessage("not-allowed")).toBe("麦克风权限被拒绝");
  });

  it("keeps listening when recognition result does not contain Arabic digits", () => {
    expect(shouldAutoRestartAfterUnclearAnswer()).toBe(true);
  });
});
