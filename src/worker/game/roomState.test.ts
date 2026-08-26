import { describe, expect, it } from "vitest";
import {
  activeStateAfterReconnect,
  activeMatchPlayerIds,
  applyPlayerDeparture,
  allActivePlayersSubmitted,
  allLobbyPlayersReady,
  canReceiveRoomBroadcast,
  expiredPlayerDisposition,
  lowestAvailableSlotIndex,
  scoreVisibleToViewer,
  selectHostPlayerId,
  shouldFinishMatchAfterDeparture,
  shouldRetainForRematch,
  toggledReadyState,
  validateGuess,
  validateMatchStart,
  type GuessValidationInput,
} from "./roomState";

interface DeparturePlayer {
  id: string;
  nickname: string;
  joinedAt: number;
  slotIndex: number;
  active: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
  disconnectExpiresAt: number | null;
}

function departurePlayer(
  id: string,
  slotIndex: number,
  overrides: Partial<DeparturePlayer> = {},
): DeparturePlayer {
  return {
    id,
    nickname: id.toUpperCase(),
    joinedAt: slotIndex * 10,
    slotIndex,
    active: true,
    connected: true,
    ready: true,
    score: 100 + slotIndex,
    disconnectExpiresAt: 30_000,
    ...overrides,
  };
}

const valid: GuessValidationInput = {
  playerExists: true,
  status: "playing",
  submittedRound: 2,
  currentRound: 2,
  eventId: "event-a",
  processedEventIds: [],
  alreadySubmitted: false,
  now: 15_000,
  roundEndsAt: 20_000,
};

describe("guess validation", () => {
  it("accepts a current, first submission", () => {
    expect(validateGuess(valid)).toBeNull();
  });

  it("rejects a duplicate event id", () => {
    expect(validateGuess({ ...valid, processedEventIds: ["event-a"] })).toBe("ALREADY_SUBMITTED");
  });

  it("rejects a second submission with a new event id", () => {
    expect(validateGuess({ ...valid, alreadySubmitted: true })).toBe("ALREADY_SUBMITTED");
  });

  it("rejects stale rounds and expired deadlines", () => {
    expect(validateGuess({ ...valid, submittedRound: 1 })).toBe("ROUND_EXPIRED");
    expect(validateGuess({ ...valid, now: 20_001 })).toBe("ROUND_EXPIRED");
    expect(validateGuess({ ...valid, status: "round_result" })).toBe("ROUND_EXPIRED");
  });

  it("rejects a player that is not part of the room", () => {
    expect(validateGuess({ ...valid, playerExists: false })).toBe("INVALID_PLAYER");
  });
});

describe("viewer-specific score visibility", () => {
  const submittedPlayer = {
    status: "playing" as const,
    playerId: "player-a",
    totalScore: 1_697.5,
    currentRoundPoints: 497.5,
  };

  it("shows the submitting player their own updated total immediately", () => {
    expect(scoreVisibleToViewer({ ...submittedPlayer, viewerPlayerId: "player-a" })).toBe(1_698);
  });

  it("keeps other players and unauthenticated sockets on the pre-round total", () => {
    for (const viewerPlayerId of ["player-b", "player-c", "player-d", "player-e"]) {
      expect(scoreVisibleToViewer({ ...submittedPlayer, viewerPlayerId })).toBe(1_200);
    }
    expect(scoreVisibleToViewer({ ...submittedPlayer, viewerPlayerId: null })).toBe(1_200);
  });

  it.each(["round_result", "finished", "waiting"] as const)("reveals the synchronized total during %s", (status) => {
    expect(scoreVisibleToViewer({ ...submittedPlayer, status, viewerPlayerId: "player-b" })).toBe(1_698);
  });

  it("leaves another player's score unchanged before that player submits", () => {
    expect(scoreVisibleToViewer({
      status: "playing",
      playerId: "player-b",
      viewerPlayerId: "player-a",
      totalScore: 800,
      currentRoundPoints: 0,
    })).toBe(800);
  });

  it("never exposes a negative score from inconsistent legacy state", () => {
    expect(scoreVisibleToViewer({ ...submittedPlayer, totalScore: 10, currentRoundPoints: 20, viewerPlayerId: "player-b" })).toBe(0);
  });
});

describe("lobby readiness", () => {
  it("toggles ready in both directions", () => {
    expect(toggledReadyState(false)).toBe(true);
    expect(toggledReadyState(true)).toBe(false);
  });

  it("accepts every connected active player only for two-to-five player lobbies", () => {
    for (const playerCount of [2, 3, 4, 5]) {
      expect(allLobbyPlayersReady(Array.from({ length: playerCount }, () => ({ ready: true })))).toBe(true);
    }
    expect(allLobbyPlayersReady([{ ready: true }, { ready: false }])).toBe(false);
    expect(allLobbyPlayersReady([{ ready: true }])).toBe(false);
    expect(allLobbyPlayersReady(Array.from({ length: 6 }, () => ({ ready: true })))).toBe(false);
    expect(allLobbyPlayersReady([
      { ready: true, connected: true, active: true },
      { ready: true, connected: false, active: true },
    ])).toBe(false);
    expect(allLobbyPlayersReady([
      { ready: true, connected: true, active: true },
      { ready: true, connected: true, active: true },
      { ready: false, connected: false, active: false },
    ])).toBe(true);
  });

  it("allows only the host to start a fully ready two-to-five player lobby", () => {
    const readyPlayers = [
      { ready: true, connected: true, active: true },
      { ready: true, connected: true, active: true },
    ];
    for (const playerCount of [2, 3, 4, 5]) {
      expect(validateMatchStart({
        status: "waiting",
        requestingPlayerId: "host",
        hostPlayerId: "host",
        players: Array.from({ length: playerCount }, () => ({ ready: true, connected: true, active: true })),
      })).toBeNull();
    }
    expect(validateMatchStart({
      status: "waiting",
      requestingPlayerId: "guest",
      hostPlayerId: "host",
      players: readyPlayers,
    })).toBe("NOT_HOST");
    expect(validateMatchStart({
      status: "waiting",
      requestingPlayerId: "host",
      hostPlayerId: "host",
      players: [{ ready: true, connected: true, active: true }],
    })).toBe("NOT_ENOUGH_PLAYERS");
    expect(validateMatchStart({
      status: "waiting",
      requestingPlayerId: "host",
      hostPlayerId: "host",
      players: Array.from({ length: 6 }, () => ({ ready: true, connected: true, active: true })),
    })).toBe("NOT_ENOUGH_PLAYERS");
    expect(validateMatchStart({
      status: "waiting",
      requestingPlayerId: "host",
      hostPlayerId: "host",
      players: [{ ready: true }, { ready: false }],
    })).toBe("PLAYERS_NOT_READY");
  });

  it("allocates the lowest free slot and enforces capacity", () => {
    for (let playerCount = 0; playerCount < 5; playerCount += 1) {
      expect(lowestAvailableSlotIndex(
        Array.from({ length: playerCount }, (_, slotIndex) => ({ slotIndex })),
      )).toBe(playerCount);
    }
    expect(lowestAvailableSlotIndex([{ slotIndex: 0 }, { slotIndex: 2 }])).toBe(1);
    expect(lowestAvailableSlotIndex(Array.from({ length: 5 }, (_, slotIndex) => ({ slotIndex })))).toBeNull();
    expect(lowestAvailableSlotIndex(Array.from({ length: 6 }, (_, slotIndex) => ({ slotIndex })))).toBeNull();
  });

  it("serializes two slot-five claims so only one can reach capacity", () => {
    const players = Array.from({ length: 4 }, (_, slotIndex) => ({ slotIndex }));
    const firstClaim = lowestAvailableSlotIndex(players);
    expect(firstClaim).toBe(4);
    players.push({ slotIndex: firstClaim! });
    const secondClaim = lowestAvailableSlotIndex(players);
    expect(players).toHaveLength(5);
    expect(secondClaim).toBeNull();
  });

  it("transfers host deterministically by join time then slot", () => {
    expect(selectHostPlayerId([
      { id: "later", joinedAt: 20, slotIndex: 0, active: true },
      { id: "slot-two", joinedAt: 10, slotIndex: 2, active: true },
      { id: "slot-one", joinedAt: 10, slotIndex: 1, active: true },
      { id: "inactive", joinedAt: 0, slotIndex: 3, active: false },
    ])).toBe("slot-one");
    expect(selectHostPlayerId([])).toBeNull();
  });

  it("preserves match order while excluding DNF participants from barriers", () => {
    const activePlayerIds = activeMatchPlayerIds(["a", "b", "c", "d"], ["b", "d"]);
    expect(activePlayerIds).toEqual(["a", "c"]);
    expect(allActivePlayersSubmitted(activePlayerIds, { a: {}, b: {}, c: {} })).toBe(true);
    expect(allActivePlayersSubmitted(activePlayerIds, { a: {}, b: {} })).toBe(false);
    expect(allActivePlayersSubmitted([], {})).toBe(true);
  });

  it("tracks five independent player submissions before ending a round early", () => {
    const playerIds = ["p1", "p2", "p3", "p4", "p5"];
    const fiveGuesses = Object.fromEntries(playerIds.map((playerId, index) => [playerId, { point: index }]));
    expect(Object.keys(fiveGuesses)).toHaveLength(5);
    expect(allActivePlayersSubmitted(playerIds, fiveGuesses)).toBe(true);
    expect(allActivePlayersSubmitted(playerIds, { ...fiveGuesses, p5: undefined })).toBe(false);
  });

  it("restores an in-grace reconnect without reactivating an already-DNF player", () => {
    expect(activeStateAfterReconnect("waiting", false)).toBe(true);
    expect(activeStateAfterReconnect("playing", true)).toBe(true);
    expect(activeStateAfterReconnect("playing", false)).toBe(false);
    expect(expiredPlayerDisposition("waiting")).toBe("remove");
    expect(expiredPlayerDisposition("round_preparing")).toBe("inactive");
    expect(expiredPlayerDisposition("playing")).toBe("inactive");
  });

  it("never broadcasts private room state to an anonymous or removed socket", () => {
    expect(canReceiveRoomBroadcast(["a", "b", "c"], "a")).toBe(true);
    expect(canReceiveRoomBroadcast(["a", "b", "c"], null)).toBe(false);
    expect(canReceiveRoomBroadcast(["a", "b", "c"], "removed-player")).toBe(false);
  });

  it("keeps a temporarily disconnected rematch player until reconnect grace expires", () => {
    expect(shouldRetainForRematch({ connected: true, disconnectExpiresAt: null }, 1_000)).toBe(true);
    expect(shouldRetainForRematch({ connected: false, disconnectExpiresAt: 1_001 }, 1_000)).toBe(true);
    expect(shouldRetainForRematch({ connected: false, disconnectExpiresAt: 1_000 }, 1_000)).toBe(false);
    expect(shouldRetainForRematch({ connected: false, disconnectExpiresAt: null }, 1_000)).toBe(false);
  });
});

describe("authoritative player departure", () => {
  it("removes a waiting host immediately and transfers host deterministically", () => {
    const players = [
      departurePlayer("host", 0, { joinedAt: 0 }),
      departurePlayer("later-slot", 1, { joinedAt: 20 }),
      departurePlayer("earlier-slot", 2, { joinedAt: 10 }),
    ];

    const result = applyPlayerDeparture({
      status: "waiting",
      players,
      hostPlayerId: "host",
      inactivePlayerIds: ["host", "host"],
      playerId: "host",
    });

    expect(result.changed).toBe(true);
    expect(result.players.map((player) => player.id)).toEqual(["later-slot", "earlier-slot"]);
    expect(result.hostPlayerId).toBe("earlier-slot");
    expect(result.inactivePlayerIds).toEqual([]);
  });

  it("preserves an active host when a different waiting player leaves", () => {
    const result = applyPlayerDeparture({
      status: "waiting",
      players: [departurePlayer("host", 0), departurePlayer("guest", 1)],
      hostPlayerId: "host",
      inactivePlayerIds: [],
      playerId: "guest",
    });

    expect(result.hostPlayerId).toBe("host");
    expect(result.players.map((player) => player.id)).toEqual(["host"]);
  });

  it("retains an active-match player's identity and score while marking them DNF", () => {
    const host = departurePlayer("host", 0, { score: 417 });
    const guest = departurePlayer("guest", 1, { score: 293 });
    const result = applyPlayerDeparture({
      status: "playing",
      players: [host, guest],
      hostPlayerId: "host",
      inactivePlayerIds: ["legacy-dnf", "legacy-dnf"],
      playerId: "host",
    });
    const departed = result.players.find((player) => player.id === "host");

    expect(result.changed).toBe(true);
    expect(departed).toMatchObject({
      id: "host",
      nickname: "HOST",
      slotIndex: 0,
      joinedAt: 0,
      score: 417,
      active: false,
      connected: false,
      ready: false,
      disconnectExpiresAt: null,
    });
    expect(result.inactivePlayerIds).toEqual(["legacy-dnf", "host"]);
    expect(result.hostPlayerId).toBe("guest");
  });

  it("is idempotent after the same active-match player has already departed", () => {
    const initial = applyPlayerDeparture({
      status: "round_preparing",
      players: [departurePlayer("host", 0), departurePlayer("guest", 1)],
      hostPlayerId: "host",
      inactivePlayerIds: [],
      playerId: "guest",
    });
    const repeated = applyPlayerDeparture({
      status: "round_preparing",
      players: initial.players,
      hostPlayerId: initial.hostPlayerId,
      inactivePlayerIds: initial.inactivePlayerIds,
      playerId: "guest",
    });

    expect(initial.changed).toBe(true);
    expect(repeated.changed).toBe(false);
    expect(repeated).toMatchObject({
      players: initial.players,
      hostPlayerId: "host",
      inactivePlayerIds: ["guest"],
    });
  });

  it("is a no-op for a player that is no longer in the authoritative room state", () => {
    const players = [departurePlayer("host", 0)];
    const result = applyPlayerDeparture({
      status: "waiting",
      players,
      hostPlayerId: "host",
      inactivePlayerIds: [],
      playerId: "missing",
    });

    expect(result.changed).toBe(false);
    expect(result).toMatchObject({ players, hostPlayerId: "host", inactivePlayerIds: [] });
  });

  it("continues with two survivors but finishes a live match with only one", () => {
    const threePlayerDeparture = applyPlayerDeparture({
      status: "playing",
      players: [departurePlayer("p1", 0), departurePlayer("p2", 1), departurePlayer("p3", 2)],
      hostPlayerId: "p1",
      inactivePlayerIds: [],
      playerId: "p3",
    });
    const twoSurvivors = activeMatchPlayerIds(
      ["p1", "p2", "p3"],
      threePlayerDeparture.inactivePlayerIds,
    );
    expect(twoSurvivors).toEqual(["p1", "p2"]);
    expect(shouldFinishMatchAfterDeparture("playing", twoSurvivors.length)).toBe(false);

    const twoPlayerDeparture = applyPlayerDeparture({
      status: "playing",
      players: [departurePlayer("p1", 0), departurePlayer("p2", 1)],
      hostPlayerId: "p1",
      inactivePlayerIds: [],
      playerId: "p2",
    });
    const oneSurvivor = activeMatchPlayerIds(["p1", "p2"], twoPlayerDeparture.inactivePlayerIds);
    expect(oneSurvivor).toEqual(["p1"]);
    expect(shouldFinishMatchAfterDeparture("playing", oneSurvivor.length)).toBe(true);
  });

  it.each(["round_preparing", "playing", "round_result"] as const)(
    "finishes %s below the multiplayer minimum",
    (status) => {
      expect(shouldFinishMatchAfterDeparture(status, 0)).toBe(true);
      expect(shouldFinishMatchAfterDeparture(status, 1)).toBe(true);
      expect(shouldFinishMatchAfterDeparture(status, 2)).toBe(false);
      expect(shouldFinishMatchAfterDeparture(status, 5)).toBe(false);
    },
  );

  it("does not finish waiting or already-finished rooms based on active match count", () => {
    expect(shouldFinishMatchAfterDeparture("waiting", 0)).toBe(false);
    expect(shouldFinishMatchAfterDeparture("waiting", 1)).toBe(false);
    expect(shouldFinishMatchAfterDeparture("finished", 0)).toBe(false);
    expect(shouldFinishMatchAfterDeparture("finished", 1)).toBe(false);
  });
});
