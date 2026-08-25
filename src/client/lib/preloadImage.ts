import type { AssetLoadErrorReason } from "../../shared/protocol";

const DEFAULT_ATTEMPT_TIMEOUT_MS = 4_000;
const DEFAULT_RETRY_DELAYS_MS = [0, 500, 1_500] as const;

export interface PreloadImageLike {
  decoding?: "async" | "sync" | "auto";
  naturalWidth: number;
  complete: boolean;
  onload: ((event: Event) => unknown) | null;
  onerror: ((event: Event | string, source?: string, lineno?: number, colno?: number, error?: Error) => unknown) | null;
  src: string;
  decode?: () => Promise<void>;
}

export interface PreloadImageOptions {
  signal?: AbortSignal;
  attemptTimeoutMs?: number;
  retryDelaysMs?: readonly number[];
  jitterRatio?: number;
  random?: () => number;
  imageFactory?: () => PreloadImageLike;
}

export interface PreloadImageResult {
  url: string;
  attempts: number;
  elapsedMs: number;
}

export class ImagePreloadError extends Error {
  constructor(
    public readonly reason: AssetLoadErrorReason,
    public readonly url: string,
    public readonly attempts: number,
  ) {
    super(`IMAGE_PRELOAD_${reason}`);
    this.name = "ImagePreloadError";
  }
}

const inflight = new Map<string, Promise<PreloadImageResult>>();
const completed = new Set<string>();

function abortError(): DOMException {
  return new DOMException("Image preload aborted", "AbortError");
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, Math.max(0, delayMs));
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function withCallerAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function loadOnce(
  url: string,
  timeoutMs: number,
  imageFactory: () => PreloadImageLike,
): Promise<void> {
  const image = imageFactory();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      callback();
    };
    const timeout = globalThis.setTimeout(() => {
      finish(() => {
        image.src = "";
        reject(new ImagePreloadError("TIMEOUT", url, 1));
      });
    }, timeoutMs);
    image.onerror = () => finish(() => reject(new ImagePreloadError("NETWORK", url, 1)));
    image.onload = () => finish(resolve);
    image.src = url;
    if (image.complete && image.naturalWidth > 0) finish(resolve);
  });
  if (image.decode) {
    try {
      await image.decode();
    } catch {
      throw new ImagePreloadError("DECODE_ERROR", url, 1);
    }
  }
}

async function preloadWithRetries(url: string, options: PreloadImageOptions): Promise<PreloadImageResult> {
  const startedAt = performance.now();
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const jitterRatio = options.jitterRatio ?? 0.2;
  const random = options.random ?? Math.random;
  const imageFactory: () => PreloadImageLike = options.imageFactory ?? (() => new Image());
  let lastReason: AssetLoadErrorReason = "NETWORK";

  for (let index = 0; index < retryDelaysMs.length; index += 1) {
    if (index > 0) {
      const baseDelay = retryDelaysMs[index];
      const jitter = baseDelay * jitterRatio * (random() * 2 - 1);
      await wait(baseDelay + jitter);
    }
    try {
      await loadOnce(url, timeoutMs, imageFactory);
      return { url, attempts: index + 1, elapsedMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      if (error instanceof ImagePreloadError) lastReason = error.reason;
      else throw error;
    }
  }
  throw new ImagePreloadError(lastReason, url, retryDelaysMs.length);
}

export function preloadImage(url: string, options: PreloadImageOptions = {}): Promise<PreloadImageResult> {
  if (completed.has(url)) return Promise.resolve({ url, attempts: 0, elapsedMs: 0 });
  let shared = inflight.get(url);
  if (!shared) {
    shared = preloadWithRetries(url, { ...options, signal: undefined }).then((result) => {
      completed.add(url);
      return result;
    });
    inflight.set(url, shared);
    void shared.finally(() => {
      if (inflight.get(url) === shared) inflight.delete(url);
    }).catch(() => undefined);
  }
  return withCallerAbort(shared, options.signal);
}

export function clearImagePreloadCacheForTests(): void {
  inflight.clear();
  completed.clear();
}

export function isImagePreloaded(url: string): boolean {
  return completed.has(url);
}
