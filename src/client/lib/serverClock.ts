const CLOCK_SAMPLE_LIMIT = 5;
const MAX_ACCEPTED_RTT_MS = 10_000;
const CLOCK_SMOOTHING_ALPHA = 0.25;

export interface ServerClockSample {
  rttMs: number;
  offsetMs: number;
}

export interface ServerClockEstimate extends ServerClockSample {
  synchronizedOffsetMs: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function createServerClockSample(
  clientSentAt: number,
  serverNow: number,
  clientReceivedAt: number,
): ServerClockSample | null {
  if (![clientSentAt, serverNow, clientReceivedAt].every(Number.isFinite)) return null;
  const rttMs = clientReceivedAt - clientSentAt;
  if (rttMs < 0 || rttMs > MAX_ACCEPTED_RTT_MS) return null;
  return {
    rttMs,
    offsetMs: serverNow + rttMs / 2 - clientReceivedAt,
  };
}

export function estimatedServerNow(clientNow: number, serverClockOffsetMs: number): number {
  return clientNow + serverClockOffsetMs;
}

export class ServerClockEstimator {
  private samples: ServerClockSample[] = [];
  private synchronizedOffsetMs: number | null = null;

  addSample(clientSentAt: number, serverNow: number, clientReceivedAt: number): ServerClockEstimate | null {
    const sample = createServerClockSample(clientSentAt, serverNow, clientReceivedAt);
    if (!sample) return null;

    this.samples = [...this.samples, sample].slice(-CLOCK_SAMPLE_LIMIT);
    const medianRtt = median(this.samples.map((candidate) => candidate.rttMs));
    const outlierThreshold = Math.max(medianRtt * 2.5, medianRtt + 250);
    const usableSamples = this.samples.filter((candidate) => candidate.rttMs <= outlierThreshold);
    const targetOffset = median(usableSamples.map((candidate) => candidate.offsetMs));

    this.synchronizedOffsetMs = this.synchronizedOffsetMs === null
      ? targetOffset
      : this.synchronizedOffsetMs + (targetOffset - this.synchronizedOffsetMs) * CLOCK_SMOOTHING_ALPHA;

    return { ...sample, synchronizedOffsetMs: this.synchronizedOffsetMs };
  }

  reset(): void {
    this.samples = [];
    this.synchronizedOffsetMs = null;
  }
}
