import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { parseBambuScreen, type DeviceIdentity } from '@/src/runtime/bambu-screen';

export type { DeviceIdentity };

const KEY = 'deepseek_api_key';
const CHAT_URL = 'https://api.deepseek.com/chat/completions';
const MODELS_URL = 'https://api.deepseek.com/models';
const OCR_TIMEOUT_MS = 90_000;

const ALL_TEXT_PROMPT = `把图片中能看清的全部文字按从上到下、从左到右的阅读顺序原样抄下来。
保留原有换行。不要解释、不要翻译、不要补充图片里没有的内容。
如果整张图都看不清，只回复空字符串。`;

const OCR_PROMPT = `从打印机屏幕照片里只读取两项，忽略其他所有文字：
1. ip：设备的 IPv4 地址，例如 192.168.1.10。不要带端口。
2. code：标注为「访问码」的那一串字符。屏幕上如果写成「识别码」，也是这一项。不要把序列号、MAC、固件版本、型号当成访问码。

只输出一个 JSON 对象，不要解释、不要 Markdown：
{"ip":"","code":""}
看不清或不存在的字段用空字符串，禁止编造。`;

export type ScreenImage = {
  base64: string;
  mimeType: string;
};

const DEEPSEEK_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** 相册和相机都可能带回 data URL。按文件头判断真实格式，避免把 PNG 标成 JPEG。 */
export function screenImageFromBase64(base64: string, mimeType?: string | null): ScreenImage | null {
  const compact = base64.replace(/\s/g, '');
  if (!compact) return null;
  const dataUrl = /^data:([^;,]+);base64,(.+)$/i.exec(compact);
  const marker = 'base64,';
  const splitAt = compact.indexOf(marker);
  const raw = dataUrl?.[2] || (splitAt >= 0 ? compact.slice(splitAt + marker.length) : compact);
  if (!raw) return null;
  const declared = canonicalImageMime(dataUrl?.[1] || mimeType || '');
  const sniffed = sniffImageMime(raw);
  return { base64: raw, mimeType: sniffed || declared || 'application/octet-stream' };
}

function canonicalImageMime(raw: string) {
  const mime = raw.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'image/jpg' || mime === 'image/pjpeg') return 'image/jpeg';
  return mime;
}

function sniffImageMime(base64: string) {
  let binary = '';
  try {
    binary = globalThis.atob(base64.slice(0, 48));
  } catch {
    return '';
  }
  const bytes = Array.from(binary, (char) => char.charCodeAt(0));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (binary.slice(0, 4) === 'RIFF' && binary.slice(8, 12) === 'WEBP') return 'image/webp';
  return '';
}

async function prepareScreenImage(base64: string, mimeType?: string | null): Promise<ScreenImage> {
  const image = screenImageFromBase64(base64, mimeType);
  if (!image) throw new Error('这张图片没有可读数据，请重新选择');
  if (DEEPSEEK_IMAGE_TYPES.has(image.mimeType)) return image;
  return transcodeToJpeg(image);
}

async function transcodeToJpeg(image: ScreenImage): Promise<ScreenImage> {
  if (typeof document === 'undefined') {
    throw new Error('这张照片的格式不能识别，请换一张 JPEG 或 PNG');
  }
  const img = document.createElement('img');
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('这张照片的格式不能识别，请换一张 JPEG 或 PNG'));
    img.src = `data:${image.mimeType};base64,${image.base64}`;
  });
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('这张照片的格式不能识别，请换一张 JPEG 或 PNG');
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const encoded = screenImageFromBase64(canvas.toDataURL('image/jpeg', 0.85), 'image/jpeg');
  if (!encoded || encoded.mimeType !== 'image/jpeg') {
    throw new Error('这张照片的格式不能识别，请换一张 JPEG 或 PNG');
  }
  return encoded;
}

/** 与图像识字页「提取 IP 和访问码」同一条调用。先取全文，再按拓竹规则读取。 */
export async function extractPrinterScreen(image: ScreenImage): Promise<DeviceIdentity> {
  const transcript = await extractAllText(image);
  const identity = parseBambuScreen(transcript);
  if (!identity.ip && !identity.code) {
    throw new Error('没有识别到 IP 或访问码，请让屏幕上的这两项更清晰');
  }
  return identity;
}

/** 与图像识字页「提取所有文本」同一条调用。 */
export async function extractAllText(image: ScreenImage): Promise<string> {
  const prepared = await prepareScreenImage(image.base64, image.mimeType);
  const apiKey = await loadDeepseekKey();
  const text = await completeVision({
    apiKey,
    base64: prepared.base64,
    mimeType: prepared.mimeType,
    prompt: ALL_TEXT_PROMPT,
    maxTokens: 2048,
  });
  if (!text) throw new Error('没有识别到文字，请让画面更清晰');
  return text;
}

export async function loadDeepseekKey(): Promise<string> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(KEY)?.trim() ?? '';
    } catch {
      return '';
    }
  }
  return ((await SecureStore.getItemAsync(KEY)) ?? '').trim();
}

export async function saveDeepseekKey(value: string): Promise<void> {
  const next = value.trim();
  if (Platform.OS === 'web') {
    if (!next) globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, next);
    return;
  }
  if (!next) {
    await SecureStore.deleteItemAsync(KEY);
    return;
  }
  await SecureStore.setItemAsync(KEY, next);
}

export function maskDeepseekKey(value: string): string {
  const text = value.trim();
  if (text.length <= 4) return text ? '****' : '';
  return `****${text.slice(-4)}`;
}

export async function testDeepseekKey(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error('请先填写 API Key');
  const response = await fetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (response.ok) return;
  throw new Error(await readError(response, '连接失败'));
}

export async function extractDeviceIdentity(input: {
  apiKey: string;
  base64: string;
  mimeType: string;
}): Promise<DeviceIdentity> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error('请先在设置里保存 DeepSeek API Key');
  const base64 = input.base64.replace(/\s/g, '');
  if (!base64) throw new Error('这张图片没有可读数据，请重新选择');
  if (base64.length > 24 * 1024 * 1024) {
    throw new Error('图片太大，请换一张更小的照片');
  }

  const text = await completeVision({
    apiKey,
    base64,
    mimeType: input.mimeType,
    prompt: OCR_PROMPT,
    maxTokens: 256,
    json: true,
  });
  if (!text) throw new Error('模型没有返回结果，请再试一次');
  const identity = parseBambuScreen(text);
  if (!identity.ip && !identity.code) {
    throw new Error('没有识别到 IP 或访问码，请让屏幕上的这两项更清晰');
  }
  return identity;
}

async function completeVision(input: {
  apiKey: string;
  base64: string;
  mimeType: string;
  prompt: string;
  maxTokens: number;
  json?: boolean;
}): Promise<string> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error('请先在设置里保存 DeepSeek API Key');
  const base64 = input.base64.replace(/\s/g, '');
  if (!base64) throw new Error('这张图片没有可读数据，请重新选择');
  if (base64.length > 24 * 1024 * 1024) {
    throw new Error('图片太大，请换一张更小的照片');
  }
  const mime = input.mimeType.startsWith('image/') ? input.mimeType : 'image/jpeg';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'deepseek-flash',
        thinking: { type: 'disabled' },
        reasoning_effort: 'none',
        temperature: 0.1,
        max_tokens: input.maxTokens,
        stream: false,
        ...(input.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: input.prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mime};base64,${base64}`,
                  detail: 'original',
                },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(await readError(response, '识别失败'));
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return stripCodeFence(data.choices?.[0]?.message?.content?.trim() ?? '');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('识别超时，请换一张更小的图片再试');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function stripCodeFence(raw: string) {
  return raw.replace(/^```(?:text|markdown|json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function explainDeepseekError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('insufficient balance') || text.includes('insufficient_quota')) {
    return 'DeepSeek 账户余额不足，请到 platform.deepseek.com 充值后再试';
  }
  if (text.includes('unsupported image')) {
    return '这张照片的格式不能识别，请换一张 JPEG 或 PNG';
  }
  return message;
}

async function readError(response: Response, fallback: string): Promise<string> {
  if (response.status === 401) return 'API Key 不正确或已失效';
  if (response.status === 402) return 'DeepSeek 账户余额不足，请到 platform.deepseek.com 充值后再试';
  if (response.status === 429) return '请求太频繁，请稍后再试';
  const raw = await response.text().catch(() => '');
  try {
    const body = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    const message =
      typeof body.error === 'string'
        ? body.error
        : body.error?.message || body.message;
    if (message) return explainDeepseekError(message);
  } catch {
    /* 非 JSON */
  }
  return raw.trim().slice(0, 180) || `${fallback}（HTTP ${response.status}）`;
}
