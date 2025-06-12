const socket = io();

// Worker Script (worker.js) as inline Blob
const workerCode = `
  let countdown;
  let endTime;
  let timerInterval = null;

  self.onmessage = function(e) {
    if (e.data.command === 'start') {
      countdown = e.data.duration;
      endTime = Date.now() + countdown * 1000;

      if (timerInterval) clearInterval(timerInterval);

      timerInterval = setInterval(() => {
        const timeLeft = Math.round((endTime - Date.now()) / 1000);
        postMessage(timeLeft);

        if (timeLeft <= 0) {
          clearInterval(timerInterval);
          postMessage(-1);
        }
      }, 200); // update interval
    } else if (e.data.command === 'stop') {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  };
`;

// Create Blob from the worker code
const workerBlob = new Blob([workerCode], {
  type: 'application/javascript'
});
const workerURL = URL.createObjectURL(workerBlob);
const worker = new Worker(workerURL);

const player_name = document.body.dataset.name;
const room = document.body.dataset.room;
let currentPlayer = null;
let original_player = null;
let spelling = null;
let submit_click = 1;


socket.emit("join", {
  player_name: player_name,
  room: room
});

document.getElementById("submitBtn").style.display = "none";
document.getElementById("wordInput").disabled = true;

worker.onmessage = function (e) {
  const countdown = e.data;
  const timer = document.getElementById("timer");
  if (timer) {
    timer.textContent = countdown >= 0 ? `⏳ ${countdown}s ⏳` : `⏳ 0s ⏳`;
  }

  if (countdown < 0) {
    if (original_player === player_name) {
      socket.emit("reduce_life", {
        room: room,
        player: player_name,
        lives: submit_click
      });
    }
  }
};

socket.on("player_update", (players) => {
  const playersDiv = document.querySelector(".players");
  playersDiv.innerHTML = "";
  players.forEach((p) => {
    const highlightClass = (p === currentPlayer) ? "highlight" : "";
    playersDiv.innerHTML += `
      <div class="player ${highlightClass}">
        <div>${p}</div>
        <div class="lives">❤️❤️❤️</div>
      </div>
    `;
  });
});

socket.on("player_update_with_lives", (players) => {
  const playersDiv = document.querySelector(".players");
  playersDiv.innerHTML = "";
  players.forEach(({
    name,
    lives
  }) => {
    const highlightClass = (name === currentPlayer) ? "highlight" : "";
    const heartIcons = "❤️".repeat(lives);
    playersDiv.innerHTML += `
      <div class="player ${highlightClass}">
        <div>${name}</div>
        <div class="lives">${heartIcons}</div>
      </div>
    `;
  });
});



socket.on("next_turn", (data) => {
  worker.postMessage({
    command: 'stop'
  }); // stop existing timer
  currentPlayer = data.player;
  const countdownDuration = data.duration || 10;
  spelling = null;

  document.querySelector('.prompt').textContent = data.word2;

  document.querySelectorAll(".players .player").forEach(playerDiv => {
    const nameDiv = playerDiv.querySelector("div:first-child");
    if (nameDiv.textContent === currentPlayer) {
      original_player = nameDiv.textContent;
      setupPlayerTurn();
      playerDiv.classList.add("highlight");
    } else {
      playerDiv.classList.remove("highlight");
    }
  });

  function setupPlayerTurn() {
    if (original_player === player_name) {
      document.getElementById("submitBtn").style.display = "inline-block";
      document.getElementById("submitBtn").disabled = false;
      document.getElementById("wordInput").disabled = false;
    } else {
      document.getElementById("submitBtn").style.display = "none";
      document.getElementById("wordInput").disabled = true;
    }
    document.getElementById("startBtn").style.display = "none";
  }

  worker.postMessage({
    command: 'start',
    duration: countdownDuration
  });
});

document.getElementById("startBtn").addEventListener("click", () => {
  document.getElementById("startBtn").style.display = "none";
  socket.emit("game_start", {
    room: room
  });
});

document.getElementById("submitBtn").addEventListener("click", () => {
  submit_Code();
});

document.getElementById("submitBtn").addEventListener("touchstart", () => {
  submit_Code();
});


document.getElementById("wordInput").addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault(); // prevent default form submission if any
    if (!document.getElementById("submitBtn").disabled) {
      submit_Code(); // call the same function as the submit button
    }
  }
});


function submit_Code() {
  document.getElementById("submitBtn").disabled = true;
  const word = document.getElementById("wordInput").value.toLowerCase();
  const part = document.querySelector('.prompt').textContent;

  socket.emit("spell_check", {
    word: word,
    room: room,
    part: part
  });
}

socket.on("spell_check_result", (data) => {
  spelling = data.result;

  if (spelling === 'correct') {
    worker.postMessage({
      command: 'stop'
    });
    document.getElementById("timer").textContent = `⏳ 0s ⏳`;
    document.getElementById("wordInput").disabled = true;
    document.getElementById("submitBtn").style.display = "none";
    submit_click = 0;

    if (original_player === player_name) {
      socket.emit("reduce_life", {
        room: room,
        player: player_name,
        lives: submit_click
      });
    }
  } else {
    // This part handles when the spelling is incorrect
    document.getElementById("submitBtn").disabled = false;
    document.getElementById("wordInput").disabled = false;
  }
});


socket.on("life_update", (data) => {
  submit_click = 1;
  document.getElementById('wordInput').value = '';
  document.querySelectorAll(".players .player").forEach(playerDiv => {
    const nameDiv = playerDiv.querySelector("div:first-child");
    const livesDiv = playerDiv.querySelector(".lives");
    if (nameDiv.textContent === data.player) {
      livesDiv.textContent = "❤️".repeat(data.lives);
    }
  });
});

socket.on("player_eliminated", (data) => {
  document.querySelectorAll(".players .player").forEach(playerDiv => {
    const nameDiv = playerDiv.querySelector("div:first-child");
    if (nameDiv.textContent === data.player) {
      playerDiv.classList.add("eliminated");
    }
  });
});

socket.on("game_over", (data) => {
  worker.postMessage({
    command: 'stop'
  });
  const winner = data.winner;
  document.querySelector('.prompt').textContent = `Winner: ${winner}`;
  document.getElementById("submitBtn").style.display = "none";
  document.getElementById("restartbtn").style.display = "inline-block";
  showWinMessage();

});

document.getElementById("restartbtn").addEventListener("click", function () {
  const name1 = document.body.dataset.name;
  const room1 = document.body.dataset.room;
  window.location.href = `/?name=${name1}&room=${room1}`;
});


socket.on("broadcast_word_input", (data) => {
  // Only update if it's not the current player
  if (data.player !== player_name) {
    const inputField = document.getElementById("wordInput");
    inputField.value = data.word;
    inputField.disabled = true;
    inputField.style.color = "black";
  }
});


socket.on("game_already_started", () => {
  alert("Game is already started. You can't join now.");
  window.location.href = "/"; // or redirect somewhere else
});

function showWinMessage() {
  document.getElementById('congratsMessage').style.display = 'block';
  
  // Confetti animation
  confetti({
    particleCount: 150,
    spread: 70,
    origin: { y: 0.6 }
  });

  // You can trigger multiple bursts if you like:
  setTimeout(() => {
    confetti({
      particleCount: 100,
      spread: 60,
      origin: { y: 0.6 }
    });
  }, 1000);
}
