const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:5173";
const wsBaseUrl = baseUrl.replace(/^http/, "ws");

class TestClient {
  constructor(name, playerId, roomCode) {
    this.name = name;
    this.playerId = playerId;
    this.roomCode = roomCode;
    this.lastState = null;
    this.lastError = null;
  }

  async connect() {
    this.socket = new WebSocket(`${wsBaseUrl}/ws/${this.roomCode}`);
    this.socket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data));
      if (event.type === "room:state") this.lastState = event.payload;
      if (event.type === "error") this.lastError = event.payload;
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} WebSocket open timed out`)), 5_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => reject(new Error(`${this.name} WebSocket failed`)), { once: true });
    });
    this.send({ type: "player:join", payload: { playerId: this.playerId, nickname: this.name } });
    await this.waitFor((state) => state.players.some((player) => player.id === this.playerId));
  }

  async waitForError(code, timeoutMs = 8_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.lastError?.code === code) return this.lastError;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${this.name} timed out waiting for ${code}`);
  }

  send(event) {
    this.socket.send(JSON.stringify(event));
  }

  async waitFor(predicate, timeoutMs = 8_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.lastState && predicate(this.lastState)) return this.lastState;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${this.name} timed out waiting for room state`);
  }

  close() {
    this.socket?.close(1000, "Smoke test complete");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeScore(points) {
  return Math.round(points * 1_000) / 1_000;
}

const createResponse = await fetch(`${baseUrl}/api/rooms`, { method: "POST" });
assert(createResponse.status === 201, `Expected room creation 201, got ${createResponse.status}`);
const { roomCode } = await createResponse.json();
assert(/^[A-HJ-NP-Z2-9]{5}$/.test(roomCode), `Invalid room code: ${roomCode}`);

const existsResponse = await fetch(`${baseUrl}/api/rooms/${roomCode}`);
assert(existsResponse.ok, "Created room was not discoverable");

const alpha = new TestClient("Alpha", crypto.randomUUID(), roomCode);
const bravo = new TestClient("Bravo", crypto.randomUUID(), roomCode);
let activeAlpha = alpha;

try {
  await Promise.all([alpha.connect(), bravo.connect()]);
  await Promise.all([
    alpha.waitFor((state) => state.players.length === 2),
    bravo.waitFor((state) => state.players.length === 2),
  ]);

  if (alpha.lastState.questionCount === 0) {
    assert(alpha.lastState.status === "waiting", "Empty content library did not stay in the lobby");
    alpha.send({ type: "player:ready" });
    await alpha.waitForError("NO_QUESTIONS_AVAILABLE");
    assert(alpha.lastState.status === "waiting", "Ready unexpectedly started a game with no real questions");
    console.log(JSON.stringify({ ok: true, mode: "empty-real-content", roomCode, readyBlocked: true }, null, 2));
  } else {
  alpha.send({ type: "player:ready" });
  bravo.send({ type: "player:ready" });
  const [alphaRound, bravoRound] = await Promise.all([
    alpha.waitFor((state) => state.status === "playing"),
    bravo.waitFor((state) => state.status === "playing"),
  ]);

  let currentAlphaRound = alphaRound;
  let currentBravoRound = bravoRound;
  const roundsToPlay = alphaRound.totalRounds;
  for (let round = 1; round <= roundsToPlay; round += 1) {
    assert(currentAlphaRound.currentQuestion.questionId === currentBravoRound.currentQuestion.questionId, `Round ${round} question IDs differ`);
    assert(currentAlphaRound.roundEndsAt === currentBravoRound.roundEndsAt, `Round ${round} deadlines differ`);
    assert(/^q-[a-z0-9]+$/.test(currentAlphaRound.currentQuestion.questionId), "Question ID is not opaque");
    assert(/^\/media\/questions\/[A-Za-z0-9_-]{12,80}$/.test(currentAlphaRound.currentQuestion.imageUrl), "Image URL is not opaque");
    const playingPayload = JSON.stringify(currentAlphaRound);
    for (const forbiddenKey of ["correctMapId", "correctLayerId", "correctPoint", "worldPosition", "viewAngle", "acceptedLocations", "locationGuess"]) {
      assert(!playingPayload.includes(forbiddenKey), `Playing state leaked ${forbiddenKey}`);
    }

    const previousAlphaScore = currentAlphaRound.players.find((player) => player.id === alpha.playerId)?.score;
    assert(typeof previousAlphaScore === "number", `Round ${round} is missing Alpha's starting score`);
    activeAlpha.send({
      type: "guess:submit",
      payload: { round, eventId: crypto.randomUUID(), mapId: "mirage", layerId: "main", point: { x: 0.2, y: 0.3 } },
    });
    const [alphaSubmittedState, bravoObservingState] = await Promise.all([
      activeAlpha.waitFor((state) => state.status === "playing" && state.round === round && state.players.some((player) => player.id === alpha.playerId && player.submitted)),
      bravo.waitFor((state) => state.status === "playing" && state.round === round && state.players.some((player) => player.id === alpha.playerId && player.submitted)),
    ]);
    const alphaScoreForSelf = alphaSubmittedState.players.find((player) => player.id === alpha.playerId)?.score;
    const alphaScoreForBravo = bravoObservingState.players.find((player) => player.id === alpha.playerId)?.score;
    assert(alphaScoreForBravo === previousAlphaScore, `Round ${round} leaked Alpha's current-round score to Bravo`);
    bravo.send({
      type: "guess:submit",
      payload: { round, eventId: crypto.randomUUID(), mapId: "overpass", layerId: "main", point: { x: 0.8, y: 0.7 } },
    });
    const [alphaResult] = await Promise.all([
      activeAlpha.waitFor((state) => state.status === "round_result" && state.round === round),
      bravo.waitFor((state) => state.status === "round_result" && state.round === round),
    ]);
    assert(alphaResult.roundResult?.correctMapId, "Round result did not reveal the answer");
    assert(alphaResult.roundResult?.correctPoint, "Round result did not reveal the correct point");
    const alphaRoundResult = alphaResult.roundResult.players.find((player) => player.playerId === alpha.playerId);
    const bravoRoundResult = alphaResult.roundResult.players.find((player) => player.playerId === bravo.playerId);
    assert(alphaRoundResult?.pointGuess?.x === 0.2 && alphaRoundResult?.pointGuess?.y === 0.3, "Player 1 point was not preserved");
    assert(bravoRoundResult?.pointGuess?.x === 0.8 && bravoRoundResult?.pointGuess?.y === 0.7, "Player 2 point was not preserved");
    const expectedAlphaScore = normalizeScore(previousAlphaScore + alphaRoundResult.points);
    assert(alphaScoreForSelf === expectedAlphaScore, `Round ${round} did not update Alpha's own score immediately`);
    assert(alphaResult.players.find((player) => player.id === alpha.playerId)?.score === expectedAlphaScore, `Round ${round} did not reveal Alpha's score after result`);
    assert(alphaResult.players.every((player) => player.submitted), "Submission status was not synchronized");

    if (round === 1) {
      activeAlpha.close();
      activeAlpha = new TestClient("Alpha", alpha.playerId, roomCode);
      await activeAlpha.connect();
      const restored = await activeAlpha.waitFor((state) => state.status === "round_result" && state.round === 1);
      assert(restored.players.some((player) => player.id === alpha.playerId), "Reload created a different player identity");
      assert(restored.players.length === 2, "Reload duplicated or removed a player");
    }

    if (round < roundsToPlay) {
      [currentAlphaRound, currentBravoRound] = await Promise.all([
        activeAlpha.waitFor((state) => state.status === "playing" && state.round === round + 1),
        bravo.waitFor((state) => state.status === "playing" && state.round === round + 1),
      ]);
    }
  }

  const finalState = await activeAlpha.waitFor((state) => state.status === "finished" && state.round === roundsToPlay);
  assert(finalState.players.length === 2, "Final result is missing a player");
  activeAlpha.send({ type: "game:play-again" });
  const replayState = await activeAlpha.waitFor((state) => state.status === "waiting" && state.round === 0);
  assert(replayState.players.every((player) => player.score === 0 && !player.ready), "Play again did not reset scores and ready state");

  console.log(JSON.stringify({
    ok: true,
    roomCode,
    roundsCompleted: roundsToPlay,
    answersHiddenDuringRound: true,
    deadlineSynchronized: true,
    opponentScoreHiddenUntilResult: true,
    ownScoreUpdatedImmediately: true,
    reconnectRestored: true,
    gameFinished: true,
    playAgainReset: true,
  }, null, 2));
  }
} finally {
  activeAlpha.close();
  bravo.close();
}
