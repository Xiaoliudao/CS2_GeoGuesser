const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:5173";
const wsBaseUrl = baseUrl.replace(/^http/, "ws");

class TestClient {
  constructor(name, playerId, roomCode) {
    this.name = name;
    this.playerId = playerId;
    this.roomCode = roomCode;
    this.lastState = null;
    this.lastError = null;
    this.roundStarts = [];
    this.lastPong = null;
    this.leftAcknowledgements = [];
    this.kickedEvents = [];
  }

  async connect({ waitForJoin = true } = {}) {
    this.socket = new WebSocket(`${wsBaseUrl}/ws/${this.roomCode}`);
    this.socket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data));
      if (event.type === "room:state") this.lastState = event.payload;
      if (event.type === "round:start") this.roundStarts.push(event.payload);
      if (event.type === "pong") this.lastPong = event.payload;
      if (event.type === "player:left") this.leftAcknowledgements.push(event.payload);
      if (event.type === "room:kicked") this.kickedEvents.push(event.payload);
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
    if (!waitForJoin) return;
    await this.waitFor((state) => state.players.some((player) => player.id === this.playerId));
    const clientSentAt = Date.now();
    this.send({ type: "ping", payload: { clientSentAt } });
    const pong = await this.waitForPong(clientSentAt);
    if (!Number.isFinite(pong.serverNow)) throw new Error(`${this.name} pong omitted serverNow`);
  }

  async waitForPong(clientSentAt, timeoutMs = 8_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.lastPong?.clientSentAt === clientSentAt) return this.lastPong;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${this.name} timed out waiting for authoritative clock pong`);
  }

  async waitForRoundStart(round, timeoutMs = 8_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const payload = this.roundStarts.find((candidate) => candidate.round === round);
      if (payload) return payload;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${this.name} timed out waiting for round:start ${round}`);
  }

  async waitForError(code, timeoutMs = 8_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.lastError?.code === code) return this.lastError;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${this.name} timed out waiting for ${code}`);
  }

  async waitForJoinOrError(timeoutMs = 8_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.lastState?.players.some((player) => player.id === this.playerId)) return "joined";
      if (this.lastError?.code) return this.lastError.code;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${this.name} timed out waiting for a join outcome`);
  }

  async waitForLeft(playerId, timeoutMs = 8_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const acknowledgement = this.leftAcknowledgements.find((candidate) => candidate.playerId === playerId);
      if (acknowledgement) return acknowledgement;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${this.name} timed out waiting for player:left acknowledgement`);
  }

  async waitForKicked(timeoutMs = 8_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const event = this.kickedEvents.find((candidate) => candidate.reason === "KICKED_BY_HOST");
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${this.name} timed out waiting for room:kicked`);
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
  return Math.max(0, Math.round(points));
}

const availabilityResponse = await fetch(`${baseUrl}/api/questions/availability`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    mapPool: ["mirage", "inferno", "ancient", "nuke", "anubis", "dust2", "train", "overpass"],
    difficultyPool: ["hard"],
  }),
});
assert(availabilityResponse.ok, `Expected availability 200, got ${availabilityResponse.status}`);
const availability = await availabilityResponse.json();
if (availability.availableQuestions === 0) {
  console.log(JSON.stringify({ ok: true, mode: "empty-real-content", createBlocked: true }, null, 2));
  process.exit(0);
}
const availableMapPool = Object.entries(availability.byMap)
  .filter(([, count]) => count > 0)
  .map(([mapId]) => mapId);
const requestedSettings = {
  totalRounds: Math.min(5, availability.availableQuestions),
  roundDurationSeconds: 20,
  mapPool: availableMapPool,
  difficultyPool: ["hard"],
  serverRegion: "auto",
};
const firstLayerByMap = { nuke: "upper", train: "upper" };
const guessMapId = requestedSettings.mapPool[0];
const guessLayerId = firstLayerByMap[guessMapId] ?? "main";

const capacityHostId = crypto.randomUUID();
const capacityCreateResponse = await fetch(`${baseUrl}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    settings: requestedSettings,
    creator: { playerId: capacityHostId, nickname: "Capacity Host" },
  }),
});
assert(capacityCreateResponse.status === 201, `Expected capacity room creation 201, got ${capacityCreateResponse.status}`);
const { roomCode: capacityRoomCode } = await capacityCreateResponse.json();
const capacityHost = new TestClient("Capacity Host", capacityHostId, capacityRoomCode);
const capacityGuests = ["Guest 2", "Guest 3", "Guest 4"].map(
  (name) => new TestClient(name, crypto.randomUUID(), capacityRoomCode),
);
const slotFiveContenders = ["Race A", "Race B"].map(
  (name) => new TestClient(name, crypto.randomUUID(), capacityRoomCode),
);
try {
  await capacityHost.connect();
  assert(capacityHost.lastState.hostPlayerId === capacityHostId, "Room creator was not assigned as authoritative host");
  assert(capacityHost.lastState.players.find((player) => player.id === capacityHostId)?.slotIndex === 0, "Room creator did not retain P1");
  capacityHost.send({ type: "player:ready" });
  await capacityHost.waitFor((state) => state.players.find((player) => player.id === capacityHostId)?.ready === true);
  capacityHost.send({ type: "game:start" });
  await capacityHost.waitForError("NOT_ENOUGH_PLAYERS");

  await Promise.all(capacityGuests.map((client) => client.connect()));
  await capacityHost.waitFor((state) => state.status === "waiting" && state.players.length === 4);
  await Promise.all(slotFiveContenders.map((client) => client.connect({ waitForJoin: false })));
  const raceOutcomes = await Promise.all(slotFiveContenders.map((client) => client.waitForJoinOrError()));
  assert(raceOutcomes.filter((outcome) => outcome === "joined").length === 1, "Concurrent joins did not produce exactly one fifth player");
  assert(raceOutcomes.filter((outcome) => outcome === "ROOM_FULL").length === 1, "Concurrent sixth player was not rejected with ROOM_FULL");
  const winningContender = slotFiveContenders[raceOutcomes.indexOf("joined")];
  const rejectedContender = slotFiveContenders[raceOutcomes.indexOf("ROOM_FULL")];
  assert(rejectedContender.lastState === null, "Rejected anonymous socket received private room broadcasts");
  const fullState = await capacityHost.waitFor((state) => state.players.length === 5);
  assert(new Set(fullState.players.map((player) => player.slotIndex)).size === 5, "Five-player room assigned duplicate slots");
  const previewResponse = await fetch(`${baseUrl}/api/rooms/${capacityRoomCode}/preview`);
  const preview = await previewResponse.json();
  assert(preview.playerCount === 5 && preview.maxPlayers === 5 && preview.joinable === false, "Full invite preview is inconsistent");

  for (const client of [...capacityGuests, winningContender]) client.send({ type: "player:ready" });
  await capacityHost.waitFor((state) => state.players.length === 5 && state.players.every((player) => player.ready));
  capacityGuests[0].send({ type: "game:start" });
  await capacityGuests[0].waitForError("NOT_HOST");
  assert(capacityHost.lastState.status === "waiting", "Non-host unexpectedly started the match");

  const editableSettings = {
    totalRounds: requestedSettings.totalRounds,
    roundDurationSeconds: 30,
    mapPool: [...requestedSettings.mapPool].reverse(),
    difficultyPool: [...requestedSettings.difficultyPool],
  };
  capacityGuests[0].lastError = null;
  capacityGuests[0].send({ type: "room:update-settings", payload: { settings: editableSettings } });
  await capacityGuests[0].waitForError("NOT_HOST");
  assert(capacityHost.lastState.settings.roundDurationSeconds === 20, "Non-host changed authoritative settings");
  assert(capacityHost.lastState.players.every((player) => player.ready), "Rejected non-host update reset ready state");

  capacityHost.lastError = null;
  capacityHost.send({
    type: "room:update-settings",
    payload: { settings: { ...editableSettings, serverRegion: "asia" } },
  });
  await capacityHost.waitForError("INVALID_ROOM_SETTINGS");
  assert(capacityHost.lastState.settings.serverRegion === "auto", "Client-provided server region changed room placement");
  assert(capacityHost.lastState.players.every((player) => player.ready), "Invalid settings update reset ready state");

  const insufficientEntry = Object.entries(availability.byMap)
    .filter(([, count]) => count > 0 && count < 50)
    .sort((left, right) => left[1] - right[1])[0];
  if (insufficientEntry) {
    capacityHost.lastError = null;
    capacityHost.send({
      type: "room:update-settings",
      payload: {
        settings: {
          totalRounds: insufficientEntry[1] + 1,
          roundDurationSeconds: 30,
          mapPool: [insufficientEntry[0]],
          difficultyPool: ["hard"],
        },
      },
    });
    await capacityHost.waitForError("NOT_ENOUGH_QUESTIONS");
    assert(capacityHost.lastState.settings.roundDurationSeconds === 20, "Insufficient update partially mutated settings");
    assert(capacityHost.lastState.players.every((player) => player.ready), "Insufficient update reset ready state");
  }

  capacityHost.lastError = null;
  capacityHost.send({ type: "room:update-settings", payload: { settings: editableSettings } });
  const hostUpdatedState = await capacityHost.waitFor((state) => (
    state.status === "waiting"
      && state.settings.roundDurationSeconds === 30
      && state.players.every((player) => player.ready === false)
  ));
  assert(hostUpdatedState.roomCode === capacityRoomCode, "Settings update recreated or changed the room code");
  assert(hostUpdatedState.settings.serverRegion === requestedSettings.serverRegion, "Settings update changed fixed server placement");
  assert(
    JSON.stringify(hostUpdatedState.settings.mapPool) === JSON.stringify(requestedSettings.mapPool),
    "Settings update did not normalize map order canonically",
  );
  const updatedPreviewResponse = await fetch(`${baseUrl}/api/rooms/${capacityRoomCode}/preview`);
  const updatedPreview = await updatedPreviewResponse.json();
  assert(updatedPreview.settings.roundDurationSeconds === 30, "Invite preview did not use updated settings");

  for (const client of [capacityHost, ...capacityGuests, winningContender]) client.send({ type: "player:ready" });
  await capacityHost.waitFor((state) => state.players.length === 5 && state.players.every((player) => player.ready));

  capacityHost.send({ type: "player:leave" });
  await capacityHost.waitForLeft(capacityHostId);
  const hostTransferredState = await capacityGuests[0].waitFor(
    (state) => state.status === "waiting" && state.players.length === 4 && state.hostPlayerId !== capacityHostId,
  );
  assert(hostTransferredState.players.every((player) => player.id !== capacityHostId), "Waiting host was not removed immediately");
  assert(
    hostTransferredState.players.some((player) => player.id === hostTransferredState.hostPlayerId),
    "Waiting host transfer did not select a remaining player",
  );

  const remainingCapacityClients = [...capacityGuests, winningContender];
  const transferredHost = remainingCapacityClients.find(
    (client) => client.playerId === hostTransferredState.hostPlayerId,
  );
  assert(transferredHost, "Transferred host has no connected client");
  transferredHost.send({
    type: "room:update-settings",
    payload: { settings: { ...editableSettings, roundDurationSeconds: 45 } },
  });
  const transferredHostUpdate = await transferredHost.waitFor((state) => (
    state.status === "waiting"
      && state.settings.roundDurationSeconds === 45
      && state.players.every((player) => player.ready === false)
  ));
  assert(transferredHostUpdate.hostPlayerId === transferredHost.playerId, "Transferred host could not update settings");
  for (const client of remainingCapacityClients) client.send({ type: "player:ready" });
  await transferredHost.waitFor((state) => state.players.every((player) => player.ready));
  transferredHost.send({ type: "game:start" });
  const observer = remainingCapacityClients.find((client) => client !== transferredHost);
  const activeLeaver = remainingCapacityClients.find((client) => client !== transferredHost && client !== observer);
  assert(observer && activeLeaver, "Active leave smoke test could not select distinct players");
  const preparingBeforeLeave = await observer.waitFor(
    (state) => state.status === "round_preparing" && state.round === 1,
  );
  transferredHost.lastError = null;
  transferredHost.send({
    type: "room:update-settings",
    payload: { settings: { ...editableSettings, roundDurationSeconds: 20 } },
  });
  await transferredHost.waitForError("GAME_ALREADY_STARTED");
  assert(
    transferredHost.lastState.settings.roundDurationSeconds === 45,
    "Active-match settings update mutated the frozen match configuration",
  );
  activeLeaver.send({ type: "player:leave" });
  await activeLeaver.waitForLeft(activeLeaver.playerId);
  const preparingAfterLeave = await observer.waitFor(
    (state) => state.status === "round_preparing"
      && state.players.find((player) => player.id === activeLeaver.playerId)?.active === false,
  );
  assert(
    preparingAfterLeave.players.filter((player) => player.active).length === 3,
    "Active leave did not retain the expected three survivors",
  );
  assert(
    preparingAfterLeave.currentQuestion.questionId === preparingBeforeLeave.currentQuestion.questionId
      && preparingAfterLeave.prepareDeadline === preparingBeforeLeave.prepareDeadline,
    "Active leave restarted or invalidated the current question",
  );
  const secondActiveLeaver = remainingCapacityClients.find((client) => (
    client !== observer
      && preparingAfterLeave.players.find((player) => player.id === client.playerId)?.active === true
  ));
  assert(secondActiveLeaver, "Could not select a second active leaver");
  secondActiveLeaver.send({ type: "player:leave" });
  await secondActiveLeaver.waitForLeft(secondActiveLeaver.playerId);
  const twoPlayersRemain = await observer.waitFor(
    (state) => state.status === "round_preparing" && state.players.filter((player) => player.active).length === 2,
  );
  assert(
    twoPlayersRemain.currentQuestion.questionId === preparingBeforeLeave.currentQuestion.questionId,
    "Two remaining players did not continue the current question",
  );
  const finalActiveLeaver = remainingCapacityClients.find((client) => (
    client !== observer
      && client !== secondActiveLeaver
      && twoPlayersRemain.players.find((player) => player.id === client.playerId)?.active === true
  ));
  assert(finalActiveLeaver, "Could not select the final active leaver");
  finalActiveLeaver.send({ type: "player:leave" });
  await finalActiveLeaver.waitForLeft(finalActiveLeaver.playerId);
  const insufficientPlayersResult = await observer.waitFor(
    (state) => state.status === "finished" && state.players.filter((player) => player.active).length === 1,
  );
  assert(insufficientPlayersResult.currentQuestion, "Insufficient-player finish corrupted the current question state");
} finally {
  capacityHost.close();
  for (const client of [...capacityGuests, ...slotFiveContenders]) client.close();
}

const kickHostId = crypto.randomUUID();
const kickCreateResponse = await fetch(`${baseUrl}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    settings: requestedSettings,
    creator: { playerId: kickHostId, nickname: "Kick Host" },
  }),
});
assert(kickCreateResponse.status === 201, `Expected kick room creation 201, got ${kickCreateResponse.status}`);
const { roomCode: kickRoomCode } = await kickCreateResponse.json();
const kickHost = new TestClient("Kick Host", kickHostId, kickRoomCode);
const kickGuests = Array.from({ length: 4 }, (_, index) => (
  new TestClient(`Kick Guest ${index + 2}`, crypto.randomUUID(), kickRoomCode)
));
let kickedReconnect = null;
try {
  await Promise.all([kickHost.connect(), ...kickGuests.map((client) => client.connect())]);
  await kickHost.waitFor((state) => state.status === "waiting" && state.players.length === 5);

  kickGuests[0].send({ type: "player:kick", payload: { targetPlayerId: kickGuests[1].playerId } });
  await kickGuests[0].waitForError("NOT_HOST");
  assert(kickHost.lastState.players.length === 5, "A non-host kick request changed room membership");
  kickHost.send({ type: "player:kick", payload: { targetPlayerId: kickHost.playerId } });
  await kickHost.waitForError("CANNOT_KICK_HOST");
  assert(kickHost.lastState.hostPlayerId === kickHost.playerId, "The authoritative host was self-kicked");

  for (const client of [kickHost, ...kickGuests]) client.send({ type: "player:ready" });
  await kickHost.waitFor((state) => state.players.length === 5 && state.players.every((player) => player.ready));
  kickHost.send({ type: "game:start" });
  const kickPreparing = await kickHost.waitFor(
    (state) => state.status === "round_preparing" && state.round === 1,
  );
  const firstKickTarget = kickGuests[3];
  const preparingSurvivors = [kickHost, kickGuests[0], kickGuests[1], kickGuests[2]];
  for (const client of preparingSurvivors) {
    client.send({
      type: "round:asset-ready",
      payload: {
        round: 1,
        questionId: kickPreparing.currentQuestion.questionId,
        loadMs: 100,
      },
    });
  }
  await kickHost.waitFor((state) => (
    state.status === "round_preparing"
      && preparingSurvivors.every((client) => state.players.find((player) => player.id === client.playerId)?.assetReady)
  ));
  kickHost.send({ type: "player:kick", payload: { targetPlayerId: firstKickTarget.playerId } });
  await firstKickTarget.waitForKicked();
  const kickPlaying = await kickHost.waitFor((state) => (
    state.status === "playing"
      && state.round === 1
      && state.players.find((player) => player.id === firstKickTarget.playerId)?.active === false
  ));
  assert(kickPlaying.currentQuestion.questionId === kickPreparing.currentQuestion.questionId, "Preparing-phase kick changed the current question");
  assert(kickPlaying.players.filter((player) => player.active).length === 4, "Preparing-phase kick left the wrong active player count");
  await kickHost.waitForRoundStart(1);
  assert(kickHost.roundStarts.filter((payload) => payload.round === 1).length === 1, "Preparing-phase kick restarted the round timer");

  const kickedPreviewResponse = await fetch(`${baseUrl}/api/rooms/${kickRoomCode}/preview`, {
    headers: { "x-cs2-player-id": firstKickTarget.playerId },
  });
  const kickedPreview = await kickedPreviewResponse.json();
  assert(
    kickedPreview.joinable === false && kickedPreview.reconnectable === false && kickedPreview.reason === "kicked",
    "Kicked identity remained reconnectable in the invite preview",
  );
  kickedReconnect = new TestClient("Kick Guest Reconnect", firstKickTarget.playerId, kickRoomCode);
  await kickedReconnect.connect({ waitForJoin: false });
  await kickedReconnect.waitForKicked();
  assert(kickedReconnect.lastState === null, "A kicked identity silently restored room state");

  const playingKickTarget = kickGuests[2];
  const submitters = [kickHost, kickGuests[0], kickGuests[1]];
  for (const [index, client] of submitters.entries()) {
    client.send({
      type: "guess:submit",
      payload: {
        round: 1,
        eventId: crypto.randomUUID(),
        mapId: guessMapId,
        layerId: guessLayerId,
        point: { x: 0.25 + index * 0.1, y: 0.35 + index * 0.1 },
      },
    });
  }
  await kickHost.waitFor((state) => (
    state.status === "playing"
      && submitters.every((client) => state.players.find((player) => player.id === client.playerId)?.submitted)
  ));
  const playingDeadlineBeforeKick = kickHost.lastState.roundEndsAt;
  kickHost.send({ type: "player:kick", payload: { targetPlayerId: playingKickTarget.playerId } });
  await playingKickTarget.waitForKicked();
  const kickedRoundResult = await kickHost.waitFor((state) => (
    state.status === "round_result"
      && state.round === 1
      && state.players.find((player) => player.id === playingKickTarget.playerId)?.active === false
  ));
  assert(kickedRoundResult.currentQuestion.questionId === kickPlaying.currentQuestion.questionId, "Playing-phase kick changed the current question");
  assert(Number.isFinite(playingDeadlineBeforeKick), "Playing-phase kick test had no authoritative deadline");
  assert(kickHost.roundStarts.filter((payload) => payload.round === 1).length === 1, "Playing-phase kick restarted the timer");
  assert(
    kickedRoundResult.roundResult.players.filter((player) => submitters.some((client) => client.playerId === player.playerId)).every((player) => player.submitted),
    "Playing-phase kick did not finish after every remaining player had submitted",
  );
} finally {
  kickHost.close();
  for (const client of kickGuests) client.close();
  kickedReconnect?.close();
}

const alphaPlayerId = crypto.randomUUID();
const createResponse = await fetch(`${baseUrl}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    settings: requestedSettings,
    creator: { playerId: alphaPlayerId, nickname: "Alpha" },
  }),
});
assert(createResponse.status === 201, `Expected room creation 201, got ${createResponse.status}`);
const { roomCode, settings: createdSettings } = await createResponse.json();
assert(/^[A-HJ-NP-Z2-9]{5}$/.test(roomCode), `Invalid room code: ${roomCode}`);
assert(JSON.stringify(createdSettings) === JSON.stringify(requestedSettings), "Create response changed RoomSettings");

const existsResponse = await fetch(`${baseUrl}/api/rooms/${roomCode}`);
assert(existsResponse.ok, "Created room was not discoverable");

const alpha = new TestClient("Alpha", alphaPlayerId, roomCode);
const bravo = new TestClient("Bravo", crypto.randomUUID(), roomCode);
let activeAlpha = alpha;

try {
  await Promise.all([alpha.connect(), bravo.connect()]);
  await Promise.all([
    alpha.waitFor((state) => state.players.length === 2),
    bravo.waitFor((state) => state.players.length === 2),
  ]);

  if (alpha.lastState.questionCount < alpha.lastState.settings.totalRounds) {
    assert(alpha.lastState.status === "waiting", "Empty content library did not stay in the lobby");
    alpha.send({ type: "player:ready" });
    bravo.send({ type: "player:ready" });
    await alpha.waitFor((state) => state.status === "waiting" && state.players.every((player) => player.ready));
    alpha.send({ type: "game:start" });
    await alpha.waitForError("NOT_ENOUGH_QUESTIONS");
    assert(alpha.lastState.status === "waiting", "Ready unexpectedly started a game with no real questions");
    console.log(JSON.stringify({ ok: true, mode: "content-changed-after-create", roomCode, readyBlocked: true }, null, 2));
  } else {
  alpha.send({ type: "player:ready" });
  bravo.send({ type: "player:ready" });
  await alpha.waitFor((state) => state.status === "waiting" && state.players.every((player) => player.ready));
  alpha.send({ type: "game:start" });
  let [alphaPreparing, bravoPreparing] = await Promise.all([
    alpha.waitFor((state) => state.status === "round_preparing" && state.round === 1),
    bravo.waitFor((state) => state.status === "round_preparing" && state.round === 1),
  ]);
  assert(alphaPreparing.roundStartedAt === null && alphaPreparing.roundEndsAt === null, "Timer started before asset readiness");
  assert(alphaPreparing.prepareDeadline > Date.now(), "Prepare state has no bounded deadline");
  const [questionAssetResponse, radarAssetResponse] = await Promise.all([
    fetch(new URL(alphaPreparing.currentQuestion.imageUrl, baseUrl)),
    fetch(new URL(`/media/radars/${guessMapId}/${guessLayerId}`, baseUrl)),
  ]);
  assert(questionAssetResponse.ok, `Question media returned ${questionAssetResponse.status}`);
  assert(questionAssetResponse.headers.get("content-type")?.startsWith("image/"), "Question media has the wrong Content-Type");
  assert(radarAssetResponse.ok, `Radar media returned ${radarAssetResponse.status}`);
  assert(radarAssetResponse.headers.get("content-type")?.startsWith("image/"), "Radar media has the wrong Content-Type");
  const preparingPayload = JSON.stringify(alphaPreparing);
  for (const forbiddenKey of ["correctMapId", "correctLayerId", "correctPoint", "worldPosition", "viewAngle", "automaticPoint"]) {
    assert(!preparingPayload.includes(forbiddenKey), `Prepare state leaked ${forbiddenKey}`);
  }

  activeAlpha.close();
  activeAlpha = new TestClient("Alpha", alpha.playerId, roomCode);
  await activeAlpha.connect();
  alphaPreparing = await activeAlpha.waitFor((state) => state.status === "round_preparing" && state.round === 1);
  assert(alphaPreparing.players.find((player) => player.id === alpha.playerId)?.assetReady === false, "Prepare reconnect did not resync readiness");

  if (alphaPreparing.questionCount > alphaPreparing.settings.totalRounds) {
    const failedQuestionId = alphaPreparing.currentQuestion.questionId;
    activeAlpha.send({
      type: "round:asset-error",
      payload: { round: 1, questionId: failedQuestionId, reason: "NETWORK" },
    });
    [alphaPreparing, bravoPreparing] = await Promise.all([
      activeAlpha.waitFor((state) => state.status === "round_preparing" && state.round === 1 && state.currentQuestion.questionId !== failedQuestionId),
      bravo.waitFor((state) => state.status === "round_preparing" && state.round === 1 && state.currentQuestion.questionId !== failedQuestionId),
    ]);
    assert(alphaPreparing.assetPrepareAttempt === 1, "Asset failure did not select the first replacement question");
    assert(alphaPreparing.roundStartedAt === null && alphaPreparing.roundEndsAt === null, "Replacement started the timer early");
  }

  activeAlpha.send({
    type: "round:asset-ready",
    payload: { round: 1, questionId: alphaPreparing.currentQuestion.questionId, loadMs: 2_000 },
  });
  const onePlayerReady = await activeAlpha.waitFor((state) => state.status === "round_preparing" && state.players.find((player) => player.id === alpha.playerId)?.assetReady);
  assert(onePlayerReady.roundStartedAt === null && onePlayerReady.roundEndsAt === null, "One ready player started the timer");
  activeAlpha.send({
    type: "round:asset-ready",
    payload: { round: 1, questionId: alphaPreparing.currentQuestion.questionId, loadMs: 2_000 },
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const duplicateReadyState = activeAlpha.lastState;
  assert(duplicateReadyState.roundStartedAt === null && duplicateReadyState.roundEndsAt === null, "Duplicate asset-ready started or restarted the round");
  assert(duplicateReadyState.prepareDeadline === onePlayerReady.prepareDeadline, "Duplicate asset-ready changed the prepare deadline");
  assert(!activeAlpha.roundStarts.some((payload) => payload.round === 1), "Duplicate asset-ready emitted round:start");
  bravo.send({
    type: "round:asset-ready",
    payload: { round: 1, questionId: bravoPreparing.currentQuestion.questionId, loadMs: 7_000 },
  });
  const [alphaRound, bravoRound] = await Promise.all([
    activeAlpha.waitFor((state) => state.status === "playing" && state.round === 1),
    bravo.waitFor((state) => state.status === "playing" && state.round === 1),
  ]);
  const [alphaRoundStart, bravoRoundStart] = await Promise.all([
    activeAlpha.waitForRoundStart(1),
    bravo.waitForRoundStart(1),
  ]);

  let currentAlphaRound = alphaRound;
  let currentBravoRound = bravoRound;
  assert(JSON.stringify(alphaRound.settings) === JSON.stringify(requestedSettings), "Playing state changed RoomSettings");
  assert(alphaRound.roundEndsAt - alphaRound.roundStartedAt === requestedSettings.roundDurationSeconds * 1_000, "Round deadline ignored RoomSettings");
  assert(alphaRoundStart.roundStartedAt === bravoRoundStart.roundStartedAt, "round:start sent different start times to connected players");
  assert(alphaRoundStart.roundEndsAt === bravoRoundStart.roundEndsAt, "round:start sent different deadlines to connected players");
  assert(alphaRoundStart.roundEndsAt - alphaRoundStart.roundStartedAt === requestedSettings.roundDurationSeconds * 1_000, "round:start duration included prepare time");
  assert(alphaRoundStart.roundDurationSeconds === requestedSettings.roundDurationSeconds, "round:start duration disagrees with RoomSettings");
  assert(Number.isFinite(alphaRoundStart.serverNow), "round:start did not include serverNow");
  assert(alphaRoundStart.stateVersion === bravoRoundStart.stateVersion, "round:start state versions differ");
  const roundsToPlay = alphaRound.settings.totalRounds;
  for (let round = 1; round <= roundsToPlay; round += 1) {
    assert(currentAlphaRound.currentQuestion.questionId === currentBravoRound.currentQuestion.questionId, `Round ${round} question IDs differ`);
    assert(!Object.hasOwn(currentAlphaRound.currentQuestion, "difficulty"), `Round ${round} leaked exact question difficulty`);
    assert(currentAlphaRound.roundEndsAt === currentBravoRound.roundEndsAt, `Round ${round} deadlines differ`);
    assert(/^q-[a-z0-9]+$/.test(currentAlphaRound.currentQuestion.questionId), "Question ID is not opaque");
    assert(/^\/media\/questions\/[A-Za-z0-9_-]{12,80}$/.test(currentAlphaRound.currentQuestion.imageUrl), "Image URL is not opaque");
    const playingPayload = JSON.stringify(currentAlphaRound);
    for (const forbiddenKey of ["correctMapId", "correctLayerId", "correctPoint", "worldPosition", "viewAngle", "acceptedLocations", "locationGuess"]) {
      assert(!playingPayload.includes(forbiddenKey), `Playing state leaked ${forbiddenKey}`);
    }

    if (round === 1) {
      const authoritativeDeadline = currentAlphaRound.roundEndsAt;
      activeAlpha.close();
      activeAlpha = new TestClient("Alpha", alpha.playerId, roomCode);
      await activeAlpha.connect();
      const restoredPlaying = await activeAlpha.waitFor((state) => state.status === "playing" && state.round === 1);
      assert(restoredPlaying.roundEndsAt === authoritativeDeadline, "Playing reconnect changed the authoritative deadline");
    }

    const previousAlphaScore = currentAlphaRound.players.find((player) => player.id === alpha.playerId)?.score;
    assert(typeof previousAlphaScore === "number", `Round ${round} is missing Alpha's starting score`);
    activeAlpha.send({
      type: "guess:submit",
      payload: { round, eventId: crypto.randomUUID(), mapId: guessMapId, layerId: guessLayerId, point: { x: 0.2, y: 0.3 } },
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
      payload: { round, eventId: crypto.randomUUID(), mapId: guessMapId, layerId: guessLayerId, point: { x: 0.8, y: 0.7 } },
    });
    const [alphaResult] = await Promise.all([
      activeAlpha.waitFor((state) => state.status === "round_result" && state.round === round),
      bravo.waitFor((state) => state.status === "round_result" && state.round === round),
    ]);
    assert(alphaResult.roundResult?.correctMapId, "Round result did not reveal the answer");
    assert(requestedSettings.mapPool.includes(alphaResult.roundResult.correctMapId), `Round ${round} selected a question outside the room map pool`);
    assert(alphaResult.roundResult?.correctPoint, "Round result did not reveal the correct point");
    const alphaRoundResult = alphaResult.roundResult.players.find((player) => player.playerId === alpha.playerId);
    const bravoRoundResult = alphaResult.roundResult.players.find((player) => player.playerId === bravo.playerId);
    assert(alphaRoundResult?.pointGuess?.x === 0.2 && alphaRoundResult?.pointGuess?.y === 0.3, "Player 1 point was not preserved");
    assert(bravoRoundResult?.pointGuess?.x === 0.8 && bravoRoundResult?.pointGuess?.y === 0.7, "Player 2 point was not preserved");
    for (const playerResult of [alphaRoundResult, bravoRoundResult]) {
      assert(
        [playerResult.mapScore, playerResult.layerScore, playerResult.locationScore, playerResult.timeBonus, playerResult.points].every(Number.isInteger),
        `Round ${round} exposed a fractional score`,
      );
    }
    const expectedAlphaScore = normalizeScore(previousAlphaScore + alphaRoundResult.points);
    assert(alphaScoreForSelf === expectedAlphaScore, `Round ${round} did not update Alpha's own score immediately`);
    assert(alphaResult.players.find((player) => player.id === alpha.playerId)?.score === expectedAlphaScore, `Round ${round} did not reveal Alpha's score after result`);
    assert(alphaResult.players.every((player) => Number.isInteger(player.score)), `Round ${round} exposed a fractional accumulated score`);
    assert(alphaResult.players.every((player) => player.submitted), "Submission status was not synchronized");

    if (round < roundsToPlay) {
      const [nextAlphaPreparing, nextBravoPreparing] = await Promise.all([
        activeAlpha.waitFor((state) => state.status === "round_preparing" && state.round === round + 1),
        bravo.waitFor((state) => state.status === "round_preparing" && state.round === round + 1),
      ]);
      assert(nextAlphaPreparing.roundStartedAt === null && nextAlphaPreparing.roundEndsAt === null, `Round ${round + 1} timer started during prepare`);
      activeAlpha.send({
        type: "round:asset-ready",
        payload: { round: round + 1, questionId: nextAlphaPreparing.currentQuestion.questionId, loadMs: 1_000 },
      });
      bravo.send({
        type: "round:asset-ready",
        payload: { round: round + 1, questionId: nextBravoPreparing.currentQuestion.questionId, loadMs: 4_000 },
      });
      [currentAlphaRound, currentBravoRound] = await Promise.all([
        activeAlpha.waitFor((state) => state.status === "playing" && state.round === round + 1),
        bravo.waitFor((state) => state.status === "playing" && state.round === round + 1),
      ]);
    }
  }

  const finalState = await activeAlpha.waitFor((state) => state.status === "finished" && state.round === roundsToPlay);
  assert(finalState.players.length === 2, "Final result is missing a player");
  assert(finalState.players.every((player) => Number.isInteger(player.score)), "Final result exposed a fractional total score");
  activeAlpha.send({ type: "game:play-again" });
  const replayState = await activeAlpha.waitFor((state) => state.status === "waiting" && state.round === 0);
  assert(replayState.players.every((player) => player.score === 0 && !player.ready), "Play again did not reset scores and ready state");
  assert(JSON.stringify(replayState.settings) === JSON.stringify(requestedSettings), "Play again did not preserve RoomSettings");

  console.log(JSON.stringify({
    ok: true,
    roomCode,
    roundsCompleted: roundsToPlay,
    answersHiddenDuringRound: true,
    deadlineSynchronized: true,
    otherPlayerScoreHiddenUntilResult: true,
    ownScoreUpdatedImmediately: true,
    reconnectRestored: true,
    prepareReconnectRestored: true,
    timerWaitedForAllAssets: true,
    duplicateAssetReadyIgnored: true,
    authoritativeRoundStartVerified: true,
    assetReplacementVerified: availability.availableQuestions > requestedSettings.totalRounds,
    realMediaRoutesVerified: true,
    gameFinished: true,
    playAgainReset: true,
    roomSettingsPreserved: true,
    integerScoresOnly: true,
    fivePlayerCapacityVerified: true,
    concurrentSixthPlayerRejected: true,
    creatorHostAndStableSlotsVerified: true,
    anonymousSocketBroadcastIsolationVerified: true,
    intentionalLeaveAcknowledged: true,
    waitingHostTransferVerified: true,
    waitingRoomSettingsUpdated: true,
    settingsUpdateResetReady: true,
    transferredHostSettingsAuthorityVerified: true,
    activeMatchSettingsLocked: true,
    updatedInvitePreviewVerified: true,
    activeLeavePreservedQuestion: true,
    twoSurvivorsContinued: true,
    oneSurvivorFinishedCleanly: true,
    hostKickAuthorityVerified: true,
    kickedReconnectInvalidated: true,
    preparingKickBarrierReevaluated: true,
    playingKickBarrierReevaluated: true,
  }, null, 2));
  }
} finally {
  activeAlpha.close();
  bravo.close();
}
