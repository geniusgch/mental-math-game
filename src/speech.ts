export type SpeechErrorCode =
  | "aborted"
  | "audio-capture"
  | "bad-grammar"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed"
  | string;

const permissionErrors = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

export function shouldAutoRestartSpeech(error: SpeechErrorCode): boolean {
  return !permissionErrors.has(error);
}

export function shouldAutoRestartAfterUnclearAnswer(): boolean {
  return true;
}

export function speechErrorMessage(error: SpeechErrorCode): string {
  if (error === "not-allowed" || error === "service-not-allowed") return "麦克风权限被拒绝";
  if (error === "audio-capture") return "没有可用麦克风";
  if (error === "no-speech") return "没有听到声音，继续听";
  if (error === "network") return "语音服务网络不稳，继续听";
  return "语音识别失败，继续听";
}
