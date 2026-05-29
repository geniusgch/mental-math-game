export interface CloudSpeechSession {
  stop(): void;
}

interface StartCloudSpeechOptions {
  durationMs: number;
  onResult(transcript: string): void;
  onError(error: Error): void;
}

type AudioContextCtor = typeof AudioContext;

export function canUseCloudSpeech(): boolean {
  const win = window as Window & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
  const getUserMedia = mediaDevices?.getUserMedia as MediaDevices["getUserMedia"] | undefined;
  return Boolean(getUserMedia && (win.AudioContext || win.webkitAudioContext));
}

export function startCloudSpeechRecognition(options: StartCloudSpeechOptions): CloudSpeechSession {
  const controller = new AbortController();

  void recordWav(options.durationMs, controller.signal)
    .then((audio) => recognizeTencentAudio(audio, controller.signal))
    .then((transcript) => options.onResult(transcript))
    .catch((error) => {
      if (controller.signal.aborted) return;
      options.onError(error instanceof Error ? error : new Error("cloud_speech_failed"));
    });

  return {
    stop() {
      controller.abort();
    }
  };
}

async function recognizeTencentAudio(audio: Blob, signal: AbortSignal): Promise<string> {
  const audioBase64 = await blobToBase64(audio);
  const response = await fetch("/api/tencent-asr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      dataLen: audio.size,
      voiceFormat: "wav"
    }),
    signal
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "cloud_speech_failed");
  }

  return typeof data.result === "string" ? data.result : "";
}

async function recordWav(durationMs: number, signal: AbortSignal): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const win = window as Window & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const AudioContextImpl = win.AudioContext || win.webkitAudioContext;
  if (!AudioContextImpl) throw new Error("audio_context_not_supported");
  const audioContext = new AudioContextImpl();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentGain = audioContext.createGain();
  const chunks: Float32Array[] = [];

  silentGain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", cancel);
      processor.disconnect();
      silentGain.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      audioContext.close().catch(() => undefined);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      const sampleRate = audioContext.sampleRate;
      cleanup();

      const wav = encodeWav(chunks, sampleRate);
      resolve(new Blob([wav], { type: "audio/wav" }));
    };

    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("cloud_speech_aborted"));
    };

    signal.addEventListener("abort", cancel, { once: true });
    audioContext.resume().catch((error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error("audio_context_failed"));
    });
    timeoutId = window.setTimeout(finish, durationMs);
  });
}

function encodeWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
  const samples = mergeChunks(chunks);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}
