const SETTINGS = {
  maxNumber: 12,
  maxStrikes: 3,
  winningScore: 40,
};

const ROLE_A = "A";
const ROLE_B = "B";
const ROLE_SPECTATOR = "spectator";
const PLAYER_ROLES = [ROLE_A, ROLE_B];

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function error(message, status = 400) {
  return json({ error: message }, { status });
}

function emptyPlayer() {
  return {
    id: null,
    name: "",
    lockedIn: false,
    resetRequested: false,
  };
}

function initialGame() {
  return {
    round: 1,
    trapper: ROLE_B,
    sitter: ROLE_A,
    trappedNumber: null,
    previewSeat: null,
    pendingResult: null,
    scores: { A: 0, B: 0 },
    strikes: { A: 0, B: 0 },
    occupiedSeats: [],
    history: [],
    winner: null,
  };
}

function initialState() {
  return {
    phase: "lobby",
    version: 0,
    players: {
      A: emptyPlayer(),
      B: emptyPlayer(),
    },
    spectators: [],
    settings: {
      revealTrapToSpectators: true,
    },
    game: initialGame(),
  };
}

function otherRole(role) {
  return role === ROLE_A ? ROLE_B : ROLE_A;
}

function isPlayerRole(role) {
  return PLAYER_ROLES.includes(role);
}

function isSeatAvailable(game, number) {
  return number >= 1 && number <= SETTINGS.maxNumber && !game.occupiedSeats.includes(number);
}

function getParticipantRole(state, participantId) {
  if (state.players.A.id === participantId) return ROLE_A;
  if (state.players.B.id === participantId) return ROLE_B;
  if (state.spectators.some((spectator) => spectator.id === participantId)) return ROLE_SPECTATOR;
  return null;
}

function publicState(state, participantId = null) {
  const role = participantId ? getParticipantRole(state, participantId) : null;
  const canSeeTrap =
    state.game.trappedNumber !== null &&
    (role === state.game.trapper || state.settings.revealTrapToSpectators || state.phase === "result" || state.phase === "gameOver");
  const canSeePreview = state.phase === "seat" && (role === state.game.trapper || role === state.game.sitter);

  return {
    ...state,
    me: {
      id: participantId,
      role,
    },
    game: {
      ...state.game,
      trappedNumber: canSeeTrap ? state.game.trappedNumber : null,
      previewSeat: canSeePreview ? state.game.previewSeat : null,
    },
  };
}

function sanitizeName(name) {
  const value = typeof name === "string" ? name.trim() : "";
  return value.slice(0, 16);
}

function assertParticipant(body) {
  if (!body || typeof body.participantId !== "string" || body.participantId.trim() === "") {
    throw new Error("participantId is required");
  }
  return body.participantId.trim();
}

function bump(state) {
  state.version += 1;
  return state;
}

function resetGameOnly(state) {
  state.phase = "trap";
  state.players.A.lockedIn = true;
  state.players.B.lockedIn = true;
  state.players.A.resetRequested = false;
  state.players.B.resetRequested = false;
  state.game = initialGame();
  return bump(state);
}

function resetRoomCompletely(state) {
  const next = initialState();
  next.version = state.version + 1;
  return next;
}

function joinState(state, body) {
  const participantId = assertParticipant(body);
  const name = sanitizeName(body.name);
  const role = body.role;

  if (!name) {
    throw new Error("name is required");
  }

  state.spectators = state.spectators.filter((spectator) => spectator.id !== participantId);
  for (const playerRole of PLAYER_ROLES) {
    if (state.players[playerRole].id === participantId) {
      state.players[playerRole] = emptyPlayer();
    }
  }

  if (isPlayerRole(role)) {
    if (state.players[role].id && state.players[role].id !== participantId) {
      throw new Error(`${role} is already taken`);
    }
    state.players[role] = {
      id: participantId,
      name,
      lockedIn: false,
      resetRequested: false,
    };
  } else if (role === ROLE_SPECTATOR) {
    state.spectators.push({ id: participantId, name });
  } else {
    throw new Error("role must be A, B, or spectator");
  }

  return bump(state);
}

function maybeAutoStart(state) {
  if (
    state.phase === "lobby" &&
    state.players.A.id &&
    state.players.B.id &&
    state.players.A.lockedIn &&
    state.players.B.lockedIn
  ) {
    state.phase = "trap";
    state.game = initialGame();
  }
  return state;
}

function lockIn(state, participantId) {
  const role = getParticipantRole(state, participantId);
  if (!isPlayerRole(role)) throw new Error("Only A or B can lock in");
  if (state.phase !== "lobby") throw new Error("Lock in is only available in lobby");

  state.players[role].lockedIn = true;
  maybeAutoStart(state);
  return bump(state);
}

function setTrap(state, participantId, payload) {
  if (state.phase !== "trap") throw new Error("Not trap phase");
  const role = getParticipantRole(state, participantId);
  if (role !== state.game.trapper) throw new Error("Not your trap turn");

  const number = Number(payload?.number);
  if (!isSeatAvailable(state.game, number)) throw new Error("Seat is not available");

  state.game.trappedNumber = number;
  state.game.previewSeat = null;
  state.game.pendingResult = null;
  state.phase = "seat";
  return bump(state);
}

function previewSeat(state, participantId, payload) {
  if (state.phase !== "seat") return state;
  const role = getParticipantRole(state, participantId);
  if (role !== state.game.sitter) throw new Error("Not your seat turn");

  const number = Number(payload?.number);
  if (!isSeatAvailable(state.game, number)) throw new Error("Seat is not available");

  state.game.previewSeat = number;
  return bump(state);
}

function chooseSeat(state, participantId, payload) {
  if (state.phase !== "seat") throw new Error("Not seat phase");
  const role = getParticipantRole(state, participantId);
  if (role !== state.game.sitter) throw new Error("Not your seat turn");

  const number = Number(payload?.number);
  if (!isSeatAvailable(state.game, number)) throw new Error("Seat is not available");

  const shock = number === state.game.trappedNumber;
  if (shock) {
    state.game.strikes[role] += 1;
    state.game.scores[role] = 0;
  } else {
    state.game.scores[role] += number;
    state.game.occupiedSeats.push(number);
  }

  const entry = {
    round: state.game.round,
    player: role,
    seat: number,
    points: shock ? 0 : number,
    shock,
    trappedNumber: state.game.trappedNumber,
  };
  state.game.history.push(entry);
  state.game.previewSeat = null;
  state.game.pendingResult = entry;
  state.game.winner = getOutcome(state.game);
  state.phase = state.game.winner ? "gameOver" : "result";
  return bump(state);
}

function isRoundComplete(game) {
  const played = new Set(game.history.filter((entry) => entry.round === game.round).map((entry) => entry.player));
  return played.has(ROLE_A) && played.has(ROLE_B);
}

function getOutcome(game) {
  if (game.strikes.A >= SETTINGS.maxStrikes) return { type: "strikes", winner: ROLE_B, message: "A ×3" };
  if (game.strikes.B >= SETTINGS.maxStrikes) return { type: "strikes", winner: ROLE_A, message: "B ×3" };
  if (game.scores.A > SETTINGS.winningScore) return { type: "score", winner: ROLE_A, message: "A 40+" };
  if (game.scores.B > SETTINGS.winningScore) return { type: "score", winner: ROLE_B, message: "B 40+" };

  if (game.occupiedSeats.length >= SETTINGS.maxNumber - 1) {
    if (game.scores.A === game.scores.B) return { type: "lastSeat", winner: null, message: "DRAW" };
    const winner = game.scores.A > game.scores.B ? ROLE_A : ROLE_B;
    return { type: "lastSeat", winner, message: "LAST SEAT" };
  }

  return null;
}

function nextTurn(state, participantId) {
  if (state.phase !== "result") throw new Error("Next is only available after result");
  const role = getParticipantRole(state, participantId);
  if (!isPlayerRole(role)) throw new Error("Only A or B can continue");

  state.game.trappedNumber = null;
  state.game.previewSeat = null;
  state.game.pendingResult = null;

  if (isRoundComplete(state.game)) {
    state.game.round += 1;
    state.game.trapper = ROLE_B;
    state.game.sitter = ROLE_A;
  } else {
    state.game.trapper = ROLE_A;
    state.game.sitter = ROLE_B;
  }

  state.phase = "trap";
  return bump(state);
}

function requestReset(state, participantId) {
  const role = getParticipantRole(state, participantId);
  if (!isPlayerRole(role)) throw new Error("Only A or B can request reset");
  state.players[role].resetRequested = true;

  if (state.players.A.resetRequested && state.players.B.resetRequested) {
    return resetRoomCompletely(state);
  }

  return bump(state);
}

function resetRoom(state, participantId) {
  const role = getParticipantRole(state, participantId);
  if (!isPlayerRole(role)) throw new Error("Only A or B can reset room");
  return resetRoomCompletely(state);
}

function cancelReset(state, participantId) {
  const role = getParticipantRole(state, participantId);
  if (!isPlayerRole(role)) throw new Error("Only A or B can cancel reset");
  state.players[role].resetRequested = false;
  return bump(state);
}

function applyAction(state, body) {
  const participantId = assertParticipant(body);
  switch (body.type) {
    case "lockIn":
      return lockIn(state, participantId);
    case "setTrap":
      return setTrap(state, participantId, body.payload);
    case "previewSeat":
      return previewSeat(state, participantId, body.payload);
    case "chooseSeat":
      return chooseSeat(state, participantId, body.payload);
    case "next":
      return nextTurn(state, participantId);
    case "requestReset":
      return requestReset(state, participantId);
    case "cancelReset":
      return cancelReset(state, participantId);
    case "resetRoom":
      return resetRoom(state, participantId);
    default:
      throw new Error("Unknown action type");
  }
}

export class GameRoom {
  constructor(state) {
    this.state = state;
  }

  async readState() {
    return (await this.state.storage.get("room")) || initialState();
  }

  async writeState(state) {
    await this.state.storage.put("room", state);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const participantId = url.searchParams.get("participant");

    try {
      if (request.method === "GET" && url.pathname === "/api/state") {
        const state = await this.readState();
        return json(publicState(state, participantId));
      }

      if (request.method === "POST" && url.pathname === "/api/join") {
        const body = await request.json();
        const state = joinState(await this.readState(), body);
        await this.writeState(state);
        return json(publicState(state, body.participantId));
      }

      if (request.method === "POST" && url.pathname === "/api/action") {
        const body = await request.json();
        const state = applyAction(await this.readState(), body);
        await this.writeState(state);
        return json(publicState(state, body.participantId));
      }

      return error("Not found", 404);
    } catch (caught) {
      return error(caught instanceof Error ? caught.message : "Unknown error");
    }
  }
}

function roomFromRequest(request) {
  const url = new URL(request.url);
  const room = url.searchParams.get("room") || "local";
  return room.slice(0, 80);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const roomName = roomFromRequest(request);
      const id = env.GAME_ROOM.idFromName(roomName);
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
