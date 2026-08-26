// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, navigate, registerNavigationBlocker } from "./App";

vi.mock("./pages/HomePage", () => ({
  HomePage: () => <div>HOME PAGE</div>,
}));

vi.mock("./pages/InviteJoinPage", () => ({
  InviteJoinPage: ({ roomCode }: { roomCode: string }) => <div>INVITE {roomCode}</div>,
}));

vi.mock("./pages/RoomPage", () => ({
  RoomPage: ({ roomCode }: { roomCode: string }) => <div>ROOM {roomCode}</div>,
}));

let unregisterBlocker: (() => void) | null = null;

beforeEach(() => {
  window.history.replaceState({ entry: "home" }, "", "/");
});

afterEach(() => {
  unregisterBlocker?.();
  unregisterBlocker = null;
  cleanup();
  vi.restoreAllMocks();
});

describe("App navigation blocker", () => {
  it("blocks an explicit push before history changes and evaluates an allowed synthetic pop only once", async () => {
    window.history.pushState({ entry: "room" }, "", "/room/ABCDE");
    render(<App />);
    expect(screen.getByText("ROOM ABCDE")).toBeTruthy();

    const blocker = vi.fn(({ path }: { path: string }) => path === "/");
    unregisterBlocker = registerNavigationBlocker(blocker);

    expect(navigate("/")).toBe(false);
    expect(window.location.pathname).toBe("/room/ABCDE");
    expect(screen.getByText("ROOM ABCDE")).toBeTruthy();
    expect(blocker).toHaveBeenCalledTimes(1);
    expect(blocker).toHaveBeenLastCalledWith({ path: "/", source: "push" });

    await act(async () => {
      expect(navigate("/join/87MDB")).toBe(true);
    });
    expect(window.location.pathname).toBe("/join/87MDB");
    expect(screen.getByText("INVITE 87MDB")).toBeTruthy();
    expect(blocker).toHaveBeenCalledTimes(2);
    expect(blocker).toHaveBeenLastCalledWith({ path: "/join/87MDB", source: "push" });
  });

  it("restores the committed route after a blocked browser pop and supports a confirmed bypass with replace", async () => {
    window.history.pushState({ entry: "room" }, "", "/room/ABCDE");
    render(<App />);
    const blocker = vi.fn(() => true);
    unregisterBlocker = registerNavigationBlocker(blocker);

    act(() => window.history.back());

    await waitFor(() => expect(blocker).toHaveBeenCalledWith({ path: "/", source: "pop" }));
    expect(window.location.pathname).toBe("/room/ABCDE");
    expect(window.history.state).toEqual({ entry: "room" });
    expect(screen.getByText("ROOM ABCDE")).toBeTruthy();

    const replaceState = vi.spyOn(window.history, "replaceState");
    await act(async () => {
      expect(navigate("/", { bypassBlocker: true, replace: true })).toBe(true);
    });

    expect(replaceState).toHaveBeenCalledWith({}, "", "/");
    expect(blocker).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/");
    expect(screen.getByText("HOME PAGE")).toBeTruthy();
  });

  it("stops blocking after the registration cleanup runs", async () => {
    window.history.pushState({ entry: "room" }, "", "/room/ABCDE");
    render(<App />);
    const blocker = vi.fn(() => true);
    unregisterBlocker = registerNavigationBlocker(blocker);
    unregisterBlocker();
    unregisterBlocker = null;

    act(() => window.history.back());

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(screen.getByText("HOME PAGE")).toBeTruthy();
    expect(blocker).not.toHaveBeenCalled();
  });
});
