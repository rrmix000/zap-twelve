const SETTINGS = {
  maxNumber: 12,
};

const screens = {
  room: document.querySelector("#roomScreen"),
  join: document.querySelector("#joinScreen"),
  lobby: document.querySelector("#lobbyScreen"),
  game: document.querySelector("#gameScreen"),
  wait: document.querySelector("#waitScreen"),
  result: document.querySelector("#resultScreen"),
};

const ids = (id) => document.querySelector(`#${id}`);

const participantId = getOrCreateParticipantId();
let roomId = getInitialRoomId();

let currentState = null;
let selectedNumber = null;
let lastTurnKey = "";
let polling = false;

function getOrCreateParticipantId() {
  const params = new URLSearchParams(window.location.search);
  const debugParticipant = params.get("participant");
  if (debugParticipant) return debugParticipant.slice(0, 80);

  const key = "zap-twelve-participant-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

function getInitialRoomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("room") || params.get("instance_id") || params.get("instanceId") || "";
}

function showScreen(name) {
  Object.entries(screens).forEach(([screenName, element]) => {
    element.classList.toggle("hidden", screenName !== name);
  });
  ids("scoreboardSection").classList.toggle("hidden", name === "room");
}

function playerName(state, role) {
  return state.players[role]?.name || role;
}

function meRole(state) {
  return state.me?.role || null;
}

function isPlayer(role) {
  return role === "A" || role === "B";
}

function isMyTurn(state) {
  const role = meRole(state);
  return (state.phase === "trap" && state.game.trapper === role) || (state.phase === "seat" && state.game.sitter === role);
}

async function request(path, options = {}) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${separator}room=${encodeURIComponent(roomId)}&participant=${encodeURIComponent(participantId)}`, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Request failed");
  return data;
}

async function fetchState() {
  if (!roomId) {
    renderRoom();
    return;
  }
  if (polling) return;
  polling = true;
  try {
    currentState = await request("/api/state");
    render();
  } catch (error) {
    renderError(error);
  } finally {
    polling = false;
  }
}

function enterRoom() {
  const value = ids("roomInput").value.trim();
  if (!value) {
    ids("roomInput").focus();
    return;
  }

  roomId = value.slice(0, 80);
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  window.history.replaceState({}, "", url);
  fetchState();
}

async function postJoin(role) {
  const name = ids("nameInput").value.trim();
  if (!name) {
    ids("nameInput").focus();
    renderJoin(currentState);
    return;
  }
  currentState = await request("/api/join", {
    method: "POST",
    body: JSON.stringify({ participantId, name, role }),
  });
  render();
}

async function postAction(type, payload = {}) {
  currentState = await request("/api/action", {
    method: "POST",
    body: JSON.stringify({ participantId, type, payload }),
  });
  if ((type === "resetRoom" || type === "requestReset") && !meRole(currentState)) {
    ids("nameInput").value = "";
  }
  selectedNumber = null;
  render();
}

function postPreviewSeat(number) {
  request("/api/action", {
    method: "POST",
    body: JSON.stringify({ participantId, type: "previewSeat", payload: { number } }),
  }).catch(() => {});
}

function renderError(error) {
  ids("waitTitle").textContent = "ERROR";
  ids("waitText").textContent = error instanceof Error ? error.message : "Something went wrong";
  ids("watchGrid").replaceChildren();
  showScreen("wait");
}

function render() {
  if (!currentState) return;

  updateScoreboard(currentState);
  updateResetButton(currentState);

  const turnKey = `${currentState.phase}:${currentState.game.round}:${currentState.game.trapper}:${currentState.game.sitter}`;
  if (turnKey !== lastTurnKey) {
    selectedNumber = null;
    lastTurnKey = turnKey;
  }

  const role = meRole(currentState);
  if (!role) {
    renderJoin(currentState);
    return;
  }

  if (currentState.phase === "lobby") {
    renderLobby(currentState);
    return;
  }

  if (currentState.phase === "result" || currentState.phase === "gameOver") {
    renderResult(currentState);
    return;
  }

  if (isMyTurn(currentState)) {
    renderGame(currentState);
    return;
  }

  renderWait(currentState);
}

function renderRoom() {
  ids("resetButton").disabled = true;
  ids("roomButton").disabled = ids("roomInput").value.trim().length === 0;
  showScreen("room");
}

function updateScoreboard(state) {
  ids("roundNumber").textContent = `ROUND ${state.game.round}`;
  ids("seatCounter").textContent = `SEATS ${SETTINGS.maxNumber - state.game.occupiedSeats.length}`;
  renderScoreboard(state);
}

function renderScoreboard(state) {
  const head = ids("scoreboardHead");
  const body = ids("scoreboardBody");
  const latestHistoryRound = state.game.history.reduce((latest, entry) => Math.max(latest, entry.round), 1);
  const roundCount = Math.max(state.game.round, latestHistoryRound, 1);

  const headerRow = document.createElement("tr");
  ["PLAYER", ...Array.from({ length: roundCount }, (_, index) => index + 1), "TOTAL"].forEach((label, index) => {
    const cell = document.createElement("th");
    if (index === 0) cell.scope = "col";
    cell.textContent = label;
    headerRow.append(cell);
  });
  head.replaceChildren(headerRow);

  const rows = ["A", "B"].map((role) => {
    const row = document.createElement("tr");
    row.classList.toggle("is-active", state.phase !== "gameOver" && state.game.sitter === role && state.phase !== "lobby");

    const playerCell = document.createElement("th");
    playerCell.scope = "row";
    playerCell.textContent = playerName(state, role);
    row.append(playerCell);

    for (let round = 1; round <= roundCount; round += 1) {
      const entry = state.game.history.find((item) => item.round === round && item.player === role);
      const cell = document.createElement("td");
      if (entry) {
        cell.textContent = entry.shock ? "×" : entry.points;
        cell.className = entry.shock ? "is-shock" : "is-score";
      } else {
        cell.textContent = " ";
      }
      cell.classList.toggle(
        "is-current",
        !entry && state.phase !== "gameOver" && state.phase !== "lobby" && state.game.sitter === role && round === state.game.round,
      );
      row.append(cell);
    }

    const totalCell = document.createElement("td");
    totalCell.className = "score-total";
    totalCell.textContent = state.game.scores[role];
    row.append(totalCell);
    return row;
  });

  body.replaceChildren(...rows);
}

function updateResetButton(state) {
  const role = meRole(state);
  const button = ids("resetButton");
  const canReset = isPlayer(role) && state.phase !== "lobby";
  button.disabled = !canReset;

  if (!canReset) {
    button.textContent = "RESET";
    return;
  }

  button.textContent = state.players[role].resetRequested ? "CANCEL" : "RESET";
}

function renderJoin(state) {
  const hasName = ids("nameInput").value.trim().length > 0;
  ids("joinAButton").disabled = !hasName || Boolean(state.players.A.id);
  ids("joinBButton").disabled = !hasName || Boolean(state.players.B.id);
  ids("watchButton").disabled = !hasName;
  showScreen("join");
}

function renderLobby(state) {
  const role = meRole(state);
  ids("lobbyTitle").textContent = role === "spectator" ? "WATCHING" : "LOCK IN";
  ids("lobbySeats").replaceChildren(seatCard(state, "A"), seatCard(state, "B"));

  const canLockIn = isPlayer(role) && !state.players[role].lockedIn;
  ids("lockInButton").disabled = !canLockIn;
  ids("lockInButton").textContent = canLockIn ? "LOCK IN" : "WAIT";
  showScreen("lobby");
}

function seatCard(state, role) {
  const player = state.players[role];
  const card = document.createElement("div");
  card.className = "seat-card";
  card.classList.toggle("is-me", meRole(state) === role);

  const label = document.createElement("strong");
  label.textContent = role;

  const name = document.createElement("span");
  name.textContent = player.id ? player.name : "EMPTY";

  const status = document.createElement("small");
  status.className = player.lockedIn ? "status-pill is-ready" : "status-pill";
  status.textContent = player.lockedIn ? "LOCKED" : "OPEN";

  card.append(label, name, status);
  return card;
}

function renderGame(state) {
  const mode = state.phase;
  ids("turnKicker").textContent = mode === "trap" ? "仕掛け" : "座る";
  ids("turnTitle").textContent = mode === "trap" ? playerName(state, state.game.trapper) : playerName(state, state.game.sitter);
  ids("turnText").textContent = "選んで決定";
  ids("confirmButton").disabled = selectedNumber === null;
  ids("confirmButton").textContent = "決定";

  buildNumberGrid(ids("numberGrid"), state, {
    selectedNumber,
    onClick(number) {
      selectedNumber = number;
      renderGame(state);
      if (state.phase === "seat") {
        postPreviewSeat(number);
      }
    },
  });

  showScreen("game");
}

function renderWait(state) {
  const role = meRole(state);
  const turnRole = state.phase === "trap" ? state.game.trapper : state.game.sitter;
  const canSeePreview = state.phase === "seat" && role === state.game.trapper && state.game.previewSeat;
  ids("waitTitle").textContent = state.phase === "trap" ? `${playerName(state, turnRole)} 仕掛け` : `${playerName(state, turnRole)} 座る`;
  ids("waitText").textContent = canSeePreview
    ? `相手の選択: ${state.game.previewSeat}`
    : role === "spectator"
      ? "観戦中"
      : "相手の操作待ち";

  if (state.game.trappedNumber) {
    buildResultGrid(ids("watchGrid"), canSeePreview ? state.game.previewSeat : null, state.game.trappedNumber, {
      lockedSeats: state.game.occupiedSeats,
    });
  } else {
    ids("watchGrid").replaceChildren();
  }

  showScreen("wait");
}

function renderResult(state) {
  const result = state.game.pendingResult;
  if (!result) {
    ids("resultKicker").textContent = state.phase === "gameOver" ? "GAME OVER" : "RESULT";
    ids("resultTitle").textContent = state.game.winner?.winner ? `${playerName(state, state.game.winner.winner)} WIN` : "DRAW";
    ids("resultText").textContent = state.game.winner?.message || "";
    ids("resultGrid").replaceChildren();
  } else {
    ids("resultKicker").textContent = result.shock ? "Zap!" : "SAFE";
    ids("resultTitle").textContent = state.phase === "gameOver" ? resultTitleForWinner(state) : result.shock ? "Zap!" : "SAFE";
    ids("resultText").textContent = result.shock ? `${playerName(state, result.player)} ×${state.game.strikes[result.player]}` : `${playerName(state, result.player)} +${result.points}`;
    buildResultGrid(ids("resultGrid"), result.seat, result.trappedNumber);
  }

  screens.result.classList.toggle("is-shock", Boolean(result?.shock));
  screens.result.classList.toggle("is-safe", Boolean(result && !result.shock));

  const role = meRole(state);
  ids("nextButton").disabled = !isPlayer(role);
  ids("nextButton").textContent = state.phase === "gameOver" ? "RESET ROOM" : "NEXT";
  showScreen("result");
}

function resultTitleForWinner(state) {
  if (!state.game.winner) return "RESULT";
  if (!state.game.winner.winner) return "DRAW";
  return `${playerName(state, state.game.winner.winner)} WIN`;
}

function numberButton(number, state, options = {}) {
  const disabled = state.game.occupiedSeats.includes(number);
  const button = document.createElement("button");
  button.className = disabled ? "number-button is-locked" : "number-button";
  button.classList.toggle("is-selected", number === options.selectedNumber);
  button.type = "button";
  button.disabled = disabled || !options.onClick;
  button.setAttribute("aria-label", disabled ? `${number} locked` : `${number}`);
  button.innerHTML = `<span>${number}</span><small>${disabled ? "LOCK" : "PT"}</small>`;
  if (options.onClick && !disabled) {
    button.addEventListener("click", () => options.onClick(number));
  }
  return button;
}

function buildNumberGrid(target, state, options = {}) {
  target.replaceChildren();
  for (let number = 1; number <= SETTINGS.maxNumber; number += 1) {
    target.append(numberButton(number, state, options));
  }
}

function buildResultGrid(target, guessedNumber, trappedNumber, options = {}) {
  const lockedSeats = options.lockedSeats || [];
  target.replaceChildren();
  for (let number = 1; number <= SETTINGS.maxNumber; number += 1) {
    const locked = lockedSeats.includes(number);
    const button = document.createElement("button");
    button.className = "number-button";
    button.type = "button";
    button.disabled = true;
    button.classList.toggle("is-locked", locked);
    button.classList.toggle("is-guess", number === guessedNumber);
    button.classList.toggle("is-trap", number === trappedNumber);
    button.classList.toggle("is-hit", number === guessedNumber && number === trappedNumber);
    button.innerHTML = `<span>${number}</span><small>${locked ? "LOCK" : "PT"}</small>`;
    target.append(button);
  }
}

ids("joinAButton").addEventListener("click", () => postJoin("A").catch(renderError));
ids("joinBButton").addEventListener("click", () => postJoin("B").catch(renderError));
ids("watchButton").addEventListener("click", () => postJoin("spectator").catch(renderError));
ids("roomButton").addEventListener("click", enterRoom);
ids("roomInput").addEventListener("input", renderRoom);
ids("roomInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") enterRoom();
});
ids("nameInput").addEventListener("input", () => {
  if (currentState && !meRole(currentState)) renderJoin(currentState);
});
ids("lockInButton").addEventListener("click", () => postAction("lockIn").catch(renderError));
ids("confirmButton").addEventListener("click", () => {
  if (selectedNumber === null || !currentState) return;
  const type = currentState.phase === "trap" ? "setTrap" : "chooseSeat";
  postAction(type, { number: selectedNumber }).catch(renderError);
});
ids("nextButton").addEventListener("click", () => {
  if (!currentState) return;
  const type = currentState.phase === "gameOver" ? "resetRoom" : "next";
  postAction(type).catch(renderError);
});
ids("resetButton").addEventListener("click", () => {
  if (!currentState) return;
  const role = meRole(currentState);
  const type = currentState.players[role]?.resetRequested ? "cancelReset" : "requestReset";
  postAction(type).catch(renderError);
});

if (roomId) {
  ids("roomInput").value = roomId;
  fetchState();
} else {
  renderRoom();
}
setInterval(fetchState, 1000);
