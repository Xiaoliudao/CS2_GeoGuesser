// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameSocket } from "./useGameSocket";

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("Socket is not open");
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  serverMessage(payload: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }

  serverClose(code: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code }));
  }
}

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return url.endsWith("/preview")
      ? response(200, { exists: true, reconnectable: true })
      : response(200, { exists: true });
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function connectedHook() {
  const hook = renderHook(() => useGameSocket("ABCDE", "player-1", "Player 1"));
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => FakeWebSocket.instances[0].open());
  return hook;
}

describe("useGameSocket intentional leave handshake", () => {
  it("ignores unrelated server errors while waiting for the authoritative leave acknowledgement", async () => {
    const hook = await connectedHook();
    const socket = FakeWebSocket.instances[0];
    let settled = false;
    let leavePromise!: Promise<void>;

    act(() => {
      leavePromise = hook.result.current.leaveRoom();
      void leavePromise.finally(() => { settled = true; });
    });
    expect(socket.sent.map((message) => JSON.parse(message).type)).toContain("player:leave");

    act(() => socket.serverMessage({
      type: "error",
      payload: { code: "ROUND_EXPIRED", message: "An older round expired." },
    }));
    await Promise.resolve();
    expect(settled).toBe(false);

    act(() => socket.serverMessage({
      type: "player:left",
      payload: { playerId: "player-1", stateVersion: 4 },
    }));
    await expect(leavePromise).resolves.toBeUndefined();
    await waitFor(() => expect(hook.result.current.leaveConfirmed).toBe(true));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("publishes a late confirmation even after the request timeout has made the dialog retryable", async () => {
    let timeoutCallback: (() => void) | null = null;
    const nativeSetTimeout = window.setTimeout.bind(window);
    const timeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 5_000) {
        timeoutCallback = () => {
          if (typeof handler === "function") handler(...args);
        };
        return 501;
      }
      return nativeSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout);
    const hook = await connectedHook();
    const socket = FakeWebSocket.instances[0];
    let leavePromise!: Promise<void>;

    act(() => { leavePromise = hook.result.current.leaveRoom(); });
    const rejection = leavePromise.catch((error: unknown) => error);
    act(() => { timeoutCallback?.(); });
    await expect(rejection).resolves.toBeInstanceOf(Error);
    expect(hook.result.current.leaveConfirmed).toBe(false);

    act(() => socket.serverMessage({
      type: "player:left",
      payload: { playerId: "player-1", stateVersion: 5 },
    }));
    await waitFor(() => expect(hook.result.current.leaveConfirmed).toBe(true));
  });

  it("reconnects in leave-handshake mode instead of silently rejoining after an abnormal close", async () => {
    const hook = await connectedHook();
    const firstSocket = FakeWebSocket.instances[0];
    let reconnectCallback: (() => void) | null = null;
    const nativeSetTimeout = window.setTimeout.bind(window);
    const timeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (typeof timeout === "number" && timeout < 5_000) {
        reconnectCallback = () => {
          if (typeof handler === "function") handler(...args);
        };
        return 502;
      }
      return nativeSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout);
    let leavePromise!: Promise<void>;

    act(() => { leavePromise = hook.result.current.leaveRoom(); });
    act(() => firstSocket.serverClose(1006));
    expect(reconnectCallback).not.toBeNull();
    const scheduledReconnect = reconnectCallback as (() => void) | null;
    timeoutSpy.mockRestore();
    await act(async () => {
      if (!scheduledReconnect) throw new Error("Reconnect was not scheduled");
      scheduledReconnect();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances).toHaveLength(2);

    const retrySocket = FakeWebSocket.instances[1];
    act(() => retrySocket.open());
    expect(retrySocket.sent.map((message) => JSON.parse(message).type)).toEqual([
      "player:join",
      "player:leave",
    ]);

    act(() => retrySocket.serverMessage({
      type: "player:left",
      payload: { playerId: "player-1", stateVersion: 6 },
    }));
    await expect(leavePromise).resolves.toBeUndefined();
    await waitFor(() => expect(hook.result.current.leaveConfirmed).toBe(true));
  });
});
