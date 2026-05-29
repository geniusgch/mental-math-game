import crypto from "node:crypto";

const host = "asr.tencentcloudapi.com";
const service = "asr";
const action = "SentenceRecognition";
const version = "2019-06-14";
const region = "ap-shanghai";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    res.status(501).json({ error: "tencent_asr_not_configured" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
    const dataLen = Number(body.dataLen);
    const voiceFormat = typeof body.voiceFormat === "string" ? body.voiceFormat : "wav";

    if (!audioBase64 || !Number.isFinite(dataLen) || dataLen <= 0) {
      res.status(400).json({ error: "invalid_audio" });
      return;
    }

    const payload = JSON.stringify({
      SubServiceType: 2,
      ProjectId: 0,
      EngSerViceType: "16k_zh",
      SourceType: 1,
      VoiceFormat: voiceFormat,
      Data: audioBase64,
      DataLen: dataLen,
      ConvertNumMode: 1,
      FilterPunc: 2,
      FilterModal: 2,
      HotwordList: "零|11,一|11,二|11,三|11,四|11,五|11,六|11,七|11,八|11,九|11,十|11"
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const headers = createTencentHeaders({ payload, secretId, secretKey, timestamp });
    const response = await fetch(`https://${host}`, {
      method: "POST",
      headers,
      body: payload
    });
    const data = await response.json();

    if (!response.ok || data.Response?.Error) {
      res.status(502).json({
        error: "tencent_asr_failed",
        detail: data.Response?.Error ?? data
      });
      return;
    }

    res.status(200).json({
      result: data.Response?.Result ?? "",
      requestId: data.Response?.RequestId ?? ""
    });
  } catch (error) {
    res.status(500).json({
      error: "asr_proxy_failed",
      detail: error instanceof Error ? error.message : "unknown"
    });
  }
}

function createTencentHeaders({ payload, secretId, secretKey, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const hashedRequestPayload = sha256(payload);
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`;
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmac(secretSigning, stringToSign, "hex");
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: host,
    "X-TC-Action": action,
    "X-TC-Version": version,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Region": region
  };
}

function sha256(message) {
  return crypto.createHash("sha256").update(message, "utf8").digest("hex");
}

function hmac(key, message, encoding) {
  return crypto.createHmac("sha256", key).update(message, "utf8").digest(encoding);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
