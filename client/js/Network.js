/**
 * Client network related functions
 */

var ws;

var zorPingStart;
var zorPingDuration = 0;
var actorUpdateGap = 0;

// handles to setInterval methods so we can clear them later
var interval_id_heartbeat;

function connectToServer() {
    var uri = new URI(config.BALANCER + ':' + config.PORT);

    ws = new WebSocket( uri.toString() );
    ws.binaryType = 'arraybuffer';

    ws.onopen = function wsOpen () {
        console.log("WebSocket connection established and ready.");
        setupSocket( ws );
    };
}

function sendEnterGame(playerType, playerName, color, key) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({op: 'enter_game', type: playerType, name: playerName, color: color, key: key}));
    }
}

function setupSocket(ws) {
    ws.onmessage = function wsMessage (msg) {
        if (typeof msg.data === "string") {
            var message = JSON.parse(msg.data);

            switch (message.op) {
                case 'init_game':
                    handle_msg_init_game(message);
                    break;
                case 'welcome':
                    handle_msg_welcome(message);
                    break;
                case 'game_setup':
                    handle_msg_game_setup();
                    break;
                case 'player_join':
                    handle_msg_player_join(message);
                    break;
                case 'zor_pong':
                    handle_msg_zor_pong();
                    break;
                case 'captured_player':
                    handle_msg_captured_player(message);
                    break;
                case 'you_died':
                    handle_msg_you_died(message);
                    break;
                case 'player_died':
                    handle_msg_player_died(message);
                    break;
                case 'food_captured':
                    handle_msg_food_captured(message);
                    break;
                case 'server_tick_slow':
                    handle_msg_server_tick_slow(message);
                    break;
                case 'kick':
                    handle_msg_kick(message);
                    break;
                case 'remove_player':
                    handle_msg_remove_player(message);
                    break;
                case 'speeding_warning':
                    handle_msg_speeding_warning();
                    break;
                case 'speed_boost_res':
                    handle_msg_speed_boost_res(message);
                    break;
            }
        }
        else {
            // handle binary message
            handle_msg_actor_updates(msg.data);
        }
    };

    ws.onclose = function wsClose (e) {
        if (e.code != config.CLOSE_NO_RESTART) {
            handleNetworkTermination();
        }
        disconnected = true;
        console.log('Connection closed:', e.code, e.reason);
    };

    ws.onerror = function wsError(e) {
        console.error("Websocket error occured", e);
    };

    function handle_msg_init_game(msg) {
        zorbioModel = msg.model;

        // iterate over actors and create THREE objects that don't serialize over websockets
        var actorIds = Object.getOwnPropertyNames(zorbioModel.actors);
        for (var i = 0, l = actorIds.length; i < l; i++) {
            var actorId = +actorIds[i];  // make sure id is a number
            var actor = zorbioModel.actors[actorId];
            var position = actor.position;
            actor.position = new THREE.Vector3(position.x, position.y, position.z);
        }

        ZOR.UI.on('init', createScene);

        console.log('Game initialzed');
    }

    function handle_msg_welcome(msg) {
        var playerModel = msg.currentPlayer;

        player = new ZOR.PlayerController(playerModel, null, true);
        ZOR.UI.engine.set('player', player.model);

        ws.send(JSON.stringify({op: 'player_ready'}));
    }

    function handle_msg_game_setup() {
        // add player to players and actors
        ZOR.Game.players[player.getPlayerId()] = player;
        zorbioModel.actors[player.model.sphere.id] = player.model.sphere;

        // add player to scene and reset camera
        initCameraAndPlayer();

        gameStart = true;

        setIntervalMethods();

        console.log('Game started!');
    }

    function handle_msg_player_join(message) {
        var newPlayer = message.player;

        if (player && (newPlayer.id === player.getPlayerId())) {
            return; // ignore own join message
        }

        //Add new player if it's already added
        if (!ZOR.Game.players[newPlayer.id]) {
            ZOR.Game.players[newPlayer.id] = new ZOR.PlayerController(newPlayer, scene);
            ZOR.Game.players[newPlayer.id].setAlpha(1);

            //Keep model in sync with the server
            zorbioModel.players[newPlayer.id] = newPlayer;
            zorbioModel.actors[newPlayer.sphere.id] = newPlayer.sphere;
            var position = newPlayer.sphere.position;
            zorbioModel.actors[newPlayer.sphere.id].position = new THREE.Vector3(position.x, position.y, position.z);
        }

        console.log('Player joined: ', newPlayer.id, newPlayer.name);
    }

    function handle_msg_zor_pong() {
        zorPingDuration = Date.now() - zorPingStart;
        console.log('Ping: ' + zorPingDuration + 'ms');
    }

    function handle_msg_actor_updates(arrayBuffer) {

        if (player) {
            // Record gap since last actor update was received
            var nowTime = Date.now();
            actorUpdateGap = nowTime - player.model.au_receive_metric.last_time;
            player.model.au_receive_metric.last_time = nowTime;
        }

        var actorsArray = new Float32Array(arrayBuffer);

        // sync the actors positions from the server model to the client model
        for (var i = 0, l = actorsArray.length; i < l; i += 7) {
            var id = +actorsArray[ i ];
            var actor = zorbioModel.actors[id];

            if (actor) {
                var x = actorsArray[ i + 1 ];
                var y = actorsArray[ i + 2 ];
                var z = actorsArray[ i + 3 ];
                var s = actorsArray[ i + 4 ];
                var drain_target_id = actorsArray[ i + 5 ];
                var speed_boosting = actorsArray[ i + 6 ];

                actor.position.copy({x: x, y: y, z: z});
                actor.scale = s;
                actor.drain_target_id = drain_target_id;

                var playerController = ZOR.Game.players[actor.playerId];
                playerController.setSpeedBoostActive(!!speed_boosting);
            }
        }
    }

    function handle_msg_captured_player(msg) {
        if (!gameStart) return;

        var targetPlayerId = msg.targetPlayerId;

        console.log("YOU CAPTURED PLAYER! ", targetPlayerId);
        var targetPlayer = ZOR.Game.players[targetPlayerId];
        handleSuccessfulPlayerCapture(targetPlayer);
        removePlayerFromGame(targetPlayerId);
    }

    function handle_msg_you_died(msg) {
        if (!gameStart) return;

        var targetPlayer = msg.targetPlayer;
        var attackingPlayerId = msg.attackingPlayerId;
        var timeAlive = Math.floor((targetPlayer.deathTime - targetPlayer.spawnTime) / 1000);

        console.log("YOU DIED! You were alive for " + timeAlive + " seconds. Killed by: ", attackingPlayerId);
        setDeadState();

        var attackingPlayer = zorbioModel.players[attackingPlayerId];
        attackingPlayer.score = config.PLAYER_GET_SCORE(attackingPlayer.sphere.scale);
        targetPlayer.drainAmount = config.PLAYER_GET_SCORE(targetPlayer.drainAmount);

        ZOR.UI.engine.set('attacker', attackingPlayer);
        ZOR.UI.engine.set('player', targetPlayer);
        ZOR.UI.state( ZOR.UI.STATES.RESPAWN_SCREEN );
    }

    function handle_msg_player_died(msg) {
        var attackingPlayerId = msg.attackingPlayerId;
        var targetPlayerId = msg.targetPlayerId;

        if (!player || (attackingPlayerId !== player.getPlayerId())) {
            // someone else killed another player, lets remove it
            console.log("Player died:  ", targetPlayerId);
            removePlayerFromGame(targetPlayerId);
        }
    }

    function handle_msg_food_captured(msg) {
        if (foodController && foodController.isInitialized()) {
            foodController.hideFood( msg.fi );
        }
    }

    function handle_msg_server_tick_slow(msg) {
        if (!gameStart) return;
        handleServerTick(msg.serverTickData);
    }

    function handle_msg_kick(msg) {
        console.log('Server said: ', msg.reason);
        setDeadState();
        handlePlayerKick(msg.reason);
    }

    function handle_msg_remove_player(msg) {
        console.log("received remove_player", msg.playerId);
        removePlayerFromGame(msg.playerId);
    }

    function handle_msg_speeding_warning() {
        if (!gameStart) return;
        console.log("WARNING! You are speeding!");
    }

    function handle_msg_speed_boost_res(msg) {
        console.log("speed boost is valid:", msg.is_valid);
        player.speedBoost();
    }
}

function handleNetworkTermination() {
    setTimeout(location.reload.bind(location), 500);
}

function sendRespawn() {
    gameStart = false;
    ws.send(JSON.stringify({op: 'respawn'}));
}

function sendPing() {
    zorPingStart = Date.now();

    // Send ping to track latency, client heartbeat, and fps
    var fps = Math.round(ZOR.LagScale.get_fps());
    ws.send(JSON.stringify({op: 'zor_ping', lastPing: zorPingDuration, fps: fps}));
}

function setIntervalMethods() {
    // start sending heartbeat
    interval_id_heartbeat = window.setInterval(sendPing, config.HEARTBEAT_PULSE_INTERVAL);
}

function sendPlayerUpdate() {
    var nowTime = Date.now();
    var gap = nowTime - player.model.pp_send_metric.last_time;
    player.model.pp_send_metric.last_time = nowTime;

    var bufferedAmount = ws.bufferedAmount;

    // Make sure model is synced with view
    player.refreshSphereModel();

    var sphereModel = player.model.sphere;

    while (sphereModel.recentPositions.length < 4) {
        player.addRecentPosition();  // make sure we always have at least 4 recent positions
    }

    // for now we only need to send the oldest position and the most recent position
    var oldestPosition = sphereModel.recentPositions[0];
    var prevPosition3  = sphereModel.recentPositions[sphereModel.recentPositions.length - 4];
    var prevPosition2  = sphereModel.recentPositions[sphereModel.recentPositions.length - 3];
    var prevPosition1  = sphereModel.recentPositions[sphereModel.recentPositions.length - 2];
    var latestPosition = sphereModel.recentPositions[sphereModel.recentPositions.length - 1];

    var bufferView = new Float32Array(config.BIN_PP_POSITIONS_LENGTH + (player.food_capture_queue.length * 2));
    var index = 0;
    bufferView[index++] = sphereModel.id;            // Actor ID
    bufferView[index++] = gap;                       // Gap since last pp update
    bufferView[index++] = actorUpdateGap;            // Gap since last au update
    bufferView[index++] = bufferedAmount;            // Amount of bytes currently buffered to send in the ws

    // oldest position
    bufferView[index++] = oldestPosition.position.x; // Old position X
    bufferView[index++] = oldestPosition.position.y; // Old position Y
    bufferView[index++] = oldestPosition.position.z; // Old position Z
    bufferView[index++] = oldestPosition.radius;     // Old radius
    bufferView[index++] = oldestPosition.time;       // Old time

    // Previous positions
    bufferView[index++] = prevPosition3.position.x;
    bufferView[index++] = prevPosition3.position.y;
    bufferView[index++] = prevPosition3.position.z;
    bufferView[index++] = prevPosition3.radius;
    bufferView[index++] = prevPosition3.time;
    bufferView[index++] = prevPosition2.position.x;
    bufferView[index++] = prevPosition2.position.y;
    bufferView[index++] = prevPosition2.position.z;
    bufferView[index++] = prevPosition2.radius;
    bufferView[index++] = prevPosition2.time;
    bufferView[index++] = prevPosition1.position.x;
    bufferView[index++] = prevPosition1.position.y;
    bufferView[index++] = prevPosition1.position.z;
    bufferView[index++] = prevPosition1.radius;
    bufferView[index++] = prevPosition1.time;

    // Latest position
    bufferView[index++] = latestPosition.position.x; // New position X
    bufferView[index++] = latestPosition.position.y; // New position Y
    bufferView[index++] = latestPosition.position.z; // New position Z
    bufferView[index++] = latestPosition.radius;     // New radius
    bufferView[index++] = latestPosition.time;       // New time

    // Now add any queued food captures
    for(var i = 0, l = player.food_capture_queue.length; i < l; i++) {
        var food_cap = player.food_capture_queue[i];
        bufferView[index++] = food_cap.fi;
        bufferView[index++] = food_cap.radius;  //TODO: no need to send radius anymore since all scale is handled on the server
    }

    // clear food queue
    player.food_capture_queue = [];

    // Send player update data
    ws.send(bufferView.buffer);
}

function sendSpeedBoostStart() {
    ws.send(JSON.stringify({op: "speed_boost_start"}));
}

function sendSpeedBoostStop() {
    ws.send(JSON.stringify({op: "speed_boost_stop"}));
}

var throttledSendPlayerUpdate = _.throttle(sendPlayerUpdate, config.TICK_FAST_INTERVAL);


function clearIntervalMethods() {
    window.clearInterval(interval_id_heartbeat);
}
