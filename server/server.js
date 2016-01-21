var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var config = require('../common/config.js');

// Load ThreeJS, so we have access to the same vector and matrix functions the
// client uses
global.self = {}; // threejs expects there to be a global named 'self'... for some reason..
var THREE = require('three.js');

var Zorbio = require('../common/zorbio.js');
var Validators = require('./Validators.js');
var UTIL = require('../common/util.js');

// this array holds multiple game instances.  when one fills up, a new one is
// created.
//var Zorbios = [];

// max players per game instance
//var MAX_PLAYERS = 32;

var model = new Zorbio.Model(config.WORLD_SIZE, config.FOOD_DENSITY);

// Define sockets as a hash so we can use string indexes
var sockets = {};

app.use(express.static(__dirname + '/../client'));

io.on('connection', function (socket) {
    console.log("Player connected: ", JSON.stringify(socket.handshake));

    // Handle new connection
    var type = socket.handshake.query.type;
    var name = socket.handshake.query.name;
    var color = socket.handshake.query.color;

    // Create the Player
    var currentPlayer = undefined;

    socket.on('respawn', function (isFirstSpawn) {
        var position = UTIL.safePlayerPosition();
        currentPlayer = new Zorbio.Player(socket.id, name, color, type, position);

        socket.emit('welcome', currentPlayer, isFirstSpawn);
        console.log('User ' + currentPlayer.id + ' spawning into the game');
    });

    socket.on('gotit', function (player, isFirstSpawn) {
        console.log('Player ' + player.id + ' connecting');

        if (!UTIL.validNick(player.name)) {
            socket.emit('kick', 'Invalid username');
            socket.disconnect();
        } else {
            console.log('Player ' + player.id + ' connected!');
            sockets[player.id] = socket;
            currentPlayer.lastHeartbeat = Date.now();

            if (model.players[player.id]) {
                // if current player is already in the players remove them
                delete model.players[player.id];
            }

            // Add the player to the players object
            model.players[player.id] = currentPlayer;

            model.addActor(currentPlayer.sphere);

            io.emit('playerJoin', currentPlayer);

            // Pass any data to the for final setup
            socket.emit('gameSetup', model, isFirstSpawn);

            console.log('Total players: ' + Object.getOwnPropertyNames(model.players).length);
        }
    });

    /**
     * This message is sent by all clients every 40ms so keep this function as fast and light as possible
     */
    socket.on('myPosition', function (sphere) {
        currentPlayer.lastHeartbeat = Date.now();

        var err = Validators.movement(sphere, model);
        if (err === 0) {
            var actor = model.actors[sphere.id];

            // update the players position in the model
            var latestPosition = sphere.positions[sphere.positions.length - 1];
            actor.position = latestPosition.position;
            actor.scale = sphere.scale;

            // Recent positions
            actor.recentPositions.push({position: actor.position, radius: actor.scale, time: latestPosition.time});
            if (actor.recentPositions.length > config.PLAYER_POSITIONS_WINDOW) {
                actor.recentPositions.shift();  // remove the oldest position
            }
        } else {
            switch (err) {
                case Validators.ErrorCodes.SPEED_TO_FAST:
                    socket.emit('speedingWarning');
                    model.players[currentPlayer.id].infractions_speed++;
                    break;
            }
        }
    });

    socket.on('foodCapture', function (fi, sphere_id, radius) {
        currentPlayer.lastHeartbeat = Date.now();

        var err = Validators.foodCapture(model, fi, sphere_id, radius);
        if (err === 0) {
            model.food_respawning[fi] = config.FOOD_RESPAWN_TIME;

            // grow player on the server to track growth validation
            currentPlayer.sphere.growExpected( config.FOOD_GET_VALUE(radius) );

            // notify clients of food capture so they can update their food view
            io.emit('foodCaptureComplete', fi);
        } else {
            switch (err) {
                case Validators.ErrorCodes.FOOD_CAPTURE_TO_FAR:
                    // inform client of invalid capture, and make them shrink, mark infraction
                    socket.emit('invalidFoodCapture', fi, config.FOOD_VALUE);
                    model.players[currentPlayer.id].infractions_food++;
                    break;
            }
        }
    });

    socket.on('playerCapture', function (attackingPlayerId, targetPlayerId, sendingSphere) {
        currentPlayer.lastHeartbeat = Date.now();

        console.log("received playerCapture: ", attackingPlayerId, targetPlayerId, sendingSphere.id);

        var err = Validators.playerCapture(attackingPlayerId, targetPlayerId, model, sendingSphere);
        if (err === 0) {
            if (!Zorbio.pendingPlayerCaptures[targetPlayerId]) {
                console.log("Valid Player capture: ", attackingPlayerId, targetPlayerId);
                sockets[attackingPlayerId].emit('processingPlayerCapture', targetPlayerId);
                Zorbio.pendingPlayerCaptures[targetPlayerId] = config.PENDING_PLAYER_CAPTURE_TTL;
            }
        } else {
            switch (err) {
                case Validators.ErrorCodes.PLAYER_NOT_IN_MODEL:
                    // let the attacking player know this capture was invalid
                    console.log("Validators.playerCapture: targetPlayerId not in model: ", targetPlayerId);
                    sockets[attackingPlayerId].emit('invalidCaptureTargetNotInModel', attackingPlayerId, targetPlayerId);
                    if (socket[targetPlayerId]) {
                        // if the target is still connected, let them know they aren't being captured
                        sockets[attackingPlayerId].emit('invalidCaptureTargetNotInModel', attackingPlayerId, targetPlayerId);
                    }
                    break;
                case Validators.ErrorCodes.PLAYER_CAPTURE_TO_FAR:
                    // the player who is connected to this socket is probably cheating
                    console.log("Invalid player capture distance to far", attackingPlayerId, targetPlayerId, currentPlayer.id);
                    socket.emit("invalidCaptureTargetToFar", attackingPlayerId, targetPlayerId);
                    model.players[currentPlayer.id].infractions_pcap++;
                    break;
            }
        }
    });

    socket.on('continuePlayerCapture', function (attackingPlayerId, targetPlayerId) {
        currentPlayer.lastHeartbeat = Date.now();

        console.log("received continuePlayerCapture: ", attackingPlayerId, targetPlayerId);
        capturePlayer(attackingPlayerId, targetPlayerId);
    });

    socket.on('playerHeartbeat', function () {
        currentPlayer.lastHeartbeat = Date.now();
    });

    socket.on('error', function (err) {
        console.error(err.stack);
        //TODO: handle error cleanup
    });

    socket.on('disconnect', function () {
        // don't remove player on disconnect, let heartbeat clean them up, this should prevent logout griefing
        console.log('User ' + currentPlayer.id + ' disconnected');
    });

    socket.on('ping', function () {
        socket.emit('pong');
    });
});

function sendActorUpdates() {
    var actorUpdates = {};

    // make the payload as small as possible, send only what's needed on the client
    var actorIds = Object.getOwnPropertyNames(model.actors);
    for (var i = 0, l = actorIds.length; i < l; i++) {
        var id = actorIds[i];
        actorUpdates[id] = {position: model.actors[id].position, scale: model.actors[id].scale};
    }

    // Send actors to the client for updates
    io.emit('actorPositions', actorUpdates);
}

function checkHeartbeats() {
    var time = Date.now();

    var playerIds = Object.getOwnPropertyNames(model.players);
    for (var i = 0, l = playerIds.length; i < l; i++) {
        var id = playerIds[i];
        var player = model.players[id];
        if (player && player.lastHeartbeat) {
            if ((time - player.lastHeartbeat) > config.HEARTBEAT_TIMEOUT) {
                var msg = "You were kicked because last heartbeat was over " + (config.HEARTBEAT_TIMEOUT / 1000) + " seconds ago.";
                console.log('kicking player', id, msg);
                kickPlayer(id, msg);
            }
        }
    }
}

function capturePlayer(attackingPlayerId, targetPlayerId) {
    console.log("capturePlayer: ", attackingPlayerId, targetPlayerId);

    // grow the attacking player the expected amount
    var attackingSphere = model.players[attackingPlayerId].sphere;
    var targetSphere = model.players[targetPlayerId].sphere;
    attackingSphere.growExpected( config.PLAYER_CAPTURE_VALUE( targetSphere.radius() ) );

    // Inform the attacking player that capture was successful
    sockets[attackingPlayerId].emit('successfulCapture', targetPlayerId);

    // Inform the target player that they died
    sockets[targetPlayerId].emit('youDied', attackingPlayerId);

    // Inform other clients that target player died
    io.emit("playerDied", attackingPlayerId, targetPlayerId);

    // processing is done so clear processing state for target player
    delete Zorbio.pendingPlayerCaptures[targetPlayerId];

    removePlayerFromModel(targetPlayerId);
}

function removePlayerFromModel(playerId) {
    var actorId = 0;
    if (model.players[playerId]) {
        // remove player from model
        actorId = model.players[playerId].sphere.id;
        delete model.players[playerId];
    }
    if (model.actors[actorId]) {
        delete model.actors[actorId];
    }
}

function removePlayerSocket(playerId) {
    if (sockets[playerId]) {
        sockets[playerId].disconnect();
        delete sockets[playerId];
    }
}

function kickPlayer(playerId, reason) {
    console.log('kicking player: ', playerId, reason);

    // notify player
    sockets[playerId].emit('kick', reason);

    // notify other clients
    io.emit('playerKicked', playerId);

    removePlayerFromModel(playerId);
    removePlayerSocket(playerId);
}

function updateFoodRespawns() {
    // keep a current reference of which food indexes are respawning
    model.food_respawning_indexes = [];

    for (var i = 0, l = model.food_respawning.length; i < l; ++i) {
        if (model.food_respawning[i] > 0) {
            model.food_respawning[i] = Math.max(  model.food_respawning[i] - config.SERVER_TICK_INTERVAL, 0 );

            if (model.food_respawning[i] === 0) {
                // queue up food respawn to send to clients
                model.food_respawn_ready_queue.push(i);
            } else {
                model.food_respawning_indexes.push(i);
            }
        }
    }
}

/**
 * Send any updates to client per server tick
 */
function sendServerTickData() {
    var serverTickData = {"fr": model.food_respawn_ready_queue};
    io.emit('serverTick', serverTickData);
    model.food_respawn_ready_queue = [];
}

/**
 * Any player checks that need to be done during serverTick, put here.
 */
function playersChecks() {
    // Iterate over all players and perform checks
    var playerIds = Object.getOwnPropertyNames(model.players);
    for (var i = 0, l = playerIds.length; i < l; i++) {
        var id = playerIds[i];
        var player = model.players[id];

        // Check for infractions
        if (player.infractions_food > config.INFRACTION_TOLERANCE_FOOD) {
            kickPlayer(id, "You were kicked because you had to many food infractions: " + player.infractions_food);
        }
        else if (player.infractions_pcap > config.INFRACTION_TOLERANCE_PCAP) {
            kickPlayer(id, "You were kicked because you had to many player capture infractions: " + player.infractions_pcap);
        }
        else if (player.infractions_speed > config.INFRACTION_TOLERANCE_SPEED) {
            kickPlayer(id, "You were kicked because you had to many speed infractions: " + player.infractions_speed);
        }
        else if (player.infractions_scale > config.INFRACTION_TOLERANCE_SCALE) {
            kickPlayer(id, "You were kicked because you had to many size infractions: " + player.infractions_scale);
        }
        else if (Validators.playerScale(player) !== 0) {
            player.infractions_scale++;
        }
    }
}

/**
 * Main server loop for general updates to the client that don't have to be real-time, e.g. food respawns
 */
function serverTick() {
    updateFoodRespawns();
    sendServerTickData();
    playersChecks();

    // expire pending player captures
    Zorbio.expirePendingPlayerCaptures();
}

setInterval(sendActorUpdates, config.ACTOR_UPDATE_INTERVAL);
setInterval(serverTick, config.SERVER_TICK_INTERVAL);

if (config.HEARTBEAT_ENABLE) {
    setInterval(checkHeartbeats, config.HEARTBEAT_CHECK_INTERVAL);
}

var serverPort = process.env.PORT || config.PORT;
http.listen(serverPort, function () {
    console.log("Server is listening on http://localhost:" + serverPort);
});
