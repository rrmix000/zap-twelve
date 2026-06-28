const SETTINGS = {
  maxNumber: 12,
};

const DISCORD_SDK_URL = "https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.5.0/+esm";

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
let socket = null;
let reconnectTimer = null;
let roomWasDeleted = false;
let discordSdk = null;

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

function isDiscordLaunch() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("frame_id") ||
    params.has("instance_id") ||
    params.has("instanceId") ||
    (params.has("platform") && (params.has("channel_id") || params.has("guild_id")))
  );
}

async function loadConfig() {
  const response = await fetch("/api/config", {
    headers: {
      "content-type": "application/json",
    },
  });
  if (!response.ok) throw new Error("Config failed");
  return response.json();
}

async function setupDiscord() {
  if (!isDiscordLaunch()) return;

  try {
    const config = await loadConfig();
    if (!config.discordClientId) return;

    const { DiscordSDK } = await import(DISCORD_SDK_URL);
    discordSdk = new DiscordSDK(config.discordClientId);
    await discordSdk.ready();

    if (!roomId && discordSdk.instanceId) {
      roomId = discordSdk.instanceId.slice(0, 80);
    }
  } catch (error) {
    console.warn("Discord SDK setup skipped", error);
  }
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

function connectRoom() {
  if (!roomId) {
    renderRoom();
    return;
  }

  roomWasDeleted = false;
  if (socket) socket.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(roomId)}&participant=${encodeURIComponent(participantId)}`;
  socket = new WebSocket(url);

  socket.addEventListener("message", (event) => {
    handleSocketMessage(event.data);
  });

  socket.addEventListener("close", (event) => {
    if (event.code === 4001) return;
    if (event.code === 4000) {
      roomWasDeleted = true;
      currentState = null;
      renderClosed(event.reason);
      return;
    }
    if (roomWasDeleted) return;
    reconnectTimer = window.setTimeout(connectRoom, 1200);
  });

  socket.addEventListener("error", () => {
    renderError(new Error("Connection error"));
  });
}

function handleSocketMessage(rawMessage) {
  const message = JSON.parse(rawMessage);
  if (message.type === "state") {
    currentState = message.state;
    render();
    return;
  }
  if (message.type === "roomClosed") {
    roomWasDeleted = true;
    currentState = null;
    renderClosed(message.reason);
    return;
  }
  if (message.type === "error") {
    renderError(new Error(message.message));
  }
}

function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    renderError(new Error("Connection is not ready"));
    return false;
  }
  socket.send(JSON.stringify({ participantId, ...message }));
  return true;
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
  connectRoom();
}

function postJoin(role) {
  const name = ids("nameInput").value.trim();
  if (!name) {
    ids("nameInput").focus();
    renderJoin(currentState);
    return;
  }
  sendMessage({ type: "join", name, role });
}

function postAction(action, payload = {}) {
  sendMessage({ type: "action", action, payload });
  selectedNumber = null;
}

function postPreviewSeat(number) {
  sendMessage({ type: "action", action: "previewSeat", payload: { number } });
}

function postPreviewTrap(number) {
  sendMessage({ type: "action", action: "previewTrap", payload: { number } });
}

function renderError(error) {
  ids("waitTitle").textContent = "ERROR";
  ids("waitText").textContent = error instanceof Error ? error.message : "Something went wrong";
  ids("watchGrid").replaceChildren();
  showScreen("wait");
}

function renderClosed(reason = "closed") {
  ids("resetButton").disabled = true;
  ids("waitTitle").textContent = "ROOM DELETED";
  ids("waitText").textContent = reason === "inactive" ? "操作がなかったため部屋を削除しました" : "部屋は削除されました";
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
  const canReset = isPlayer(role) && state.phase !== "gameOver";
  button.disabled = !canReset;

  if (!canReset) {
    button.textContent = "ルーム削除";
    return;
  }

  button.textContent = state.players[role].deleteRequested ? "削除取消" : "ルーム削除";
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
      if (state.phase === "trap") {
        postPreviewTrap(number);
      } else if (state.phase === "seat") {
        postPreviewSeat(number);
      }
    },
  });

  showScreen("game");
}

function renderWait(state) {
  const role = meRole(state);
  const turnRole = state.phase === "trap" ? state.game.trapper : state.game.sitter;
  const trapPreview = state.phase === "trap" ? state.game.previewTrap : null;
  const trapNumber = state.game.trappedNumber || trapPreview;
  const seatPreview = state.phase === "seat" ? state.game.previewSeat : null;
  ids("waitTitle").textContent = state.phase === "trap" ? `${playerName(state, turnRole)} 仕掛け` : `${playerName(state, turnRole)} 座る`;
  ids("waitText").textContent = waitText(state, role, trapPreview, seatPreview);

  if (state.phase === "trap" || state.phase === "seat") {
    buildResultGrid(ids("watchGrid"), seatPreview, trapNumber, {
      lockedSeats: state.game.occupiedSeats,
    });
  } else {
    ids("watchGrid").replaceChildren();
  }

  showScreen("wait");
}

function waitText(state, role, trapPreview, seatPreview) {
  if (role === "spectator") {
    if (state.phase === "trap") {
      return trapPreview ? `${playerName(state, state.game.trapper)} 仕掛け: ${trapPreview}` : `${playerName(state, state.game.trapper)} 仕掛け中`;
    }
    if (state.phase === "seat") {
      return seatPreview ? `${playerName(state, state.game.sitter)} 座る: ${seatPreview}` : `${playerName(state, state.game.sitter)} 選択中`;
    }
    return "観戦中";
  }

  if (state.phase === "seat" && role === state.game.trapper && seatPreview) {
    return `相手の選択: ${seatPreview}`;
  }

  return "相手の操作待ち";
}

function renderResult(state) {
  const result = state.game.pendingResult;
  if (!result) {
    ids("resultKicker").textContent = state.phase === "gameOver" ? "GAME OVER" : "RESULT";
    ids("resultTitle").textContent = state.game.winner?.winner ? `${playerName(state, state.game.winner.winner)} WIN` : "DRAW";
    ids("resultText").textContent = state.phase === "gameOver" ? `${state.game.winner?.message || ""} / 更新すると結果は消えます` : state.game.winner?.message || "";
    ids("resultGrid").replaceChildren();
  } else {
    ids("resultKicker").textContent = result.shock ? "Zap!" : "SAFE";
    ids("resultTitle").textContent = state.phase === "gameOver" ? resultTitleForWinner(state) : result.shock ? "Zap!" : "SAFE";
    const baseText = result.shock ? `${playerName(state, result.player)} ×${state.game.strikes[result.player]}` : `${playerName(state, result.player)} +${result.points}`;
    ids("resultText").textContent = state.phase === "gameOver" ? `${baseText} / 更新すると結果は消えます` : baseText;
    buildResultGrid(ids("resultGrid"), result.seat, result.trappedNumber);
  }

  screens.result.classList.toggle("is-shock", Boolean(result?.shock));
  screens.result.classList.toggle("is-safe", Boolean(result && !result.shock));

  const role = meRole(state);
  ids("nextButton").disabled = state.phase === "gameOver" || !isPlayer(role);
  ids("nextButton").textContent = state.phase === "gameOver" ? "ROOM DELETED" : "NEXT";
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
    button.innerHTML = `<span>${number}</span><small>${resultGridLabel(number, { guessedNumber, trappedNumber, locked })}</small>`;
    target.append(button);
  }
}

function resultGridLabel(number, { guessedNumber, trappedNumber, locked }) {
  if (number === guessedNumber && number === trappedNumber) return "Zap";
  if (number === guessedNumber) return "SIT";
  if (number === trappedNumber) return "TRAP";
  if (locked) return "LOCK";
  return "PT";
}

ids("joinAButton").addEventListener("click", () => postJoin("A"));
ids("joinBButton").addEventListener("click", () => postJoin("B"));
ids("watchButton").addEventListener("click", () => postJoin("spectator"));
ids("roomButton").addEventListener("click", enterRoom);
ids("roomInput").addEventListener("input", renderRoom);
ids("roomInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") enterRoom();
});
ids("nameInput").addEventListener("input", () => {
  if (currentState && !meRole(currentState)) renderJoin(currentState);
});
ids("lockInButton").addEventListener("click", () => postAction("lockIn"));
ids("confirmButton").addEventListener("click", () => {
  if (selectedNumber === null || !currentState) return;
  const type = currentState.phase === "trap" ? "setTrap" : "chooseSeat";
  postAction(type, { number: selectedNumber });
});
ids("nextButton").addEventListener("click", () => {
  if (!currentState) return;
  if (currentState.phase !== "gameOver") postAction("next");
});
ids("resetButton").addEventListener("click", () => {
  if (!currentState) return;
  const role = meRole(currentState);
  const type = currentState.players[role]?.deleteRequested ? "cancelDelete" : "requestDelete";
  postAction(type);
});

async function start() {
  await setupDiscord();

  if (roomId) {
    ids("roomInput").value = roomId;
    connectRoom();
  } else {
    renderRoom();
  }
}

start();
