from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from collections import defaultdict
from spell_checker import get_random_2_letter, check_part_in_word
from flask_ngrok import run_with_ngrok


app = Flask(__name__)

# run_with_ngrok(app)  # Start ngrok when running the app

socketio = SocketIO(app)
players = defaultdict(dict)          # room -> { sid: name }
players_name = {}                    # room -> list of player names
index_map = {}                       # room -> index for turns
game_loops = {}                      # room -> function to trigger next turn
player_lives = defaultdict(lambda: defaultdict(
    lambda: 3))  # room -> { name: lives }
game_started = {}  # room -> bool
current_player = {}  # room -> current player's name


@app.route("/")
def home():
    return render_template("home.html")


@app.route("/waiting_players", methods=["POST", "GET"])
def waiting_players():
    name = request.form.get("name")
    room = request.form.get("room").upper()
    if game_started.get(room, False):
        return render_template("body_bomb.html", name=name, room=room)
    if room in players_name:
        players_name[room].append(name)
    else:
        players_name[room] = [name]
        index_map[room] = 0
    return render_template("body_bomb.html", name=name, room=room)


@socketio.on("game_start")
def handle_game_start(data):
    room = data["room"]
    game_started[room] = True  # Mark game as started
    start_game_loop(room)


@socketio.on("join")
def handle_join(data):
    name = data["player_name"]
    room = data["room"]
    sid = request.sid

    if game_started.get(room, False):  # Game already started
        # Send message to only this client
        emit("game_already_started", {}, room=sid)
        return

    join_room(room)
    players[room][sid] = name
    player_lives[room][name] = 3  # Initialize lives
    emit("player_update", list(players[room].values()), room=room)


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    for room in list(players.keys()):
        if sid in players[room]:
            name = players[room].pop(sid)

            if name in players_name[room]:
                players_name[room].remove(name)

            leave_room(room)
            # emit("player_update", list(players[room].values()), room=room)
            player_list = [
                {"name": name, "lives": player_lives[room][name]} for name in players[room].values()
            ]
            emit("player_update_with_lives", player_list, room=room)

            # Check if current player disconnected
            if current_player.get(room) == name:
                # Reduce life to 0 and eliminate
                player_lives[room][name] = 0
                socketio.emit("player_eliminated", {"player": name}, room=room)

                # Check if only one player is left
            if len(players_name[room]) == 1:
                winner = players_name[room][0]
                socketio.emit("game_over", {"winner": winner}, room=room)
                game_started[room] = False
            else:
                # Switch to next player
                if room in game_loops:
                    game_loops[room]()

            # Cleanup if room is empty
            if len(players_name[room]) == 0:
                players.pop(room, None)
                players_name.pop(room, None)
                index_map.pop(room, None)
                game_loops.pop(room, None)
                player_lives.pop(room, None)
                game_started.pop(room, None)
                current_player.pop(room, None)

            break


def start_game_loop(room):
    def send_next_turn():
        if room not in players_name or len(players_name[room]) == 0:
            return
        index = index_map.get(room, 0)
        index %= len(players_name[room])
        pl_name = players_name[room][index]
        index_map[room] = index + 1
        current_player[room] = pl_name  # 🔴 Store current player here

        socketio.emit("next_turn", {
            "player": pl_name,
            "duration": 20,
            "word2": get_random_2_letter()
        }, room=room)
    game_loops[room] = send_next_turn
    send_next_turn()


@socketio.on("spell_check")
def spell_check(data):
    room = data["room"]
    word = data["word"]
    part = data["part"]

    player_name = players[room][request.sid]

    if check_part_in_word(part, word):
        socketio.emit("spell_check_result", {"result": "correct"}, room=room)
    else:
        socketio.emit("spell_check_result", {"result": "incorrect"}, room=room)

    # Broadcast the submitted word to all other players
    socketio.emit("broadcast_word_input", {
        "player": player_name,
        "word": word
    }, room=room)


@socketio.on("next_turn_request")
def handle_next_turn(data):
    room = data["room"]
    if room in game_loops:
        game_loops[room]()


@socketio.on("reduce_life")
def handle_reduce_life(data):
    room = data["room"]
    player = data["player"]
    life = data["lives"]
    if room in player_lives and player in player_lives[room]:
        player_lives[room][player] -= life
        lives_left = player_lives[room][player]
        socketio.emit("life_update", {
            "player": player,
            "lives": lives_left
        }, room=room)
        if lives_left <= 0:
            if player in players_name[room]:
                players_name[room].remove(player)
            socketio.emit("player_eliminated", {
                "player": player
            }, room=room)
            # 🟡 Check if only 1 player left, and emit game over
            if len(players_name[room]) == 1:
                winner = players_name[room][0]
                socketio.emit("game_over", {
                    "winner": winner
                }, room=room)
                game_started[room] = False  # Reset game started flag
                return  # ✅ Stop further execution if game is over
    if room in game_loops:
        game_loops[room]()


if __name__ == "__main__":
    # socketio.run(app)
    app.run()
